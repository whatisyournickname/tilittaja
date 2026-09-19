import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { cookies } from 'next/headers';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ensureAppTables } from './migrations';
import { getEnv } from '@/lib/env';

const dbConnections = new Map<string, Database.Database>();
const initializedDbs = new Set<string>();
const requestDbPathStore = new AsyncLocalStorage<string>();
const MISSING_DATA_SOURCE_ERROR = 'No active data source found.';

const DATA_DIR = path.resolve(
  /* turbopackIgnore: true */ process.cwd(),
  '..',
  'data',
);

interface CookieValue {
  value: string;
}

interface CookieStoreLike {
  get(name: string): CookieValue | undefined;
}

interface RequestWithCookies {
  cookies: CookieStoreLike;
}

export function getDefaultSourceSlug(): string | null {
  try {
    const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        findMainSqliteFile(path.join(DATA_DIR, entry.name))
      ) {
        return entry.name;
      }
    }
  } catch {
    /* DATA_DIR doesn't exist yet */
  }
  return null;
}

export function resolveDataSourceFromCookies(
  cookieStore: CookieStoreLike,
): string | null {
  return cookieStore.get('datasource')?.value ?? getDefaultSourceSlug();
}

export async function resolveCurrentDataSource(): Promise<string | null> {
  try {
    return resolveDataSourceFromCookies(await cookies());
  } catch {
    return getDefaultSourceSlug();
  }
}

export function resolveRequestDataSource(
  request: RequestWithCookies,
): string | null {
  return resolveDataSourceFromCookies(request.cookies);
}

export async function requireCurrentDataSource(): Promise<string> {
  const source = await resolveCurrentDataSource();
  if (!source) {
    throw new Error(MISSING_DATA_SOURCE_ERROR);
  }
  return source;
}

export interface DataSource {
  slug: string;
  name: string;
}

function findMainSqliteFile(dirPath: string): string | null {
  try {
    const files = fs.readdirSync(dirPath);
    const sqliteFiles = files.filter(
      (f) => f.endsWith('.sqlite') && !/-\d{4}-\d{2}-\d{2}T/.test(f),
    );
    return sqliteFiles.length > 0 ? sqliteFiles[0] : null;
  } catch {
    return null;
  }
}

export function resolveDbPath(slug: string): string | null {
  const dirPath = path.join(DATA_DIR, slug);
  const sqliteFile = findMainSqliteFile(dirPath);
  if (!sqliteFile) return null;
  return path.join(dirPath, sqliteFile);
}

export function hasAnyDataSource(): boolean {
  try {
    const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true });
    return entries.some(
      (e) =>
        e.isDirectory() &&
        findMainSqliteFile(path.join(DATA_DIR, e.name)) !== null,
    );
  } catch {
    return false;
  }
}

export function getDataSources(): DataSource[] {
  try {
    const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((dir) => {
        const dirPath = path.join(DATA_DIR, dir.name);
        const sqliteFile = findMainSqliteFile(dirPath);
        if (!sqliteFile) return null;

        const dbPath = path.join(dirPath, sqliteFile);
        let name = dir.name;
        try {
          const conn = new Database(dbPath, { readonly: true });
          const row = conn
            .prepare('SELECT name FROM settings LIMIT 1')
            .get() as { name: string } | undefined;
          if (row?.name) name = row.name;
          conn.close();
        } catch {
          /* use dir name as fallback */
        }

        return { slug: dir.name, name };
      })
      .filter((s): s is DataSource => s !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/** Resolves the current request's database path from cookies or fallbacks. */
export async function resolveRequestDbPath(): Promise<string> {
  const env = getEnv();
  const defaultSource = getDefaultSourceSlug();

  try {
    const cookieStore = await cookies();
    const cookieSource = cookieStore.get('datasource')?.value;
    if (cookieSource) {
      const dbPath = resolveDbPath(cookieSource);
      if (dbPath) return dbPath;
    }
  } catch {
    /* outside request context */
  }

  if (defaultSource) {
    const dbPath = resolveDbPath(defaultSource);
    if (dbPath) return dbPath;
  }

  if (env.DATABASE_PATH) return env.DATABASE_PATH;

  throw new Error('Tietokantaa ei voitu avata.');
}

/** Runs `fn` with a request-scoped database path. */
export function runWithRequestDb<T>(dbPath: string, fn: () => T): T {
  return requestDbPathStore.run(dbPath, fn);
}

/** Resolves the current DB path and runs `fn` inside that request scope. */
export async function runWithResolvedDb<T>(fn: () => T): Promise<T> {
  const dbPath = await resolveRequestDbPath();
  return runWithRequestDb(dbPath, fn);
}

export function closeDbConnection(dbPath: string): void {
  const resolved = resolvePath(dbPath);
  const existing = dbConnections.get(resolved);
  if (!existing) return;

  try {
    existing.close();
  } finally {
    dbConnections.delete(resolved);
    initializedDbs.delete(resolved);
  }
}

function resolvePath(dbPath: string): string {
  return path.isAbsolute(dbPath)
    ? dbPath
    : path.resolve(/* turbopackIgnore: true */ process.cwd(), dbPath);
}

export function getDb(): Database.Database {
  const env = getEnv();
  const rawPath =
    requestDbPathStore.getStore() ?? env.DATABASE_PATH;
  if (!rawPath) {
    throw new Error(
      'No database configured. Use runWithResolvedDb() or set DATABASE_PATH.',
    );
  }

  const resolvedPath = resolvePath(rawPath);

  const existing = dbConnections.get(resolvedPath);
  if (existing) return existing;

  const db = new Database(resolvedPath, { readonly: false });
  db.pragma('journal_mode = WAL');
  dbConnections.set(resolvedPath, db);

  if (!initializedDbs.has(resolvedPath)) {
    initializedDbs.add(resolvedPath);
    ensureAppTables(db);
  }

  return db;
}
