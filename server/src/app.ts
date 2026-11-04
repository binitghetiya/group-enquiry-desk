import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { LlmProvider } from './ai/provider';
import type { AppConfig } from './config/env';
import type { DB } from './db/db';
import { requireRole } from './middleware/auth';
import { csrfProtect } from './middleware/csrf';
import { apiNotFound, errorHandler, requestId } from './middleware/errors';
import { aiRouter } from './routes/ai';
import { authRouter, SESSION_COOKIE } from './routes/auth';
import { enquiriesRouter } from './routes/enquiries';
import { publicRouter } from './routes/public';

export interface AppDeps {
  config: AppConfig;
  db: DB;
  llm: LlmProvider;
}

export function createApp(deps: AppDeps): express.Express {
  const { config, db } = deps;
  const app = express();

  app.set('trust proxy', config.trustProxy);
  app.use(requestId);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'"],
          'img-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
          'frame-ancestors': ["'none'"],
          'form-action': ["'self'"],
        },
      },
    }),
  );

  // Responses may contain personal data: never cache them.
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '16kb', strict: true }));
  app.use(
    session({
      name: SESSION_COOKIE,
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'strict', secure: config.isProd, maxAge: 8 * 60 * 60 * 1000 },
      // Default MemoryStore is fine for a single-process prototype; use a persistent store in production.
    }),
  );

  app.use('/api/public', publicRouter(deps));
  app.use('/api/auth', authRouter(deps));
  app.use('/api/enquiries', requireRole(db, 'staff'), csrfProtect, enquiriesRouter(deps));
  app.use('/api/ai', requireRole(db, 'admin'), csrfProtect, aiRouter(deps));
  app.use('/api', apiNotFound);

  // Production: serve the built React app from the same origin.
  if (config.isProd && config.clientDist && existsSync(config.clientDist)) {
    const dist = config.clientDist;
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(join(dist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
