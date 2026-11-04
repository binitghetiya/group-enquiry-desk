import { randomBytes } from 'node:crypto';
import { localDbUrl, type DbConnection } from '../db/db';


export interface RateLimitConfig {
  windowMs: number;
  limit: number;
}

export interface AppConfig {
  isProd: boolean;
  port: number;
  /** Turso URL + token in production, or a local SQLite file built from DB_PATH. */
  database: DbConnection;
  /** Number of trusted reverse-proxy hops (0 = use the socket address). */
  trustProxy: number;
  sessionSecret: string;
  formTokenSecret: string;
  ipHashSecret: string;
  /** Submissions faster than this after the form was issued are treated as automated. */
  formMinFillMs: number;
  formTokenTtlMs: number;
  publicReadLimit: RateLimitConfig;
  publicSubmitLimit: RateLimitConfig;
  loginLimit: RateLimitConfig;
  ai: {
    provider: 'mock' | 'http';
    apiUrl?: string;
    apiKey?: string;
    timeoutMs: number;
  };
  /** Built React app for Express to serve in production. Set by the local entry only; Vercel serves it from the client service. */
  clientDist?: string;
}

function int(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function secret(env: NodeJS.ProcessEnv, name: string, isProd: boolean): string {
  const value = env[name];
  if (value && value.length >= 32) return value;
  if (isProd) {
    throw new Error(`${name} must be set to at least 32 characters in production.`);
  }
  // Development only: an ephemeral random secret. Sessions/form tokens reset on restart.
  console.warn(`[config] ${name} not set - using an ephemeral development secret.`);
  return randomBytes(32).toString('hex');
}

function database(env: NodeJS.ProcessEnv): DbConnection {
  // TURSO_* are the names Vercel's Turso integration sets; DATABASE_* take precedence.
  const url = env.DATABASE_URL || env.TURSO_DATABASE_URL;
  const authToken = env.DATABASE_AUTH_TOKEN || env.TURSO_AUTH_TOKEN || undefined;
  if (url) return { url, authToken };
  if (env.VERCEL) {
    // Vercel's filesystem is read-only and per-instance: a local file would silently lose data.
    throw new Error('DATABASE_URL (or TURSO_DATABASE_URL) must point to a hosted database when running on Vercel.');
  }
  return { url: localDbUrl(env.DB_PATH || 'data/enquiries.db') };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const isProd = env.NODE_ENV === 'production';
  const provider = env.AI_PROVIDER === 'http' ? 'http' : 'mock';
  return {
    isProd,
    port: int(env.PORT, 4000),
    database: database(env),
    trustProxy: int(env.TRUST_PROXY, 0),
    sessionSecret: secret(env, 'SESSION_SECRET', isProd),
    formTokenSecret: secret(env, 'FORM_TOKEN_SECRET', isProd),
    ipHashSecret: secret(env, 'IP_HASH_SECRET', isProd),
    formMinFillMs: int(env.FORM_MIN_FILL_MS, 3000),
    formTokenTtlMs: int(env.FORM_TOKEN_TTL_MS, 2 * 60 * 60 * 1000),
    publicReadLimit: { windowMs: 60_000, limit: 60 },
    publicSubmitLimit: { windowMs: 15 * 60_000, limit: 5 },
    loginLimit: { windowMs: 15 * 60_000, limit: 10 },
    ai: {
      provider,
      apiUrl: env.AI_API_URL || undefined,
      apiKey: env.AI_API_KEY || undefined,
      timeoutMs: int(env.AI_TIMEOUT_MS, 10_000),
    },
  };
}
