# Group Enquiry Desk: assessment prototype

This is a secure enquiry desk shared by five brands (IP Studios, DrVet, Space42 Arena, Jazzbar, MENA Lead). It includes an admin-only AI SEO helper that requires human approval. It is a **local prototype with fictional data**, not a deployment for the real businesses.

> **Stack note:** the brief asks for a WordPress plugin. This prototype implements the same requirements in **Node.js (Express) + React**, at the candidate's choice. Under [Mapping to WordPress](#mapping-to-wordpress), each piece is matched to its WordPress equivalent (shortcode, nonce, capability, REST route, `$wpdb->prepare`).

| Deliverable | Where |
|---|---|
| Task 1: SEO audit | [`docs/SEO_Audit.md`](docs/SEO_Audit.md) (template; evidence collected manually) |
| Task 2: enquiry desk | `server/`, `client/` |
| Task 3: safe AI helper | `server/src/ai/`, `client/src/pages/admin/SeoHelper.tsx`, [sample I/O](#ai-seo-helper-task-3) |
| Task 4: incident note | [`docs/INCIDENT_RESPONSE.md`](docs/INCIDENT_RESPONSE.md) |
| AI usage declaration | [`docs/AI_USAGE.md`](docs/AI_USAGE.md) |
| Time log | [`docs/TIME_LOG.md`](docs/TIME_LOG.md) |

## Requirements
- Node.js **22+** and npm 10+. Windows, macOS and Linux all work.
- No Docker, PHP, external database or API key needed locally. Data is stored in a local SQLite file through the libSQL client (`@libsql/client`).
- For hosting on Vercel, the same code talks to a hosted [Turso](https://turso.tech) database instead. See [Deploy to Vercel](#deploy-to-vercel).

## Setup
```bash
npm install
cp .env.example .env        # then fill the three *_SECRET values (see comment in the file)
npm run seed                # creates fictional admin + staff accounts and 10 sample enquiries
npm run dev                 # API on http://127.0.0.1:4000, UI on http://127.0.0.1:5173
npm test                    # 51 automated security/functionality tests
```
- If `SEED_ADMIN_PASSWORD` / `SEED_STAFF_PASSWORD` are empty, `npm run seed` generates random passwords and prints them **once**.
- `npm run seed -- --reset` wipes and recreates the data. In Windows PowerShell 5.1, quote the separator: `npm run seed '--' --reset`.
- Seeded accounts: `admin@example.test` (admin: enquiries and AI helper) and `staff@example.test` (staff: enquiries only).

**Production-like run:** `npm run build`, then `NODE_ENV=production npm start`. Express serves the built UI with a strict CSP.
- In production all secrets are required, and the session cookie is `Secure`, so the app must sit behind HTTPS.
- Set `TRUST_PROXY=1` when a TLS-terminating proxy is in front.

## Deploy to Vercel
Vercel runs the API as serverless functions: instances are short-lived, share no memory and have no writable disk. So everything that must persist lives in the database:
- **Data** goes to a hosted Turso (libSQL) database. It is SQLite-compatible, so the schema, CHECK constraints and queries are unchanged.
- **Sessions** are stored in a `sessions` table. The cookie only carries the signed session ID.
- **Rate-limit counters** are stored in a `rate_limits` table, so limits hold across instances.
- **Multi-step writes** (status change plus audit row, SEO approve/reject/publish) run as one atomic batch with guarded `WHERE` clauses, in a single network round trip.

`vercel.json` deploys the repo as one Vercel project with two [services](https://vercel.com/docs/services):
- **`client`** (`client/`, Vite) is public on every path except `/api/*`. Vercel serves the built React app from its CDN with the same CSP and security headers Helmet sets on the API, plus `X-Robots-Tag: noindex`. Client-side routes such as `/admin` fall back to `index.html`.
- **`server`** (`server/`, Express) is public on `/api/*`. `server/src/vercel.ts` is its entry: one Vercel Function that receives the original path, so the Express routes are unchanged.
- **No bindings.** The browser calls `/api` on the same domain, and no service calls another server-side.
- Both services install from the repo root (`cd .. && npm ci`), because the npm workspaces share one lockfile.

To build exactly what Vercel builds, run `npx vercel build` from the repo root. It runs both services' installs and builds and writes the result to `.vercel/output`.

**One-time setup**
1. Create a Turso database and token. Pick the region closest to your Vercel function region (Vercel's default is Washington, D.C., `iad1`).
   ```bash
   turso db create group-enquiry-desk
   turso db show group-enquiry-desk --url      # -> DATABASE_URL
   turso db tokens create group-enquiry-desk   # -> DATABASE_AUTH_TOKEN
   ```
2. Import the repository in Vercel. Set **Root Directory** to the repo root (empty) and **Framework Preset** to *Services* if offered, otherwise *Other*. `vercel.json` defines everything else.
3. Add these environment variables in the Vercel project settings:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | the `libsql://...` URL from step 1 |
   | `DATABASE_AUTH_TOKEN` | the token from step 1 |

   If you add Turso through Vercel's Marketplace integration instead, it sets `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. The app reads those too, so skip the two rows above.
   | `SESSION_SECRET`, `FORM_TOKEN_SECRET`, `IP_HASH_SECRET` | three different random values, 32+ characters each |
   | `TRUST_PROXY` | `1` (required: without it the `Secure` cookie is never sent and login fails) |
   | `AI_PROVIDER` | `mock` |

4. Seed the hosted database once, from your machine:
   ```bash
   DATABASE_URL=libsql://... DATABASE_AUTH_TOKEN=... npm run seed
   ```
   Set `SEED_ADMIN_PASSWORD` and `SEED_STAFF_PASSWORD` for the run too, or the script prints random ones once.
5. Deploy. Tables are created automatically on the first request, and the step is idempotent.

**Notes**
- The server function runs on the Node version configured in the Vercel project.
- The server never bundles a local `.env`. Only the local entry points (`npm run dev`, `npm run seed`) load it, so Vercel's file tracer cannot copy secrets into a deployment.
- Locally the app uses the Node libSQL client, which supports SQLite files. On Vercel it loads the pure-JS web client over HTTPS, so the function ships no native modules.
- Locally, nothing changes: without `DATABASE_URL` the app uses the SQLite file at `DB_PATH`. On Vercel, a missing `DATABASE_URL` stops startup with a clear error instead of silently losing data.
- This is a demo with fictional data under real brand names. Keep the `noindex` header, and consider Vercel's deployment protection so only reviewers can open it.

## Architecture
```
Browser (React SPA)  ──same origin──▶  Express API ──▶ libSQL: local SQLite file, or Turso on Vercel
  /enquire/:siteKey   public form        /api/public/*      write-only enquiries, form config
  /admin              staff list         /api/enquiries/*   staff+ (session, CSRF)
  /admin/seo          AI helper          /api/ai/*          admin only (session, CSRF) ──▶ LlmProvider (mock | http stub)
  /pages/:pageRef     published SEO      /api/public/pages  published (approved) SEO only
```

### Key decisions
- **The brand is never trusted from user input.**
  - A page is configured with a site key, similar to a shortcode attribute. The server resolves the brand from its own config and signs it into an **HMAC form token** `{brand, issuedAt, nonce}`.
  - On submit the brand comes from the verified token. Any `brand` in the body is stripped.
  - The token also enforces a **minimum fill time** (3 s), an **expiry** (2 h) and **single use**: the nonce is stored with a UNIQUE constraint.
- **Data model: a relational table, not a document store.** It's the Node equivalent of the brief's "custom table" option.
  - `enquiries` uses CHECK constraints for brand, status and lengths, plus composite index `(brand, status, created_at)` for the admin filter.
  - `enquiry_status_audit` records who changed what. Every query is parameterised.
  - Compared to a WordPress custom post type: enquiries are not content, need no revisions or editor, and need strict typing and filtering.
- **Access control:**
  - Sessions use `httpOnly`, `SameSite=Strict` and `Secure` (prod) cookies. Passwords are hashed with bcrypt (cost 12). The session ID is regenerated on login.
  - There is one generic message for an unknown user or a wrong password, with a dummy-hash comparison so timing doesn't reveal which accounts exist.
  - The user is **re-loaded from the DB on every request**, so a role change takes effect immediately.
  - Roles are `staff`, which covers enquiries, and `admin`, which adds the AI helper.
  - **There is no public read endpoint for enquiries.**
- **CSRF:** a synchronizer token kept in the session, sent as `X-CSRF-Token` and held in JS memory only. It sits on top of SameSite=Strict.
- **Abuse controls:**
  - a honeypot field (silently dropped), the minimum fill time and token replay protection
  - rate limits per *hashed* IP (5 submissions per 15 min, 10 logins per 15 min, 60 config reads per min)
  - a 16 KB JSON body limit
- **Output safety:**
  - React escapes everything, and `dangerouslySetInnerHTML` is never used.
  - Helmet sets CSP (`script-src 'self'`, `frame-ancestors 'none'`), nosniff, and so on. `/api` responses are `Cache-Control: no-store`.
  - Errors return a stable code and generic text, never stack traces or submitted values.
- **Privacy:**
  - Only an HMAC of the IP address is stored. The DrVet form shows a "no medical records" notice.
  - Logs never contain enquiry bodies. API responses never include `ip_hash` or the form nonce.
- **Dependencies:** `npm audit` was clean at the time of writing. zod 4, react-router 7 and vitest 5 were chosen specifically to clear published advisories.

## REST API
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/public/form-config/:siteKey` | public | brand name/notice, enquiry types, signed form token |
| POST | `/api/public/enquiries` | public + form token | 201 `{ok:true}`; 400 field errors; 403 bad/expired token; 409 replay; 429 rate limit |
| GET | `/api/public/pages/:pageRef` | public | published SEO only |
| POST | `/api/auth/login` · GET `/api/auth/me` · POST `/api/auth/logout` | – / session / session+CSRF | |
| GET | `/api/enquiries?brand=&status=&page=&limit=` | staff+ | validated filters, paginated (≤100) |
| GET | `/api/enquiries/meta` | staff+ | brands, enquiry types, statuses |
| PATCH | `/api/enquiries/:id/status` | staff+ CSRF | `{status: new\|in_progress\|closed}`, audited |
| GET/POST | `/api/ai/pages`, `/api/ai/seo-drafts` | admin CSRF | generate and list drafts |
| POST | `/api/ai/seo-drafts/:id/approve \| reject \| publish` | admin CSRF | state machine draft → approved → published |

## Tests (`npm test`)
There are 51 automated tests (vitest + supertest, in-memory DB). The four required categories map to these test groups:

| # | Required test | Expected result | Test |
|---|---|---|---|
| 1 | **Normal submission** | 201, stored with brand from the token, status `new`, hashed IP | `public.test.ts`, "TEST 1" |
| 2 | **Invalid input**: bad email, short or oversized fields, bad or past date, control characters, another brand's enquiry type, wrong types, malformed JSON, 20 KB body | 400 with per-field messages (413 for the body); nothing stored | "TEST 2" |
| 3 | **Unauthorised access**: anonymous list/update, staff on admin AI routes, after logout, missing or forged CSRF | 401 / 403; no enquiry data in the response | `enquiries.test.ts` "TEST 3", `ai.test.ts` |
| 4 | **Malicious input**: XSS and SQL-injection payloads, tampered `brand`, forged or expired tokens, token replay, prototype-pollution site keys | stored as inert text; brand unchanged; 403 / 409 / 404 | "TEST 4" |

The suite also covers:
- honeypot, minimum fill time and 429 rate limiting
- login rate limiting and session-ID rotation
- the status audit trail
- AI failures (invalid structure, HTML, non-JSON, provider error, timeout → 502 with no draft stored)
- PII redaction before the provider, claim warnings, reviewer edits being re-validated, and blocking publish without approval
- serverless behaviour (`serverless.test.ts`): two app instances over one database share sessions, logout and expiry, rate limits and form-token replay protection

**Manual check:** the seed includes an enquiry whose name and message contain `<b>` and `<img onerror>`. In `/admin` they display as literal text.

## AI SEO helper (Task 3)
`LlmProvider.generateSeo(input)` is the seam.
- `MockLlmProvider` is the deterministic default and makes no network calls.
- `HttpLlmProvider` is a **stub** showing where a real API connects. It is off unless `AI_PROVIDER=http`, and the key comes from server env only.

Sample run (mock provider, fictional Space42 page):
```json
{
  "input": { "pageTitle": "Rooftop Acoustic Night",
             "description": "Fictional demo event: an evening of acoustic sets on the arena rooftop terrace. Doors open at 7pm, ..." },
  "output": {
    "seoTitle": "Rooftop Acoustic Night | Space42 Arena",
    "metaDescription": "Fictional demo event: an evening of acoustic sets on the arena rooftop terrace. Doors open at 7pm, with seated and standing areas and food stalls…",
    "faqs": [
      { "question": "What is Rooftop Acoustic Night?", "answer": "Fictional demo event: an evening of acoustic sets on the arena rooftop terrace." },
      { "question": "How do I enquire about Rooftop Acoustic Night?", "answer": "Use the enquiry form on this page and the Space42 Arena team will reply with the details." },
      { "question": "Can I ask a question before booking?", "answer": "Yes. Send your question through the enquiry form and a member of the Space42 Arena team will get back to you." }
    ]
  },
  "warnings": []
}
```

**Safety and approval mechanism (five lines):**
1. Only fictional page copy goes to the provider. Enquiry records are never passed to it, emails and phone numbers are redacted server-side first, and the API key never leaves the server.
2. Provider output is treated as untrusted: there's a hard timeout, and it's strictly validated (lengths, 2–3 FAQs, no HTML, no extra keys). Anything invalid is discarded with a 502, and nothing is stored.
3. Numbers and claim words ("best", "guaranteed", "certified", prices, …) that don't appear in the source are flagged to the reviewer as warnings.
4. Every suggestion starts as a `draft`. Only an admin can approve it, after ticking a "checked against source" box, and edits are re-validated. Only an approved draft can be published, and publish re-validates again.
5. The public page reads only the `page_seo` table, which nothing writes except the publish step. Drafts are never public, and every step records who did it and when.

## Mapping to WordPress
| This prototype | WordPress equivalent |
|---|---|
| `/enquire/:siteKey` page config | `[group_enquiry brand="drvet"]` shortcode attribute (editor-controlled) |
| HMAC form token | `wp_nonce_field()` + signed hidden brand / `wp_verify_nonce()` |
| zod schemas | `sanitize_text_field`, `sanitize_email`, `is_email`, allow-lists |
| React auto-escaping | `esc_html`, `esc_attr`, `esc_url` |
| `requireRole('staff')` | custom capability `manage_enquiries` + `current_user_can()` |
| REST routes | `register_rest_route()` with `permission_callback` |
| parameterised SQL | `$wpdb->prepare()` on a custom table created via `dbDelta()` |
| CSRF header | `X-WP-Nonce` (`wp_rest` nonce) |

## Completed vs incomplete
**Completed:**
- the public form for 5 brands with server-chosen brand
- validation, CSRF, rate limiting, honeypot and replay protection
- the staff list with brand/status filters, pagination and audited status updates
- the REST API with access control
- the admin AI helper with mock provider and approval workflow
- 51 automated tests and the docs
- a Vercel deployment path (Turso database, database-backed sessions and rate limits)

**Not done / limitations:**
- Not a WordPress plugin (see the stack note above).
- No email notifications (not required), no data-retention job, no enquiry export or delete (GDPR-style requests), and no per-brand staff scoping. All staff see all brands.
- The SPA sets title/meta client-side. Real SEO output must be server-rendered (in WordPress, `wp_head`). The JSON-LD is shown as a preview only.
- No CAPTCHA. The honeypot, fill time and rate limits are a reasonable baseline, and Turnstile or hCaptcha would be the next layer.
- The `HttpLlmProvider` stub has never been run against a real API.
- The SEO audit evidence must be gathered manually (the live sites must not be automated against).

## Staging, backup and rollback
- **Environments:** local → staging (production-like data shape, fictional or anonymised data only) → production. Configuration lives only in environment variables.
- **Release:**
  - CI runs `npm ci`, `npm audit`, typecheck and `npm test` on every PR, then builds an immutable artifact with a version tag.
  - Deploy that artifact to staging, smoke-test it (form submit, admin login, status change, AI draft), then promote the same artifact to production.
- **Backups:** on Turso, use its point-in-time restore and also export a copy before every release. For a self-hosted SQLite file, take online backups (`.backup` / `VACUUM INTO`), at least nightly and before every release. Keep them encrypted off-host with a retention policy, and **test a restore** each month into staging.
- **Rollback:**
  - Redeploy the previous artifact tag.
  - Schema changes are additive and backward-compatible (expand → migrate → contract), so the previous version still runs against the new schema. Restore from the pre-release backup only for data corruption.

## With one more day
1. Port to an actual WordPress plugin with the same design: custom table, capability, REST nonce.
2. Structured audit logging.
3. Per-brand staff permissions.
4. Retention and deletion tooling for personal data.
5. Playwright end-to-end tests and an accessibility pass (axe).
6. Server-side rendering of published SEO and JSON-LD.
7. A real provider adapter behind a feature flag, with prompt-injection test cases.
