# Group Enquiry Desk

A secure enquiry desk shared by five brands, with an admin-only AI SEO helper that needs human approval. Built with Node.js (Express) and React. All data is fictional.

## What's in the project
| Path | What it is |
|---|---|
| `client/` | React app: public enquiry form per brand (`/enquire/:siteKey`), staff enquiry list (`/admin`), AI SEO helper (`/admin/seo`) |
| `server/` | Express API: validation, sessions, CSRF, rate limits, SQLite/Turso database, AI helper, 54 tests |
| `docs/` | [SEO audit](docs/SEO_Audit.md), [incident response](docs/INCIDENT_RESPONSE.md), [AI usage](docs/AI_USAGE.md), [time log](docs/TIME_LOG.md) |
| `vercel.json` | Vercel deployment: `client` on all paths, `server` on `/api/*` |

Brand site keys: `ipstudios`, `drvet`, `space42arena`, `jazzbar`, `menalead`.

## Login
Demo accounts only. Change these before making the site public.

| Role | Email | Password | Access |
|---|---|---|---|
| Admin | `admin@example.test` | `xxxxxxxxxx` | Enquiries and AI SEO helper |
| Staff | `staff@example.test` | `xxxxxxxxxx` | Enquiries only |

## Run locally
```bash
npm install
cp .env.example .env   # fill in the three *_SECRET values
npm run seed           # creates the accounts above and 10 sample enquiries
npm run dev            # UI http://127.0.0.1:5173, API http://127.0.0.1:4000
npm test
```
`npm run seed` reads the passwords from `SEED_ADMIN_PASSWORD` and `SEED_STAFF_PASSWORD` in `.env`. If they are empty, it prints random ones.
