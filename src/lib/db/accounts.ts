import { Account } from '../types';
import { getDb } from './connection';

interface CreateAccountInput {
  number: string;
  name: string;
  type: number;
  vat_code?: number;
  vat_percentage?: number;
  vat_account1_id?: number | null;
  vat_account2_id?: number | null;
  flags?: number;
}

interface UpdateAccountInput {
  number?: string;
  name?: string;
  type?: number;
  vat_code?: number;
  vat_percentage?: number;
  vat_account1_id?: number | null;
  vat_account2_id?: number | null;
  flags?: number;
}

export function createAccount(input: CreateAccountInput): Account {
  const db = getDb();

  const existing = db
    .prepare('SELECT id FROM account WHERE number = ?')
    .get(input.number);
  if (existing) {
    throw new Error(`Account number ${input.number} is already in use`);
  }

  const result = db
    .prepare(
      `INSERT INTO account (number, name, type, vat_code, vat_percentage, vat_account1_id, vat_account2_id, flags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.number,
      input.name,
      input.type,
      input.vat_code ?? 0,
      input.vat_percentage ?? 0,
      input.vat_account1_id ?? null,
      input.vat_account2_id ?? null,
      input.flags ?? 0,
    );

  return {
    id: result.lastInsertRowid as number,
    number: input.number,
    name: input.name,
    type: input.type as Account['type'],
    vat_code: input.vat_code ?? 0,
    vat_percentage: input.vat_percentage ?? 0,
    vat_account1_id: input.vat_account1_id ?? null,
    vat_account2_id: input.vat_account2_id ?? null,
    flags: input.flags ?? 0,
  };
}

export function updateAccount(id: number, input: UpdateAccountInput): Account {
  const db = getDb();

  const existing = db.prepare('SELECT * FROM account WHERE id = ?').get(id) as
    | Account
    | undefined;
  if (!existing) {
    throw new Error('Account not found');
  }

  if (input.number !== undefined && input.number !== existing.number) {
    const conflict = db
      .prepare('SELECT id FROM account WHERE number = ? AND id != ?')
      .get(input.number, id);
    if (conflict) {
      throw new Error(`Account number ${input.number} is already in use`);
    }
  }

  const updated = {
    number: input.number ?? existing.number,
    name: input.name ?? existing.name,
    type: input.type ?? existing.type,
    vat_code: input.vat_code ?? existing.vat_code,
    vat_percentage: input.vat_percentage ?? existing.vat_percentage,
    vat_account1_id:
      input.vat_account1_id !== undefined
        ? input.vat_account1_id
        : existing.vat_account1_id,
    vat_account2_id:
      input.vat_account2_id !== undefined
        ? input.vat_account2_id
        : existing.vat_account2_id,
    flags: input.flags ?? existing.flags,
  };

  db.prepare(
    `UPDATE account SET number = ?, name = ?, type = ?, vat_code = ?, vat_percentage = ?,
     vat_account1_id = ?, vat_account2_id = ?, flags = ? WHERE id = ?`,
  ).run(
    updated.number,
    updated.name,
    updated.type,
    updated.vat_code,
    updated.vat_percentage,
    updated.vat_account1_id,
    updated.vat_account2_id,
    updated.flags,
    id,
  );

  return { id, ...updated } as Account;
}

export function deleteAccount(id: number): void {
  const db = getDb();

  const existing = db.prepare('SELECT id FROM account WHERE id = ?').get(id);
  if (!existing) {
    throw new Error('Account not found');
  }

  const entryCount = db
    .prepare('SELECT COUNT(*) as cnt FROM entry WHERE account_id = ?')
    .get(id) as { cnt: number };
  if (entryCount.cnt > 0) {
    throw new Error(
      `Cannot delete account: it has ${entryCount.cnt} entries`,
    );
  }

  db.prepare('DELETE FROM account WHERE id = ?').run(id);
}

export function cloneAccount(
  sourceId: number,
  newNumber: string,
  newName?: string,
): Account {
  const db = getDb();

  const source = db
    .prepare('SELECT * FROM account WHERE id = ?')
    .get(sourceId) as Account | undefined;
  if (!source) {
    throw new Error('Source account not found');
  }

  return createAccount({
    number: newNumber,
    name: newName ?? `${source.name} (kopio)`,
    type: source.type,
    vat_code: source.vat_code,
    vat_percentage: source.vat_percentage,
    vat_account1_id: source.vat_account1_id,
    vat_account2_id: source.vat_account2_id,
    flags: source.flags,
  });
}
