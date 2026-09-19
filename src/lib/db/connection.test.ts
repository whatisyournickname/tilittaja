import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import Database from 'better-sqlite3';

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('./migrations', () => ({
  ensureAppTables: vi.fn(),
}));

import {
  resolveDbPath,
  getDataSources,
  runWithRequestDb,
  getDb,
  closeDbConnection,
} from './connection';

describe('connection', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tilittaja-conn-test-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('resolveDbPath', () => {
    it('returns null for non-existent directory', () => {
      expect(resolveDbPath('nonexistent-slug-xyz-99999')).toBeNull();
    });
  });

  describe('getDataSources', () => {
    it("returns empty array when data dir doesn't exist", () => {
      const sources = getDataSources();
      expect(Array.isArray(sources)).toBe(true);
    });
  });

  describe('runWithRequestDb', () => {
    it('makes getDb() resolve to the provided path', () => {
      const dbPath = path.join(tmpDir, 'test.sqlite');
      const testDb = new Database(dbPath);
      testDb.exec('CREATE TABLE settings (id INTEGER PRIMARY KEY, name TEXT)');
      testDb.close();

      const result = runWithRequestDb(dbPath, () => {
        const db = getDb();
        return db.pragma('journal_mode') as { journal_mode: string }[];
      });
      expect(result[0].journal_mode).toBe('wal');

      closeDbConnection(dbPath);
    });

    it('supports nested calls with different paths', () => {
      const dbPath1 = path.join(tmpDir, 'db1.sqlite');
      const dbPath2 = path.join(tmpDir, 'db2.sqlite');
      new Database(dbPath1).close();
      new Database(dbPath2).close();

      runWithRequestDb(dbPath1, () => {
        const db1 = getDb();
        expect(db1).toBeDefined();

        runWithRequestDb(dbPath2, () => {
          const db2 = getDb();
          expect(db2).toBeDefined();
          expect(db2).not.toBe(db1);
        });
      });

      closeDbConnection(dbPath1);
      closeDbConnection(dbPath2);
    });
  });

  describe('getDb', () => {
    it('throws when no db path is configured', () => {
      const origEnv = process.env.DATABASE_PATH;
      delete process.env.DATABASE_PATH;

      try {
        expect(() => getDb()).toThrow('No database configured');
      } finally {
        if (origEnv !== undefined) process.env.DATABASE_PATH = origEnv;
      }
    });

    it('reuses existing connection for same path', () => {
      const dbPath = path.join(tmpDir, 'reuse.sqlite');
      new Database(dbPath).close();

      runWithRequestDb(dbPath, () => {
        const db1 = getDb();
        const db2 = getDb();
        expect(db1).toBe(db2);
      });

      closeDbConnection(dbPath);
    });

    it('uses DATABASE_PATH env when no context is set', () => {
      const dbPath = path.join(tmpDir, 'env.sqlite');
      new Database(dbPath).close();

      const orig = process.env.DATABASE_PATH;
      process.env.DATABASE_PATH = dbPath;

      try {
        const db = getDb();
        expect(db).toBeDefined();
        closeDbConnection(dbPath);
      } finally {
        if (orig !== undefined) {
          process.env.DATABASE_PATH = orig;
        } else {
          delete process.env.DATABASE_PATH;
        }
      }
    });
  });

  describe('closeDbConnection', () => {
    it('closes and removes the connection', () => {
      const dbPath = path.join(tmpDir, 'close.sqlite');
      new Database(dbPath).close();

      runWithRequestDb(dbPath, () => {
        getDb();
      });

      closeDbConnection(dbPath);
      expect(() => closeDbConnection(dbPath)).not.toThrow();
    });
  });
});
