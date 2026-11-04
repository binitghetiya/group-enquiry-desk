/**
 * Vercel serverless entry. `scripts/build-vercel.mjs` bundles this file into a single function
 * that receives every /api/* request. Static files are served by Vercel's CDN, not Express.
 *
 * The app (database client, schema check, Express setup) is created once per instance and
 * reused across invocations while the instance stays warm.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Express } from 'express';
import { createProvider } from './ai/provider';
import { createApp } from './app';
import { loadConfig } from './config/env';
import { openDb } from './db/db';

let appPromise: Promise<Express> | undefined;

async function init(): Promise<Express> {
  const config = { ...loadConfig(), clientDist: undefined };
  const db = await openDb(config.database);
  return createApp({ config, db, llm: createProvider(config.ai) });
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // A failed start (bad secret, unreachable database) is retried on the next request.
  appPromise ??= init().catch((err: unknown) => {
    appPromise = undefined;
    throw err;
  });

  let app: Express;
  try {
    app = await appPromise;
  } catch (err) {
    // Log the reason (it names a setting, never a secret value); return the app's generic error.
    console.error(`[vercel] startup failed: ${(err as Error)?.message ?? 'unknown error'}`);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: { code: 'INTERNAL', message: 'Something went wrong. Please try again later.' } }));
    return;
  }
  app(req as Parameters<Express>[0], res as Parameters<Express>[1]);
}
