import type { BrandId } from '../config/brands';
import type { DB } from './db';

export const ENQUIRY_STATUSES = ['new', 'in_progress', 'closed'] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

/** Shape returned to authorised staff. ip_hash and form_nonce are deliberately never selected. */
export interface EnquiryDto {
  id: number;
  brand: BrandId;
  fullName: string;
  email: string;
  enquiryType: string;
  message: string;
  preferredDate: string | null;
  status: EnquiryStatus;
  createdAt: string;
  updatedAt: string;
}

const PUBLIC_COLUMNS = `id, brand, full_name AS fullName, email, enquiry_type AS enquiryType, message,
  preferred_date AS preferredDate, status, created_at AS createdAt, updated_at AS updatedAt`;

export interface NewEnquiry {
  brand: BrandId;
  fullName: string;
  email: string;
  enquiryType: string;
  message: string;
  preferredDate?: string;
  ipHash: string;
  formNonce: string;
}

export function insertEnquiry(db: DB, e: NewEnquiry): number {
  const info = db
    .prepare(
      `INSERT INTO enquiries (brand, full_name, email, enquiry_type, message, preferred_date, ip_hash, form_nonce)
       VALUES (@brand, @fullName, @email, @enquiryType, @message, @preferredDate, @ipHash, @formNonce)`,
    )
    .run({ ...e, preferredDate: e.preferredDate ?? null });
  return Number(info.lastInsertRowid);
}

export interface ListFilter {
  brand?: BrandId;
  status?: EnquiryStatus;
  page: number;
  limit: number;
}

export function listEnquiries(db: DB, f: ListFilter): { items: EnquiryDto[]; total: number } {
  // Fixed SQL with bound parameters; filters are optional via "IS NULL OR".
  const where = `WHERE (@brand IS NULL OR brand = @brand) AND (@status IS NULL OR status = @status)`;
  const params = { brand: f.brand ?? null, status: f.status ?? null };
  const items = db
    .prepare(
      `SELECT ${PUBLIC_COLUMNS} FROM enquiries ${where}
       ORDER BY created_at DESC, id DESC LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit: f.limit, offset: (f.page - 1) * f.limit }) as EnquiryDto[];
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM enquiries ${where}`).get(params) as {
    total: number;
  };
  return { items, total };
}

export function getEnquiry(db: DB, id: number): EnquiryDto | undefined {
  return db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM enquiries WHERE id = ?`).get(id) as
    | EnquiryDto
    | undefined;
}

/** Updates status and writes an audit row in one transaction. Returns undefined if not found. */
export function updateEnquiryStatus(
  db: DB,
  id: number,
  status: EnquiryStatus,
  userId: number,
): EnquiryDto | undefined {
  const tx = db.transaction(() => {
    const current = db.prepare(`SELECT status FROM enquiries WHERE id = ?`).get(id) as
      | { status: EnquiryStatus }
      | undefined;
    if (!current) return undefined;
    if (current.status !== status) {
      db.prepare(
        `UPDATE enquiries SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
      ).run(status, id);
      db.prepare(
        `INSERT INTO enquiry_status_audit (enquiry_id, from_status, to_status, user_id) VALUES (?, ?, ?, ?)`,
      ).run(id, current.status, status, userId);
    }
    return getEnquiry(db, id);
  });
  return tx();
}

export function countEnquiries(db: DB): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM enquiries`).get() as { n: number }).n;
}
