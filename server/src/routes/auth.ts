import bcrypt from 'bcryptjs';
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app';
import { findUserByEmail, findUserById } from '../db/users';
import { asyncHandler, HttpError } from '../lib/http';
import { csrfProtect, issueCsrfToken } from '../middleware/csrf';
import { makeLimiter } from '../middleware/rateLimit';

export const SESSION_COOKIE = 'ged.sid';
export const BCRYPT_COST = 12;

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(3).max(254),
  password: z.string().min(1).max(200),
});

// Compared against when the email is unknown, so response time does not reveal which accounts exist.
let dummyHash: string | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync('not-a-real-password', BCRYPT_COST));

function regenerate(req: Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
}

export function authRouter({ config, db }: AppDeps): Router {
  const router = Router();
  const loginLimiter = makeLimiter(config.loginLimit, config.ipHashSecret, 'login');

  router.post(
    '/login',
    loginLimiter,
    asyncHandler(async (req, res) => {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'VALIDATION_ERROR', 'Email and password are required.');

      const user = findUserByEmail(db, parsed.data.email);
      const valid = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? getDummyHash());
      if (!user || !valid) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');

      await regenerate(req); // prevents session fixation
      req.session.userId = user.id;
      const csrfToken = issueCsrfToken(req);
      res.json({ user: { id: user.id, email: user.email, role: user.role }, csrfToken });
    }),
  );

  router.get('/me', (req, res) => {
    const user = req.session.userId ? findUserById(db, req.session.userId) : undefined;
    if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Please sign in.');
    const csrfToken = req.session.csrfToken ?? issueCsrfToken(req);
    res.json({ user, csrfToken });
  });

  router.post('/logout', csrfProtect, (req, res, next) => {
    req.session.destroy((err) => {
      if (err) {
        next(err);
        return;
      }
      res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'strict', secure: config.isProd });
      res.status(204).end();
    });
  });

  return router;
}
