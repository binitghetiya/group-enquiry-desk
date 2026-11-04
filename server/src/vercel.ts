/**
 * Vercel entry for the `server` service (see vercel.json). Vercel runs this Express app as one
 * Vercel Function and routes every public /api/* request to it with the original path intact.
 * Static files are served by the separate `client` service, not by Express.
 *
 * The real app needs async setup (database connection and idempotent schema check), so this
 * outer app creates it once per instance on the first request and reuses it while warm.
 */
import express, { type Express } from 'express';
import { createProvider } from './ai/provider';
import { createApp } from './app';
import { loadConfig } from './config/env';
import { openDb } from './db/db';

let appPromise: Promise<Express> | undefined;

async function init(): Promise<Express> {
  const config = loadConfig();
  const db = await openDb(config.database);
  return createApp({ config, db, llm: createProvider(config.ai) });
}

const app = express();
app.disable('x-powered-by');

app.use((req, res, next) => {
  // A failed start (bad secret, unreachable database) is retried on the next request.
  appPromise ??= init().catch((err: unknown) => {
    appPromise = undefined;
    throw err;
  });
  appPromise.then(
    (inner) => inner(req, res, next),
    (err: unknown) => {
      // Log the reason (it names a setting, never a secret value); return the app's generic error.
      console.error(`[vercel] startup failed: ${(err as Error)?.message ?? 'unknown error'}`);
      res
        .status(500)
        .set('Cache-Control', 'no-store')
        .json({ error: { code: 'INTERNAL', message: 'Something went wrong. Please try again later.' } });
    },
  );
});

export default app;
