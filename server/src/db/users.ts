import type { DB } from './db';

export const ROLES = ['admin', 'staff'] as const;
export type Role = (typeof ROLES)[number];

export interface AuthUser {
  id: number;
  email: string;
  role: Role;
}

export function findUserByEmail(db: DB, email: string): (AuthUser & { passwordHash: string }) | undefined {
  return db
    .prepare(`SELECT id, email, role, password_hash AS passwordHash FROM users WHERE email = ?`)
    .get(email) as (AuthUser & { passwordHash: string }) | undefined;
}

export function findUserById(db: DB, id: number): AuthUser | undefined {
  return db.prepare(`SELECT id, email, role FROM users WHERE id = ?`).get(id) as AuthUser | undefined;
}

export function createUser(db: DB, email: string, passwordHash: string, role: Role): number {
  const info = db
    .prepare(`INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)`)
    .run(email.toLowerCase(), passwordHash, role);
  return Number(info.lastInsertRowid);
}
