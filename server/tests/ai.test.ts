import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { flagUnverifiedClaims } from '../src/ai/claims';
import { MockLlmProvider } from '../src/ai/mockProvider';
import type { LlmProvider, SeoGenerationInput } from '../src/ai/provider';
import { redactPersonalData } from '../src/ai/redact';
import { seoSuggestionSchema } from '../src/ai/seoSchema';
import { ADMIN, login, setup, STAFF } from './helpers';

const PAGE = 'space42arena-rooftop-acoustic-night';
const request_ = {
  pageRef: PAGE,
  pageTitle: 'Rooftop Acoustic Night',
  description: 'Fictional demo event: an evening of acoustic sets on the rooftop terrace. Doors open at 7pm.',
};

const fakeProvider = (impl: LlmProvider['generateSeo']): LlmProvider => ({ name: 'fake', generateSeo: impl });

describe('AI SEO helper - access control', () => {
  it('is admin-only: anonymous 401, staff 403', async () => {
    const { app } = await setup();
    await request(app).post('/api/ai/seo-drafts').send(request_).expect(401);
    const { agent, csrf } = await login(app, STAFF);
    await agent.get('/api/ai/pages').expect(403);
    await agent.post('/api/ai/seo-drafts').set('x-csrf-token', csrf).send(request_).expect(403);
    await agent.post('/api/ai/seo-drafts/1/publish').set('x-csrf-token', csrf).expect(403);
  });

  it('requires CSRF for admin mutations', async () => {
    const { app } = await setup();
    const { agent } = await login(app, ADMIN);
    await agent.post('/api/ai/seo-drafts').send(request_).expect(403);
  });
});

describe('AI SEO helper - human approval workflow', () => {
  it('generates a valid draft that is not public until approved and published', async () => {
    const { app } = await setup();
    const { agent, csrf } = await login(app, ADMIN);

    const created = await agent.post('/api/ai/seo-drafts').set('x-csrf-token', csrf).send(request_).expect(201);
    const draft = created.body.draft;
    expect(draft.state).toBe('draft');
    expect(seoSuggestionSchema.safeParse(draft.output).success).toBe(true);
    expect(draft.output.seoTitle.length).toBeLessThanOrEqual(60);
    expect(draft.output.faqs.length).toBeGreaterThanOrEqual(2);

    // Not visible publicly yet
    expect((await request(app).get(`/api/public/pages/${PAGE}`).expect(200)).body.seo).toBeNull();

    // Cannot skip approval
    const skip = await agent.post(`/api/ai/seo-drafts/${draft.id}/publish`).set('x-csrf-token', csrf).expect(409);
    expect(skip.body.error.code).toBe('INVALID_STATE');

    await agent.post(`/api/ai/seo-drafts/${draft.id}/approve`).set('x-csrf-token', csrf).send({}).expect(200);
    await agent.post(`/api/ai/seo-drafts/${draft.id}/publish`).set('x-csrf-token', csrf).expect(200);

    const pub = await request(app).get(`/api/public/pages/${PAGE}`).expect(200);
    expect(pub.body.seo.seoTitle).toBe(draft.output.seoTitle);

    // A published draft cannot be re-approved
    await agent.post(`/api/ai/seo-drafts/${draft.id}/approve`).set('x-csrf-token', csrf).send({}).expect(409);
  });

  it('validates reviewer edits and flags unsupported claims', async () => {
    const { app } = await setup();
    const { agent, csrf } = await login(app, ADMIN);
    const { body } = await agent.post('/api/ai/seo-drafts').set('x-csrf-token', csrf).send(request_).expect(201);
    const id = body.draft.id;

    const htmlEdit = { ...body.draft.output, seoTitle: '<script>alert(1)</script> Rooftop' };
    await agent.post(`/api/ai/seo-drafts/${id}/approve`).set('x-csrf-token', csrf).send({ output: htmlEdit }).expect(400);

    const claimEdit = { ...body.draft.output, metaDescription: 'The best guaranteed rooftop concert in town, tickets from AED 99. Book now today!' };
    const ok = await agent.post(`/api/ai/seo-drafts/${id}/approve`).set('x-csrf-token', csrf).send({ output: claimEdit }).expect(200);
    expect(ok.body.draft.warnings.join(' ')).toMatch(/best/);
    expect(ok.body.draft.warnings.join(' ')).toMatch(/guaranteed/);
    expect(ok.body.draft.warnings.join(' ')).toMatch(/"99"/);
  });

  it('rejects unknown pages and HTML in the request', async () => {
    const { app } = await setup();
    const { agent, csrf } = await login(app, ADMIN);
    await agent.post('/api/ai/seo-drafts').set('x-csrf-token', csrf).send({ ...request_, pageRef: 'nope' }).expect(400);
    await agent.post('/api/ai/seo-drafts').set('x-csrf-token', csrf).send({ ...request_, pageTitle: '<b>x</b>' }).expect(400);
  });
});

