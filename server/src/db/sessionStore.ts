import session from 'express-session';
import type { DB } from './db';

const FALLBACK_TTL_MS = 8 * 60 * 60 * 1000;
/** Roughly one write in this many also sweeps expired rows, so no cron job is needed. */
const SWEEP_EVERY = 100;

function expiryOf(sess: session.SessionData): number {
  const expires = sess.cookie?.expires;
  const at = expires ? new Date(expires).getTime() : Number.NaN;
  return Number.isFinite(at) ? at : Date.now() + (sess.cookie?.maxAge ?? FALLBACK_TTL_MS);
}

/**
 * express-session store backed by the app database. Serverless instances share no memory, so
 * sessions must live somewhere every instance can read. The cookie only carries the signed ID.
 */
export class DbSessionStore extends session.Store {
  constructor(private readonly db: DB) {
    super();
  }

  override get(sid: string, cb: (err: unknown, sess?: session.SessionData | null) => void): void {
    this.db
      .get<{ sess: string }>(`SELECT sess FROM sessions WHERE sid = ? AND expires_at > ?`, [sid, Date.now()])
      .then((row) => cb(null, row ? (JSON.parse(row.sess) as session.SessionData) : null), (err) => cb(err));
  }

  override set(sid: string, sess: session.SessionData, cb?: (err?: unknown) => void): void {
    const write = this.db.run(
      `INSERT INTO sessions (sid, sess, expires_at) VALUES (?, ?, ?)
       ON CONFLICT (sid) DO UPDATE SET sess = excluded.sess, expires_at = excluded.expires_at`,
      [sid, JSON.stringify(sess), expiryOf(sess)],
    );
    const sweep = Math.random() < 1 / SWEEP_EVERY ? this.db.run(`DELETE FROM sessions WHERE expires_at <= ?`, [Date.now()]) : null;
    Promise.all([write, sweep]).then(() => cb?.(), (err) => cb?.(err));
  }

  override destroy(sid: string, cb?: (err?: unknown) => void): void {
    this.db.run(`DELETE FROM sessions WHERE sid = ?`, [sid]).then(() => cb?.(), (err) => cb?.(err));
  }

  override touch(sid: string, sess: session.SessionData, cb?: () => void): void {
    this.db
      .run(`UPDATE sessions SET expires_at = ? WHERE sid = ?`, [expiryOf(sess), sid])
      .then(() => cb?.(), () => cb?.());
  }
}
