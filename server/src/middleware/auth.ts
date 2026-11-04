import type { RequestHandler } from 'express';
import type { DB } from '../db/db';
import { findUserById, type AuthUser, type Role } from '../db/users';
import { HttpError } from '../lib/http';

declare module 'express-session' {
  interface SessionData {
    userId?: number;
    csrfToken?: string;
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const RANK: Record<Role, number> = { staff: 1, admin: 2 };

/**
 * Requires a signed-in user with at least `minRole`. The user is re-read from the database on
 * every request, so a deleted user or downgraded role takes effect immediately.
 */
export function requireRole(db: DB, minRole: Role): RequestHandler {
  return (req, _res, next) => {
    const userId = req.session.userId;
    if (!userId) {
      next(new HttpError(401, 'UNAUTHENTICATED', 'Please sign in.'));
      return;
    }
    const user = findUserById(db, userId);
    if (!user) {
      req.session.destroy(() => undefined);
      next(new HttpError(401, 'UNAUTHENTICATED', 'Please sign in.'));
      return;
    }
    if (RANK[user.role] < RANK[minRole]) {
      next(new HttpError(403, 'FORBIDDEN', 'You do not have permission to do this.'));
      return;
    }
    req.user = user;
    next();
  };
}
