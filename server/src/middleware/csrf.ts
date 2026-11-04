import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { HttpError } from '../lib/http';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Synchronizer token, stored server-side in the session and sent by the SPA as X-CSRF-Token. */
export function issueCsrfToken(req: Request): string {
  const token = randomBytes(32).toString('base64url');
  req.session.csrfToken = token;
  return token;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Defence in depth on top of SameSite=Strict cookies: every state-changing request from a
 * signed-in user must carry the session's CSRF token in a custom header.
 */
export const csrfProtect: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  const expected = req.session.csrfToken;
  const given = req.get('x-csrf-token');
  if (!expected || !given || !safeEqual(expected, given)) {
    next(new HttpError(403, 'CSRF_FAILED', 'Security token missing or invalid. Reload the page and try again.'));
    return;
  }
  next();
};
