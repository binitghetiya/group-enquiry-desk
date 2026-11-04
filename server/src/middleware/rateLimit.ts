import rateLimit from 'express-rate-limit';
import type { RateLimitConfig } from '../config/env';
import { hashIp } from '../lib/ipHash';

/** In-memory limiter keyed by hashed IP. A shared store (e.g. Redis) is needed for >1 instance. */
export function makeLimiter(cfg: RateLimitConfig, ipHashSecret: string, name: string) {
  return rateLimit({
    windowMs: cfg.windowMs,
    limit: cfg.limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => `${name}:${hashIp(ipHashSecret, req.ip)}`,
    handler: (_req, res) => {
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a few minutes and try again.' },
      });
    },
  });
}