describe('AI SEO helper - safe failure handling', () => {
  const cases: [string, LlmProvider, string][] = [
    ['invalid structure', fakeProvider(async () => ({ title: 'missing fields' })), 'AI_INVALID_OUTPUT'],
    ['extra keys / HTML', fakeProvider(async () => ({ seoTitle: '<b>Bold title here</b>', metaDescription: 'x'.repeat(80), faqs: [] })), 'AI_INVALID_OUTPUT'],
    ['non-JSON string', fakeProvider(async () => 'Sure! Here is your SEO...'), 'AI_INVALID_OUTPUT'],
    ['provider error', fakeProvider(async () => { throw new Error('upstream 500'); }), 'AI_UNAVAILABLE'],
    ['provider hangs', fakeProvider(() => new Promise(() => undefined)), 'AI_TIMEOUT'],
  ];

  it.each(cases)('%s -> 502 and no draft stored', async (_label, llm, code) => {
    const { app, db } = await setup({ llm, config: { ai: { provider: 'mock', timeoutMs: 100 } } });
    const { agent, csrf } = await login(app, ADMIN);
    const res = await agent.post('/api/ai/seo-drafts').set('x-csrf-token', csrf).send(request_).expect(502);
    expect(res.body.error.code).toBe(code);
    expect(((await db.get('SELECT COUNT(*) n FROM seo_drafts')) as { n: number }).n).toBe(0);
  });

  it('redacts personal data before it reaches the provider', async () => {
    let seen: SeoGenerationInput | undefined;
    const mock = new MockLlmProvider();
    const spy = fakeProvider(async (input, opts) => {
      seen = input;
      return mock.generateSeo(input, opts);
    });
    const { app } = await setup({ llm: spy });
    const { agent, csrf } = await login(app, ADMIN);
    const res = await agent
      .post('/api/ai/seo-drafts')
      .set('x-csrf-token', csrf)
      .send({ ...request_, description: `${request_.description} Contact jane.doe@example.test or +971 50 123 4567.` })
      .expect(201);
    expect(seen?.description).not.toContain('jane.doe@example.test');
    expect(seen?.description).not.toContain('123 4567');
    expect(seen?.description).toContain('[redacted email]');
    expect(res.body.redactions).toBe(2);
  });
});

describe('AI helpers (unit)', () => {
  it('redactPersonalData keeps short numbers such as times', () => {
    expect(redactPersonalData('Doors open at 7pm, call 04 123 4567').text).toBe('Doors open at 7pm, call [redacted number]');
  });

  it('flagUnverifiedClaims only flags what the source does not support', () => {
    const suggestion = {
      seoTitle: 'Rooftop Acoustic Night',
      metaDescription: 'Doors open at 7pm. The best night out, guaranteed.',
      faqs: [
        { question: 'When do doors open?', answer: 'Doors open at 7pm.' },
        { question: 'How many seats?', answer: 'There are 500 seats.' },
      ],
    };
    const warnings = flagUnverifiedClaims('Doors open at 7pm on the rooftop.', suggestion);
    expect(warnings.some((w) => w.includes('"7"'))).toBe(false);
    expect(warnings.some((w) => w.includes('"500"'))).toBe(true);
    expect(warnings.some((w) => w.includes('best'))).toBe(true);
  });
});
