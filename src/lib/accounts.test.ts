import { describe, expect, it, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';

let testDb: InstanceType<typeof Database>;

vi.mock('./db/connection', () => ({
  getDb: () => testDb,
}));

import {
  createAccount,
  updateAccount,
  cloneAccount,
  deleteAccount,
} from './db/accounts';
import { Account } from './types';

function setupTestDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT NOT NULL,
      name TEXT NOT NULL,
      type INTEGER NOT NULL DEFAULT 0,
      vat_code INTEGER NOT NULL DEFAULT 0,
      vat_percentage REAL NOT NULL DEFAULT 0,
      vat_account1_id INTEGER,
      vat_account2_id INTEGER,
      flags INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE entry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      debit INTEGER NOT NULL DEFAULT 1,
      amount REAL NOT NULL DEFAULT 0,
      description TEXT NOT NULL DEFAULT '',
      row_number INTEGER NOT NULL DEFAULT 1,
      flags INTEGER NOT NULL DEFAULT 0
    )
  `);
  return db;
}

function insertAccount(
  db: InstanceType<typeof Database>,
  overrides: Partial<Account> & { number: string; name: string },
): Account {
  const row = {
    number: overrides.number,
    name: overrides.name,
    type: overrides.type ?? 0,
    vat_code: overrides.vat_code ?? 0,
    vat_percentage: overrides.vat_percentage ?? 0,
    vat_account1_id: overrides.vat_account1_id ?? null,
    vat_account2_id: overrides.vat_account2_id ?? null,
    flags: overrides.flags ?? 0,
  };
  const result = db
    .prepare(
      `INSERT INTO account (number, name, type, vat_code, vat_percentage, vat_account1_id, vat_account2_id, flags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.number,
      row.name,
      row.type,
      row.vat_code,
      row.vat_percentage,
      row.vat_account1_id,
      row.vat_account2_id,
      row.flags,
    );
  return { id: result.lastInsertRowid as number, ...row } as Account;
}

describe('createAccount', () => {
  beforeEach(() => {
    testDb = setupTestDb();
  });

  it('creates an account with required fields', () => {
    const result = createAccount({ number: '1000', name: 'Kassa', type: 0 });
    expect(result.id).toBeGreaterThan(0);
    expect(result.number).toBe('1000');
    expect(result.name).toBe('Kassa');
    expect(result.type).toBe(0);
    expect(result.vat_code).toBe(0);
    expect(result.vat_percentage).toBe(0);
  });

  it('creates an account with VAT fields', () => {
    const result = createAccount({
      number: '3000',
      name: 'Myynti',
      type: 3,
      vat_code: 1,
      vat_percentage: 25.5,
    });
    expect(result.vat_code).toBe(1);
    expect(result.vat_percentage).toBe(25.5);
  });

  it('rejects duplicate account number', () => {
    createAccount({ number: '1000', name: 'Kassa', type: 0 });
    expect(() =>
      createAccount({ number: '1000', name: 'Toinen kassa', type: 0 }),
    ).toThrow('Account number 1000 is already in use');
  });

  it('persists account to database', () => {
    createAccount({ number: '2000', name: 'Pankki', type: 0 });
    const row = testDb
      .prepare('SELECT * FROM account WHERE number = ?')
      .get('2000') as Account;
    expect(row).toBeDefined();
    expect(row.name).toBe('Pankki');
  });
});

describe('updateAccount', () => {
  beforeEach(() => {
    testDb = setupTestDb();
  });

  it('updates account name', () => {
    const original = insertAccount(testDb, {
      number: '1000',
      name: 'Kassa',
    });
    const updated = updateAccount(original.id, { name: 'Käteiskassa' });
    expect(updated.name).toBe('Käteiskassa');
    expect(updated.number).toBe('1000');
  });

  it('updates account number', () => {
    const original = insertAccount(testDb, {
      number: '1000',
      name: 'Kassa',
    });
    const updated = updateAccount(original.id, { number: '1001' });
    expect(updated.number).toBe('1001');
  });

  it('rejects duplicate number on update', () => {
    insertAccount(testDb, { number: '1000', name: 'Kassa' });
    const second = insertAccount(testDb, { number: '1001', name: 'Pankki' });
    expect(() => updateAccount(second.id, { number: '1000' })).toThrow(
      'Account number 1000 is already in use',
    );
  });

  it('allows keeping same number', () => {
    const original = insertAccount(testDb, {
      number: '1000',
      name: 'Kassa',
    });
    const updated = updateAccount(original.id, {
      number: '1000',
      name: 'Uusi nimi',
    });
    expect(updated.number).toBe('1000');
    expect(updated.name).toBe('Uusi nimi');
  });

  it('throws for nonexistent account', () => {
    expect(() => updateAccount(999, { name: 'Test' })).toThrow(
      'Account not found',
    );
  });

  it('updates multiple fields at once', () => {
    const original = insertAccount(testDb, {
      number: '3000',
      name: 'Myynti',
      type: 3,
    });
    const updated = updateAccount(original.id, {
      name: 'Palvelumyynti',
      type: 3,
      vat_percentage: 25.5,
    });
    expect(updated.name).toBe('Palvelumyynti');
    expect(updated.vat_percentage).toBe(25.5);
    expect(updated.number).toBe('3000');
  });

  it('persists changes to database', () => {
    const original = insertAccount(testDb, {
      number: '1000',
      name: 'Kassa',
    });
    updateAccount(original.id, { name: 'Kassatili' });
    const row = testDb
      .prepare('SELECT * FROM account WHERE id = ?')
      .get(original.id) as Account;
    expect(row.name).toBe('Kassatili');
  });
});

