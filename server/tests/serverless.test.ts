import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env';
import { ADMIN, getFormToken, setup, validEnquiry } from './helpers';

describe('database config', () => {
  const secrets = { SESSION_SECRET: 'x'.repeat(32), FORM_TOKEN_SECRET: 'y'.repeat(32), IP_HASH_SECRET: 'z'.repeat(32) };

  it('accepts the TURSO_* names set by the Vercel integration', () => {
    const c = loadConfig({ ...secrets, TURSO_DATABASE_URL: 'libsql://db.example.test', TURSO_AUTH_TOKEN: 't' });
    expect(c.database).toEqual({ url: 'libsql://db.example.test', authToken: 't' });
  });

  it('prefers DATABASE_* over TURSO_*', () => {
    const c = loadConfig({ ...secrets, DATABASE_URL: 'libsql://a.example.test', DATABASE_AUTH_TOKEN: 'a', TURSO_DATABASE_URL: 'libsql://b.example.test', TURSO_AUTH_TOKEN: 'b' });
    expect(c.database).toEqual({ url: 'libsql://a.example.test', authToken: 'a' });
  });

  it('refuses to start on Vercel without a hosted database', () => {
    expect(() => loadConfig({ ...secrets, VERCEL: '1' })).toThrow(/DATABASE_URL/);
  });
});

/**
 * On Vercel every request may hit a different instance. Two apps over one database stand in
 * for two instances: anything kept in process memory would fail these tests.
 */
describe('state shared across instances (serverless)', () => {
  async function twoInstances(config = {}) {
    const a = await setup({ config });
    const b = await setup({ config, db: a.db });
    return { a: a.app, b: b.app, db: a.db };
  }

  async function loginCookie(app: Parameters<typeof request>[0]) {
    const res = await request(app).post('/api/auth/login').send(ADMIN).expect(200);
    const cookie = res.headers['set-cookie'] as unknown as string[];
    return { cookie, csrf: res.body.csrfToken as string };
  }

  it('a session created on one instance is valid on another', async () => {
    const { a, b } = await twoInstances();
    const { cookie, csrf } = await loginCookie(a);

    const me = await request(b).get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body.user.email).toBe(ADMIN.email);
    expect(me.body.csrfToken).toBe(csrf);

    await request(b)
      .patch('/api/enquiries/999/status')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send({ status: 'closed' })
      .expect(404); // authorised and CSRF-valid on instance B; the enquiry just does not exist
  });

  it('logout on one instance invalidates the session everywhere', async () => {
    const { a, b, db } = await twoInstances();
    const { cookie, csrf } = await loginCookie(a);
    await request(b).post('/api/auth/logout').set('Cookie', cookie).set('X-CSRF-Token', csrf).expect(204);

    // Replaying the old cookie fails on both instances: the server-side row is gone.
    await request(a).get('/api/auth/me').set('Cookie', cookie).expect(401);
    await request(b).get('/api/enquiries').set('Cookie', cookie).expect(401);
    expect(((await db.get('SELECT COUNT(*) AS n FROM sessions')) as { n: number }).n).toBe(0);
  });

  it('an expired session row is ignored', async () => {
    const { a, db } = await twoInstances();
    const { cookie } = await loginCookie(a);
    await db.run('UPDATE sessions SET expires_at = ?', [Date.now() - 1000]);
    await request(a).get('/api/auth/me').set('Cookie', cookie).expect(401);
  });

  it('rate limits count across instances', async () => {
    const { a, b } = await twoInstances({ publicSubmitLimit: { windowMs: 60_000, limit: 3 } });
    const submit = async (app: typeof a) =>
      request(app).post('/api/public/enquiries').send(validEnquiry(await getFormToken(app)));

    expect((await submit(a)).status).toBe(201);
    expect((await submit(b)).status).toBe(201);
    expect((await submit(a)).status).toBe(201);
    // Fourth request in the window, on the other instance: still limited.
    expect((await submit(b)).status).toBe(429);
  });

  it('a form token replayed against another instance is rejected', async () => {
    const { a, b, db } = await twoInstances();
    const body = validEnquiry(await getFormToken(a));
    await request(a).post('/api/public/enquiries').send(body).expect(201);
    await request(b).post('/api/public/enquiries').send(body).expect(409);
    expect(((await db.get('SELECT COUNT(*) AS n FROM enquiries')) as { n: number }).n).toBe(1);
  });
});
