import type { DB } from './db';

export const ROLES = ['admin', 'staff'] as const;
export type Role = (typeof ROLES)[number];

export interface AuthUser {
  id: number;
  email: string;
  role: Role;
}

export function findUserByEmail(db: DB, email: string): Promise<(AuthUser & { passwordHash: string }) | undefined> {
  return db.get(`SELECT id, email, role, password_hash AS passwordHash FROM users WHERE email = ?`, [email]);
}

export function findUserById(db: DB, id: number): Promise<AuthUser | undefined> {
  return db.get(`SELECT id, email, role FROM users WHERE id = ?`, [id]);
}

export async function createUser(db: DB, email: string, passwordHash: string, role: Role): Promise<number> {
  const info = await db.run(`INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)`, [
    email.toLowerCase(),
    passwordHash,
    role,
  ]);
  return info.lastInsertRowid;
}
