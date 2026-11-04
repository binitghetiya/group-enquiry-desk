import { BRAND_IDS } from '../config/brands';

// BRAND_IDS is a compile-time constant (never user input), so interpolating it into DDL is safe.
const brandList = BRAND_IDS.map((b) => `'${b}'`).join(', ');
const NOW = `(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  created_at    TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE IF NOT EXISTS enquiries (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  brand          TEXT NOT NULL CHECK (brand IN (${brandList})),
  full_name      TEXT NOT NULL CHECK (length(full_name) BETWEEN 2 AND 100),
  email          TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  enquiry_type   TEXT NOT NULL CHECK (length(enquiry_type) <= 50),
  message        TEXT NOT NULL CHECK (length(message) BETWEEN 10 AND 2000),
  preferred_date TEXT CHECK (preferred_date IS NULL OR preferred_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  status         TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'closed')),
  -- HMAC of the client IP (never the raw address); used for abuse investigation only.
  ip_hash        TEXT,
  -- Single-use nonce from the signed form token; UNIQUE blocks token replay.
  form_nonce     TEXT UNIQUE,
  created_at     TEXT NOT NULL DEFAULT ${NOW},
  updated_at     TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX IF NOT EXISTS idx_enquiries_brand_status_created ON enquiries (brand, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enquiries_created ON enquiries (created_at DESC);

CREATE TABLE IF NOT EXISTS enquiry_status_audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  enquiry_id  INTEGER NOT NULL REFERENCES enquiries (id) ON DELETE CASCADE,
  from_status TEXT NOT NULL,
  to_status   TEXT NOT NULL,
  user_id     INTEGER NOT NULL REFERENCES users (id),
  at          TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE IF NOT EXISTS seo_drafts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  page_ref    TEXT NOT NULL,
  brand       TEXT NOT NULL CHECK (brand IN (${brandList})),
  input_json  TEXT NOT NULL,
  output_json TEXT NOT NULL,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  provider    TEXT NOT NULL,
  state       TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'approved', 'rejected', 'published')),
  created_by  INTEGER NOT NULL REFERENCES users (id),
  reviewed_by INTEGER REFERENCES users (id),
  reviewed_at TEXT,
  published_at TEXT,
  created_at  TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX IF NOT EXISTS idx_seo_drafts_page ON seo_drafts (page_ref, created_at DESC);

-- What the public site actually renders. Only written by the publish step of an approved draft.
CREATE TABLE IF NOT EXISTS page_seo (
  page_ref         TEXT PRIMARY KEY,
  seo_title        TEXT NOT NULL,
  meta_description TEXT NOT NULL,
  faqs_json        TEXT NOT NULL,
  draft_id         INTEGER NOT NULL REFERENCES seo_drafts (id),
  published_by     INTEGER NOT NULL REFERENCES users (id),
  published_at     TEXT NOT NULL DEFAULT ${NOW}
);
`;

/** Server-side session data for express-session. Only the opaque session ID lives in the cookie. */
export const SESSIONS_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  sid        TEXT PRIMARY KEY,
  sess       TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

-- Fixed-window counters for express-rate-limit, shared by every serverless instance.
CREATE TABLE IF NOT EXISTS rate_limits (
  key      TEXT PRIMARY KEY,
  hits     INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits (reset_at);
`;