describe('cloneAccount', () => {
  beforeEach(() => {
    testDb = setupTestDb();
  });

  it('clones account with new number', () => {
    const source = insertAccount(testDb, {
      number: '3000',
      name: 'Myynti',
      type: 3,
      vat_percentage: 25.5,
    });
    const cloned = cloneAccount(source.id, '3001');
    expect(cloned.id).not.toBe(source.id);
    expect(cloned.number).toBe('3001');
    expect(cloned.name).toBe('Myynti (kopio)');
    expect(cloned.type).toBe(3);
    expect(cloned.vat_percentage).toBe(25.5);
  });

  it('clones account with custom name', () => {
    const source = insertAccount(testDb, {
      number: '3000',
      name: 'Myynti',
      type: 3,
    });
    const cloned = cloneAccount(source.id, '3001', 'Palvelumyynti');
    expect(cloned.name).toBe('Palvelumyynti');
  });

  it('preserves VAT and flags from source', () => {
    const source = insertAccount(testDb, {
      number: '3000',
      name: 'Myynti',
      type: 3,
      vat_code: 2,
      vat_percentage: 25.5,
      flags: 1,
    });
    const cloned = cloneAccount(source.id, '3001');
    expect(cloned.vat_code).toBe(2);
    expect(cloned.vat_percentage).toBe(25.5);
    expect(cloned.flags).toBe(1);
  });

  it('rejects clone to existing number', () => {
    insertAccount(testDb, { number: '3000', name: 'Myynti', type: 3 });
    const source = insertAccount(testDb, {
      number: '3001',
      name: 'Palvelumyynti',
      type: 3,
    });
    expect(() => cloneAccount(source.id, '3000')).toThrow(
      'Account number 3000 is already in use',
    );
  });

  it('throws for nonexistent source', () => {
    expect(() => cloneAccount(999, '1000')).toThrow('Source account not found');
  });

  it('creates independent database row', () => {
    const source = insertAccount(testDb, {
      number: '1000',
      name: 'Kassa',
      type: 0,
    });
    cloneAccount(source.id, '1001');
    const count = testDb
      .prepare('SELECT COUNT(*) as cnt FROM account')
      .get() as { cnt: number };
    expect(count.cnt).toBe(2);
  });
});

describe('deleteAccount', () => {
  beforeEach(() => {
    testDb = setupTestDb();
  });

  it('deletes an account with no entries', () => {
    const acc = insertAccount(testDb, { number: '1000', name: 'Kassa' });
    deleteAccount(acc.id);
    const row = testDb
      .prepare('SELECT id FROM account WHERE id = ?')
      .get(acc.id);
    expect(row).toBeUndefined();
  });

  it('throws for nonexistent account', () => {
    expect(() => deleteAccount(999)).toThrow('Account not found');
  });

  it('prevents deletion when account has entries', () => {
    const acc = insertAccount(testDb, { number: '1000', name: 'Kassa' });
    testDb
      .prepare(
        "INSERT INTO entry (document_id, account_id, debit, amount, description, row_number, flags) VALUES (1, ?, 1, 100, 'test', 1, 0)",
      )
      .run(acc.id);
    expect(() => deleteAccount(acc.id)).toThrow('Cannot delete account');
  });

  it('allows deletion after entries are removed', () => {
    const acc = insertAccount(testDb, { number: '1000', name: 'Kassa' });
    testDb
      .prepare(
        "INSERT INTO entry (document_id, account_id, debit, amount, description, row_number, flags) VALUES (1, ?, 1, 100, 'test', 1, 0)",
      )
      .run(acc.id);
    testDb.prepare('DELETE FROM entry WHERE account_id = ?').run(acc.id);
    deleteAccount(acc.id);
    const row = testDb
      .prepare('SELECT id FROM account WHERE id = ?')
      .get(acc.id);
    expect(row).toBeUndefined();
  });
});
