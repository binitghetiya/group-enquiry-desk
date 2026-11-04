import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ADMIN, getFormToken, login, setup, STAFF, validEnquiry } from './helpers';

async function seedOne(app: Parameters<typeof getFormToken>[0], siteKey = 'ipstudios', enquiryType = 'content_production') {
  const token = await getFormToken(app, siteKey);
  await request(app).post('/api/public/enquiries').send(validEnquiry(token, { enquiryType })).expect(201);
}

describe('TEST 3 - unauthorised access', () => {
  it('rejects anonymous list and update requests with 401', async () => {
    const { app } = setup();
    await seedOne(app);
    const list = await request(app).get('/api/enquiries').expect(401);
    expect(list.body.error.code).toBe('UNAUTHENTICATED');
    expect(JSON.stringify(list.body)).not.toContain('alex@example.test');
    await request(app).patch('/api/enquiries/1/status').send({ status: 'closed' }).expect(401);
    await request(app).get('/api/enquiries/meta').expect(401);
  });

  it('uses one generic message for wrong password and unknown email', async () => {
    const { app } = setup();
    const a = await request(app).post('/api/auth/login').send({ email: STAFF.email, password: 'wrong' }).expect(401);
    const b = await request(app).post('/api/auth/login').send({ email: 'nobody@example.test', password: 'wrong' }).expect(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });

  it('rate-limits login attempts', async () => {
    const { app } = setup({ config: { loginLimit: { windowMs: 60_000, limit: 2 } } });
    await request(app).post('/api/auth/login').send({ email: STAFF.email, password: 'x' }).expect(401);
    await request(app).post('/api/auth/login').send({ email: STAFF.email, password: 'x' }).expect(401);
    await request(app).post('/api/auth/login').send(STAFF).expect(429);
  });

  it('invalidates access after logout', async () => {
    const { app } = setup();
    const { agent, csrf } = await login(app, STAFF);
    await agent.get('/api/enquiries').expect(200);
    await agent.post('/api/auth/logout').set('x-csrf-token', csrf).expect(204);
    await agent.get('/api/enquiries').expect(401);
  });

  it('issues a new session id on login (no session fixation)', async () => {
    const { app } = setup();
    const agent = request.agent(app);
    const first = await agent.post('/api/auth/login').send(STAFF).expect(200);
    const second = await agent.post('/api/auth/login').send(STAFF).expect(200);
    const sid = (r: request.Response) => String(r.headers['set-cookie']).match(/ged\.sid=([^;]+)/)?.[1];
    expect(sid(first)).toBeDefined();
    expect(sid(first)).not.toBe(sid(second));
    expect(String(first.headers['set-cookie'])).toMatch(/HttpOnly/i);
    expect(String(first.headers['set-cookie'])).toMatch(/SameSite=Strict/i);
  });
});

describe('authorised staff listing (REST)', () => {
  it('lists enquiries without internal fields', async () => {
    const { app } = setup();
    await seedOne(app);
    const { agent } = await login(app, STAFF);
    const res = await agent.get('/api/enquiries').expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0]).toMatchObject({ brand: 'ipstudios', status: 'new', fullName: 'Alex Example' });
    expect(res.body.items[0]).not.toHaveProperty('ip_hash');
    expect(res.body.items[0]).not.toHaveProperty('ipHash');
    expect(res.body.items[0]).not.toHaveProperty('form_nonce');
  });

  it('filters by brand and status, and validates query parameters', async () => {
    const { app } = setup();
    await seedOne(app, 'ipstudios', 'live_production');
    await seedOne(app, 'jazzbar', 'private_event');
    const { agent } = await login(app, STAFF);

    const jazz = await agent.get('/api/enquiries?brand=jazzbar').expect(200);
    expect(jazz.body.items.map((i: { brand: string }) => i.brand)).toEqual(['jazzbar']);
    expect((await agent.get('/api/enquiries?status=closed').expect(200)).body.total).toBe(0);

    for (const q of ['brand=evilcorp', "brand=jazzbar'--", 'status=deleted', 'limit=1000', 'page=0', 'brand[]=jazzbar']) {
      const res = await agent.get(`/api/enquiries?${q}`).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('status updates', () => {
  it('requires the CSRF token', async () => {
    const { app } = setup();
    await seedOne(app);
    const { agent } = await login(app, STAFF);
    const res = await agent.patch('/api/enquiries/1/status').send({ status: 'closed' }).expect(403);
    expect(res.body.error.code).toBe('CSRF_FAILED');
    await agent.patch('/api/enquiries/1/status').set('x-csrf-token', 'forged').send({ status: 'closed' }).expect(403);
  });

  it('updates status and writes an audit record', async () => {
    const { app, db } = setup();
    await seedOne(app);
    const { agent, csrf } = await login(app, STAFF);
    const res = await agent.patch('/api/enquiries/1/status').set('x-csrf-token', csrf).send({ status: 'in_progress' }).expect(200);
    expect(res.body.item.status).toBe('in_progress');
    const audit = db.prepare('SELECT from_status, to_status FROM enquiry_status_audit').all();
    expect(audit).toEqual([{ from_status: 'new', to_status: 'in_progress' }]);
  });

  it('validates status values and ids', async () => {
    const { app } = setup();
    await seedOne(app);
    const { agent, csrf } = await login(app, ADMIN);
    await agent.patch('/api/enquiries/1/status').set('x-csrf-token', csrf).send({ status: 'deleted' }).expect(400);
    await agent.patch('/api/enquiries/abc/status').set('x-csrf-token', csrf).send({ status: 'closed' }).expect(400);
    await agent.patch('/api/enquiries/999/status').set('x-csrf-token', csrf).send({ status: 'closed' }).expect(404);
  });
});
