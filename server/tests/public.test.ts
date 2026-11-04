import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { signFormToken } from '../src/lib/formToken';
import { futureDate, getFormToken, login, setup, STAFF, testConfig, validEnquiry } from './helpers';

type Row = Record<string, unknown>;

describe('public form configuration', () => {
  it('returns server-owned brand config and a signed token', async () => {
    const { app } = await setup();
    const res = await request(app).get('/api/public/form-config/drvet').expect(200);
    expect(res.body.brand.name).toBe('DrVet Animal Hospital');
    expect(res.body.brand.notice).toMatch(/medical records/i);
    expect(res.body.enquiryTypes).toEqual([{ value: 'general_service', label: 'General service enquiry' }]);
    expect(res.body.formToken).toMatch(/^[\w-]+\.[\w-]+$/);
  });

  it('404s for unknown or prototype-pollution site keys', async () => {
    const { app } = await setup();
    for (const key of ['unknown', '__proto__', 'constructor', 'toString']) {
      await request(app).get(`/api/public/form-config/${key}`).expect(404);
    }
  });
});

describe('TEST 1 - normal submission', () => {
  it('stores the enquiry with brand from the token, status "new" and no raw IP', async () => {
    const { app, db } = await setup();
    const token = await getFormToken(app, 'ipstudios');
    const res = await request(app)
      .post('/api/public/enquiries')
      .send(validEnquiry(token, { preferredDate: futureDate() }))
      .expect(201);
    expect(res.body).toEqual({ ok: true });

    const row = (await db.get('SELECT * FROM enquiries')) as Row;
    expect(row).toMatchObject({ brand: 'ipstudios', status: 'new', email: 'alex@example.test', preferred_date: futureDate() });
    expect(row.ip_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(String(row.ip_hash)).not.toContain('127.0.0.1');
  });

  it('ignores a tampered "brand" field in the body', async () => {
    const { app, db } = await setup();
    const token = await getFormToken(app, 'ipstudios');
    await request(app).post('/api/public/enquiries').send(validEnquiry(token, { brand: 'drvet' })).expect(201);
    expect(((await db.get('SELECT brand FROM enquiries')) as Row).brand).toBe('ipstudios');
  });
});

describe('TEST 2 - invalid input is rejected server-side', () => {
  const cases: [string, Record<string, unknown>, string][] = [
    ['bad email', { email: 'not-an-email' }, 'email'],
    ['short name', { fullName: 'A' }, 'fullName'],
    ['short message', { message: 'hi' }, 'message'],
    ['oversized message', { message: 'x'.repeat(2001) }, 'message'],
    ['malformed date', { preferredDate: '31/12/2030' }, 'preferredDate'],
    ['past date', { preferredDate: '2000-01-01' }, 'preferredDate'],
    ['control characters', { fullName: 'Alex\u0000Example' }, 'fullName'],
    ['enquiry type of another brand', { enquiryType: 'venue_hire' }, 'enquiryType'],
    ['wrong type (array)', { message: ['a', 'b'] }, 'message'],
  ];

  it.each(cases)('%s -> 400 with field error, nothing stored', async (_label, override, field) => {
    const { app, db } = await setup();
    const token = await getFormToken(app);
    const res = await request(app).post('/api/public/enquiries').send(validEnquiry(token, override)).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields[field]).toBeDefined();
    expect(((await db.get('SELECT COUNT(*) n FROM enquiries')) as Row).n).toBe(0);
  });

  it('rejects malformed JSON and oversized bodies', async () => {
    const { app } = await setup();
    const bad = await request(app).post('/api/public/enquiries').set('content-type', 'application/json').send('{"a":').expect(400);
    expect(bad.body.error.code).toBe('BAD_JSON');
    await request(app).post('/api/public/enquiries').send({ message: 'x'.repeat(20_000) }).expect(413);
  });
});

