import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { Express } from 'express';
import { MockLlmProvider } from '../src/ai/mockProvider';
import type { LlmProvider } from '../src/ai/provider';
import { createApp } from '../src/app';
import type { AppConfig } from '../src/config/env';
import { openDb, type DB } from '../src/db/db';
import { createUser } from '../src/db/users';

// Fictional test credentials for an in-memory database only.
export const ADMIN = { email: 'admin@example.test', password: 'admin-test-password-1' };
export const STAFF = { email: 'staff@example.test', password: 'staff-test-password-1' };

const generous = { windowMs: 60_000, limit: 1000 };

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    isProd: false,
    port: 0,
    database: { url: ':memory:' },
    trustProxy: 0,
    sessionSecret: 'test-session-secret-0123456789abcdef',
    formTokenSecret: 'test-form-token-secret-0123456789abcd',
    ipHashSecret: 'test-ip-hash-secret-0123456789abcdefg',
    formMinFillMs: 0,
    formTokenTtlMs: 60 * 60 * 1000,
    publicReadLimit: generous,
    publicSubmitLimit: generous,
    loginLimit: generous,
    ai: { provider: 'mock', timeoutMs: 2000 },
    ...overrides,
  };
}

/**
 * Each call gets its own fresh in-memory database, unless `db` is passed: that simulates a second
 * serverless instance sharing the same hosted database.
 */
export async function setup(opts: { config?: Partial<AppConfig>; llm?: LlmProvider; db?: DB } = {}) {
  const config = testConfig(opts.config);
  const db = opts.db ?? (await openDb(config.database));
  if (!opts.db) {
    await createUser(db, ADMIN.email, bcrypt.hashSync(ADMIN.password, 4), 'admin');
    await createUser(db, STAFF.email, bcrypt.hashSync(STAFF.password, 4), 'staff');
  }
  const app = createApp({ config, db, llm: opts.llm ?? new MockLlmProvider() });
  return { app, db, config };
}

export async function login(app: Express, who: { email: string; password: string }) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send(who).expect(200);
  return { agent, csrf: res.body.csrfToken as string };
}

export async function getFormToken(app: Express, siteKey = 'ipstudios'): Promise<string> {
  const res = await request(app).get(`/api/public/form-config/${siteKey}`).expect(200);
  return res.body.formToken as string;
}

export function validEnquiry(formToken: string, overrides: Record<string, unknown> = {}) {
  return {
    formToken,
    fullName: 'Alex Example',
    email: 'alex@example.test',
    enquiryType: 'content_production',
    message: 'We would like a short brand video for a launch.',
    preferredDate: '',
    website: '',
    ...overrides,
  };
}

export function futureDate(days = 30): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}
