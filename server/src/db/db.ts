import type { Client, Config, InArgs, ResultSet } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SCHEMA_SQL, SESSIONS_SQL } from './schema';

/** Positional (`?`) or named (`@name`) parameters. Values are always bound, never interpolated. */
export type Args = InArgs;
export type Stmt = { sql: string; args?: Args };
export type Row = Record<string, unknown>;

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

export interface BatchResult {
  rows: Row[];
  changes: number;
}

/**
 * Thin async wrapper over libSQL. The same code talks to a local SQLite file (dev, tests) and a
 * hosted Turso database (Vercel). Multi-statement writes use `batch`, which runs atomically in a
 * single round trip: either every statement commits or none do.
 */
export interface DB {
  get<T = Row>(sql: string, args?: Args): Promise<T | undefined>;
  all<T = Row>(sql: string, args?: Args): Promise<T[]>;
  run(sql: string, args?: Args): Promise<RunResult>;
  batch(stmts: Stmt[]): Promise<BatchResult[]>;
  exec(sql: string): Promise<void>;
  close(): void;
}

export interface DbConnection {
  /** `libsql://...`/`https://...` for Turso, `file:...` or `:memory:` for local SQLite. */
  url: string;
  authToken?: string;
}

/** Plain objects keyed by column name, so rows serialise predictably. */
function toRows(rs: ResultSet): Row[] {
  return rs.rows.map((r) => Object.fromEntries(rs.columns.map((c, i) => [c, r[i]])));
}

export function wrapClient(client: Client): DB {
  return {
    async get<T>(sql: string, args: Args = []) {
      return toRows(await client.execute({ sql, args }))[0] as T | undefined;
    },
    async all<T>(sql: string, args: Args = []) {
      return toRows(await client.execute({ sql, args })) as T[];
    },
    async run(sql, args = []) {
      const rs = await client.execute({ sql, args });
      return { changes: rs.rowsAffected, lastInsertRowid: Number(rs.lastInsertRowid ?? 0) };
    },
    async batch(stmts) {
      const results = await client.batch(
        stmts.map((s) => ({ sql: s.sql, args: s.args ?? [] })),
        'write',
      );
      return results.map((rs) => ({ rows: toRows(rs), changes: rs.rowsAffected }));
    },
    async exec(sql) {
      await client.executeMultiple(sql);
    },
    close() {
      client.close();
    },
  };
}

/** Turns a DB_PATH (relative to the server folder) into a libSQL URL. */
export function localDbUrl(file: string): string {
  return file === ':memory:' ? ':memory:' : `file:${resolve(file)}`;
}

const isLocal = (url: string) => url === ':memory:' || url.startsWith('file:');

/**
 * Local files need the Node client, which loads a native SQLite binary. Remote databases use the
 * web-standard client instead: pure JS over HTTPS, nothing native to ship in a serverless
 * function. The imports are dynamic so a deployed function never loads the native module.
 */
async function loadCreateClient(local: boolean): Promise<(config: Config) => Client> {
  return local ? (await import('@libsql/client')).createClient : (await import('@libsql/client/web')).createClient;
}

export async function connect(conn: DbConnection): Promise<DB> {
  const local = isLocal(conn.url);
  if (conn.url.startsWith('file:')) mkdirSync(dirname(conn.url.slice('file:'.length)), { recursive: true });
  // Turso's default "libsql:" scheme uses WebSockets; stateless HTTPS suits short-lived requests.
  const url = conn.url.startsWith('libsql://') && !conn.url.includes('tls=0')
    ? `https://${conn.url.slice('libsql://'.length)}`
    : conn.url;
  const createClient = await loadCreateClient(local);
  return wrapClient(createClient({ url, authToken: conn.authToken, intMode: 'number' }));
}

/** Creates any missing tables and indexes. Idempotent, so it is safe to run on every cold start. */
export async function migrate(db: DB, conn: DbConnection): Promise<void> {
  if (isLocal(conn.url)) {
    const pragmas = conn.url === ':memory:' ? 'PRAGMA foreign_keys = ON;' : 'PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;';
    await db.exec(pragmas);
  }
  await db.exec(SCHEMA_SQL + SESSIONS_SQL);
}

export async function openDb(conn: DbConnection): Promise<DB> {
  const db = await connect(conn);
  await migrate(db, conn);
  return db;
}

/** NOW in the same ISO-8601 format used by the column defaults. */
export const NOW_SQL = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;
