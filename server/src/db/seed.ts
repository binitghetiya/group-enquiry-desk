/**
 * Seeds FICTIONAL data only: two staff accounts on the reserved example.test domain and a handful
 * of made-up enquiries. Usage: npm run seed  (add -- --reset to wipe and re-create).
 */
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import type { BrandId } from '../config/brands';
import { loadConfig } from '../config/env';
import { BCRYPT_COST } from '../routes/auth';
import { openDb } from './db';
import { countEnquiries, type EnquiryStatus } from './enquiries';
import { createUser, findUserByEmail, type Role } from './users';

const config = loadConfig();
const db = openDb(config.dbPath);
const reset = process.argv.includes('--reset');

if (reset) {
  db.exec(`DELETE FROM page_seo; DELETE FROM seo_drafts; DELETE FROM enquiry_status_audit; DELETE FROM enquiries; DELETE FROM users;`);
  console.log('[seed] existing data removed');
}

const accounts: { email: string; role: Role; envVar: string }[] = [
  { email: 'admin@example.test', role: 'admin', envVar: 'SEED_ADMIN_PASSWORD' },
  { email: 'staff@example.test', role: 'staff', envVar: 'SEED_STAFF_PASSWORD' },
];

for (const a of accounts) {
  if (findUserByEmail(db, a.email)) {
    console.log(`[seed] ${a.email} already exists (use --reset to recreate)`);
    continue;
  }
  const fromEnv = process.env[a.envVar];
  const password = fromEnv && fromEnv.length >= 12 ? fromEnv : randomBytes(12).toString('base64url');
  createUser(db, a.email, bcrypt.hashSync(password, BCRYPT_COST), a.role);
  console.log(
    fromEnv ? `[seed] created ${a.role} ${a.email} (password from ${a.envVar})` : `[seed] created ${a.role} ${a.email}  password: ${password}   <- shown once, save it now`,
  );
}

const samples: [BrandId, string, string, string, string, EnquiryStatus][] = [
  ['ipstudios', 'Alex Example', 'alex@example.test', 'content_production', 'We would like a short brand video for a product launch next quarter.', 'new'],
  ['ipstudios', 'Sam Placeholder', 'sam@example.test', 'live_production', 'Looking for multi-camera live streaming for a two-day conference.', 'in_progress'],
  ['drvet', 'Jordan Test', 'jordan@example.test', 'general_service', 'What are your opening hours at the weekend for general check-ups?', 'new'],
  ['drvet', 'Riley Sample', 'riley@example.test', 'general_service', 'Do you offer microchipping, and do I need to book in advance?', 'closed'],
  ['space42arena', 'Casey Demo', 'casey@example.test', 'venue_hire', 'Interested in hiring the main hall for a corporate evening event.', 'new'],
  ['space42arena', 'Morgan Fictional', 'morgan@example.test', 'event_information', 'Is there accessible seating available for the upcoming concert?', 'in_progress'],
  ['jazzbar', 'Taylor Mock', 'taylor@example.test', 'private_event', 'We are planning a private birthday party for about 40 guests.', 'new'],
  ['menalead', 'Jamie Specimen', 'jamie@example.test', 'business_partnership', 'Our company would like to discuss a regional partnership.', 'new'],
  ['menalead', 'Drew Invented', 'drew@example.test', 'project_enquiry', 'We need support scoping a market-entry project for next year.', 'closed'],
  // Demonstrates that markup is stored as plain text and rendered escaped in the admin UI.
  ['jazzbar', '<b>Markup Tester</b>', 'xss@example.test', 'private_event', '<img src=x onerror=alert(1)> This should display as plain text, never execute.', 'new'],
];

if (countEnquiries(db) === 0) {
  const insert = db.prepare(
    `INSERT INTO enquiries (brand, full_name, email, enquiry_type, message, status, ip_hash, form_nonce, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'seed', ?, ?, ?)`,
  );
  db.transaction(() => {
    samples.forEach(([brand, name, email, type, message, status], i) => {
      const at = new Date(Date.now() - (samples.length - i) * 3_600_000).toISOString();
      insert.run(brand, name, email, type, message, status, `seed-${i}`, at, at);
    });
  })();
  console.log(`[seed] inserted ${samples.length} fictional enquiries`);
} else {
  console.log('[seed] enquiries already present - skipped');
}

db.close();
