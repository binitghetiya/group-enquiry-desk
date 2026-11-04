import type { BrandId } from '../config/brands';
import { NOW_SQL, type DB } from './db';

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

/**
 * Inserts an enquiry. Returns undefined when the form nonce was already used (token replay):
 * the UNIQUE constraint on form_nonce makes the check atomic without parsing driver error codes.
 */
export async function insertEnquiry(db: DB, e: NewEnquiry): Promise<number | undefined> {
  const info = await db.run(
    `INSERT INTO enquiries (brand, full_name, email, enquiry_type, message, preferred_date, ip_hash, form_nonce)
     VALUES (@brand, @fullName, @email, @enquiryType, @message, @preferredDate, @ipHash, @formNonce)
     ON CONFLICT (form_nonce) DO NOTHING`,
    {
      brand: e.brand,
      fullName: e.fullName,
      email: e.email,
      enquiryType: e.enquiryType,
      message: e.message,
      preferredDate: e.preferredDate ?? null,
      ipHash: e.ipHash,
      formNonce: e.formNonce,
    },
  );
  return info.changes === 1 ? info.lastInsertRowid : undefined;
}

export interface ListFilter {
  brand?: BrandId;
  status?: EnquiryStatus;
  page: number;
  limit: number;
}

export async function listEnquiries(db: DB, f: ListFilter): Promise<{ items: EnquiryDto[]; total: number }> {
  // Fixed SQL with bound parameters; filters are optional via "IS NULL OR".
  const where = `WHERE (@brand IS NULL OR brand = @brand) AND (@status IS NULL OR status = @status)`;
  const params = { brand: f.brand ?? null, status: f.status ?? null };
  const [items, count] = await Promise.all([
    db.all<EnquiryDto>(
      `SELECT ${PUBLIC_COLUMNS} FROM enquiries ${where}
       ORDER BY created_at DESC, id DESC LIMIT @limit OFFSET @offset`,
      { ...params, limit: f.limit, offset: (f.page - 1) * f.limit },
    ),
    db.get<{ total: number }>(`SELECT COUNT(*) AS total FROM enquiries ${where}`, params),
  ]);
  return { items, total: count?.total ?? 0 };
}

export function getEnquiry(db: DB, id: number): Promise<EnquiryDto | undefined> {
  return db.get(`SELECT ${PUBLIC_COLUMNS} FROM enquiries WHERE id = ?`, [id]);
}

/**
 * Updates status and writes an audit row atomically. The audit row is written first so it can
 * read the old status, and both statements only act when the status really changes.
 * Returns undefined if the enquiry does not exist.
 */
export async function updateEnquiryStatus(
  db: DB,
  id: number,
  status: EnquiryStatus,
  userId: number,
): Promise<EnquiryDto | undefined> {
  const [, , selected] = await db.batch([
    {
      sql: `INSERT INTO enquiry_status_audit (enquiry_id, from_status, to_status, user_id)
            SELECT id, status, @status, @userId FROM enquiries WHERE id = @id AND status <> @status`,
      args: { id, status, userId },
    },
    {
      sql: `UPDATE enquiries SET status = @status, updated_at = ${NOW_SQL} WHERE id = @id AND status <> @status`,
      args: { id, status },
    },
    { sql: `SELECT ${PUBLIC_COLUMNS} FROM enquiries WHERE id = ?`, args: [id] },
  ]);
  return selected?.rows[0] as EnquiryDto | undefined;
}

export async function countEnquiries(db: DB): Promise<number> {
  return (await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM enquiries`))?.n ?? 0;
}
