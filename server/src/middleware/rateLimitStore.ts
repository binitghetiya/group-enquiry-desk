import type { ClientRateLimitInfo, Options, Store } from 'express-rate-limit';
import type { DB } from '../db/db';

const SWEEP_EVERY = 200;

/**
 * Fixed-window counters in the app database, so every serverless instance enforces the same
 * limit. One upsert per request: it starts a fresh window when the old one has expired,
 * otherwise increments, and returns the new count atomically.
 */
export class DbRateLimitStore implements Store {
  readonly localKeys = false;
  private windowMs = 60_000;

  constructor(
    private readonly db: DB,
    readonly prefix: string,
  ) {}

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const now = Date.now();
    const row = await this.db.get<{ hits: number; reset_at: number }>(
      `INSERT INTO rate_limits (key, hits, reset_at) VALUES (@key, 1, @now + @windowMs)
       ON CONFLICT (key) DO UPDATE SET
         hits     = CASE WHEN rate_limits.reset_at <= @now THEN 1 ELSE rate_limits.hits + 1 END,
         reset_at = CASE WHEN rate_limits.reset_at <= @now THEN @now + @windowMs ELSE rate_limits.reset_at END
       RETURNING hits, reset_at`,
      { key: this.prefix + key, now, windowMs: this.windowMs },
    );
    if (Math.random() < 1 / SWEEP_EVERY) await this.db.run(`DELETE FROM rate_limits WHERE reset_at <= ?`, [now]);
    return { totalHits: row?.hits ?? 1, resetTime: new Date(row?.reset_at ?? now + this.windowMs) };
  }

  async decrement(key: string): Promise<void> {
    await this.db.run(`UPDATE rate_limits SET hits = MAX(hits - 1, 0) WHERE key = ?`, [this.prefix + key]);
  }

  async resetKey(key: string): Promise<void> {
    await this.db.run(`DELETE FROM rate_limits WHERE key = ?`, [this.prefix + key]);
  }
}
