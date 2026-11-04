import rateLimit from 'express-rate-limit';
import type { RateLimitConfig } from '../config/env';
import type { DB } from '../db/db';
import { hashIp } from '../lib/ipHash';
import { DbRateLimitStore } from './rateLimitStore';

/**
 * Limiter keyed by hashed IP. Counters live in the database (not process memory) so the limit
 * holds across serverless instances. Each limiter gets its own store instance and key prefix.
 */
export function makeLimiter(db: DB, cfg: RateLimitConfig, ipHashSecret: string, name: string) {
  return rateLimit({
    windowMs: cfg.windowMs,
    limit: cfg.limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: new DbRateLimitStore(db, `${name}:`),
    keyGenerator: (req) => hashIp(ipHashSecret, req.ip),
    handler: (_req, res) => {
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a few minutes and try again.' },
      });
    },
  });
}