describe('TEST 4 - potentially malicious input', () => {
  it('stores XSS and SQL-injection payloads as inert text', async () => {
    const { app, db } = await setup();
    const xss = '<img src=x onerror=alert(1)><script>alert("x")</script>';
    const sqli = "Robert'); DROP TABLE enquiries;-- ";
    const token = await getFormToken(app);
    await request(app)
      .post('/api/public/enquiries')
      .send(validEnquiry(token, { fullName: sqli, message: `${xss} please call me back` }))
      .expect(201);

    // Table still exists and the payload is stored verbatim (parameterised queries).
    const row = (await db.get('SELECT full_name, message FROM enquiries')) as Row;
    expect(row.full_name).toBe(sqli.trim());
    expect(row.message).toContain(xss);

    // Staff receive it as a JSON string value (application/json), which the React UI renders as text.
    const { agent } = await login(app, STAFF);
    const list = await agent.get('/api/enquiries').expect(200).expect('content-type', /application\/json/);
    expect(list.body.items[0].message).toContain(xss);
  });

  it('rejects forged, tampered and expired form tokens', async () => {
    const { app, config } = await setup();
    const token = await getFormToken(app);
    const [body, sig] = token.split('.');
    const forgedBody = Buffer.from(JSON.stringify({ b: 'drvet', iat: Date.now(), n: 'x'.repeat(22) })).toString('base64url');

    for (const bad of [`${forgedBody}.${sig}`, `${body}.AAAA`, signFormToken('wrong-secret', 'ipstudios'), '', 'abc', 42]) {
      const res = await request(app).post('/api/public/enquiries').send(validEnquiry(bad as string)).expect(403);
      expect(res.body.error.code).toBe('FORM_INVALID');
    }
    const expired = signFormToken(config.formTokenSecret, 'ipstudios', Date.now() - config.formTokenTtlMs - 1000);
    await request(app).post('/api/public/enquiries').send(validEnquiry(expired)).expect(403);
  });

  it('blocks token replay (one submission per form load)', async () => {
    const { app } = await setup();
    const token = await getFormToken(app);
    await request(app).post('/api/public/enquiries').send(validEnquiry(token)).expect(201);
    const res = await request(app).post('/api/public/enquiries').send(validEnquiry(token)).expect(409);
    expect(res.body.error.code).toBe('ALREADY_SUBMITTED');
  });
});

describe('spam and rate limiting', () => {
  it('silently drops honeypot submissions', async () => {
    const { app, db } = await setup();
    const token = await getFormToken(app);
    await request(app).post('/api/public/enquiries').send(validEnquiry(token, { website: 'http://spam.example' })).expect(201);
    expect(((await db.get('SELECT COUNT(*) n FROM enquiries')) as Row).n).toBe(0);
  });

  it('rejects submissions faster than the minimum fill time', async () => {
    const { app } = await setup({ config: { formMinFillMs: 60_000 } });
    const token = await getFormToken(app);
    const res = await request(app).post('/api/public/enquiries').send(validEnquiry(token)).expect(400);
    expect(res.body.error.code).toBe('TOO_FAST');
  });

  it('rate-limits repeated submissions with 429', async () => {
    const { app } = await setup({ config: { publicSubmitLimit: { windowMs: 60_000, limit: 3 } } });
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/public/enquiries').send(validEnquiry(await getFormToken(app))).expect(201);
    }
    const res = await request(app).post('/api/public/enquiries').send(validEnquiry(await getFormToken(app))).expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('public users can never read enquiries', () => {
  it('has no public read route and the staff API requires a session', async () => {
    const { app } = await setup();
    await request(app).get('/api/public/enquiries').expect(404);
    await request(app).get('/api/enquiries').expect(401);
  });

  it('sends security headers and no-store caching', async () => {
    const { app } = await setup();
    const res = await request(app).get('/api/public/form-config/jazzbar');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

// Guard against accidental config drift in tests.
it('test config never uses production mode', () => {
  expect(testConfig().isProd).toBe(false);
});
