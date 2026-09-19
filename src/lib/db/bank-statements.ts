import {
  BankStatement,
  BankStatementEntry,
  BankStatementWithStats,
  BankStatementEntryWithAccount,
} from '../types';
import { getDb } from './connection';
import { createDocument, createEntry } from './documents';
import { ensureAppTables } from './migrations';

interface DocumentBankStatementLinkSummary {
  document_id: number;
  bank_statement_id: number;
  bank_statement_period_start: number;
  bank_statement_period_end: number;
  bank_statement_account_number: string;
  bank_statement_account_name: string;
  linked_entry_count: number;
}

interface UnlinkedBankStatementEntrySummary {
  id: number;
  bank_statement_id: number;
  entry_date: number;
  amount: number;
  counterparty: string;
  reference: string | null;
  message: string | null;
  transaction_number: number;
  bank_statement_period_start: number;
  bank_statement_period_end: number;
  bank_statement_account_number: string;
  bank_statement_account_name: string;
}

export function ensureBankStatementTables(): void {
  ensureAppTables(getDb());
}

export function createBankStatement(data: {
  account_id: number;
  iban: string;
  period_start: number;
  period_end: number;
  opening_balance: number;
  closing_balance: number;
  source_file: string;
}): BankStatement {
  const now = Date.now();
  const result = getDb()
    .prepare(
      `INSERT INTO bank_statement (account_id, iban, period_start, period_end, opening_balance, closing_balance, source_file, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      data.account_id,
      data.iban,
      data.period_start,
      data.period_end,
      data.opening_balance,
      data.closing_balance,
      data.source_file,
      now,
    );

  return {
    id: result.lastInsertRowid as number,
    ...data,
    created_at: now,
  };
}

export function createBankStatementEntry(data: {
  bank_statement_id: number;
  entry_date: number;
  value_date: number;
  archive_id: string;
  counterparty: string;
  counterparty_iban: string | null;
  reference: string | null;
  message: string | null;
  payment_type: string;
  transaction_number: number;
  amount: number;
  counterpart_account_id: number | null;
}): BankStatementEntry {
  const result = getDb()
    .prepare(
      `INSERT INTO bank_statement_entry
       (bank_statement_id, entry_date, value_date, archive_id, counterparty, counterparty_iban, reference, message, payment_type, transaction_number, amount, counterpart_account_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      data.bank_statement_id,
      data.entry_date,
      data.value_date,
      data.archive_id,
      data.counterparty,
      data.counterparty_iban,
      data.reference,
      data.message,
      data.payment_type,
      data.transaction_number,
      data.amount,
      data.counterpart_account_id,
    );

  return {
    id: result.lastInsertRowid as number,
    ...data,
    document_id: null,
  };
}

export function getBankStatements(filter?: {
  periodStart?: number;
  periodEnd?: number;
}): BankStatementWithStats[] {
  const whereClauses: string[] = [];
  const params: number[] = [];

  if (filter?.periodStart != null && filter?.periodEnd != null) {
    whereClauses.push('bs.period_start <= ?', 'bs.period_end >= ?');
    params.push(filter.periodEnd, filter.periodStart);
  }

  const whereSql =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  return getDb()
    .prepare(
      `SELECT bs.*,
              a.number as account_number, a.name as account_name,
              COUNT(bse.id) as entry_count,
              SUM(CASE WHEN d.id IS NOT NULL THEN 1 ELSE 0 END) as processed_count
       FROM bank_statement bs
       JOIN account a ON a.id = bs.account_id
       LEFT JOIN bank_statement_entry bse ON bse.bank_statement_id = bs.id
       LEFT JOIN document d ON d.id = bse.document_id
       ${whereSql}
       GROUP BY bs.id
       ORDER BY bs.period_start DESC`,
    )
    .all(...params) as BankStatementWithStats[];
}

export function getBankStatement(
  id: number,
): BankStatementWithStats | undefined {
  return getDb()
    .prepare(
      `SELECT bs.*,
              a.number as account_number, a.name as account_name,
              COUNT(bse.id) as entry_count,
              SUM(CASE WHEN d.id IS NOT NULL THEN 1 ELSE 0 END) as processed_count
       FROM bank_statement bs
       JOIN account a ON a.id = bs.account_id
       LEFT JOIN bank_statement_entry bse ON bse.bank_statement_id = bs.id
       LEFT JOIN document d ON d.id = bse.document_id
       WHERE bs.id = ?
       GROUP BY bs.id`,
    )
    .get(id) as BankStatementWithStats | undefined;
}

export function getBankStatementEntry(
  id: number,
): BankStatementEntry | undefined {
  return getDb()
    .prepare('SELECT * FROM bank_statement_entry WHERE id = ?')
    .get(id) as BankStatementEntry | undefined;
}

export function getBankStatementEntries(
  statementId: number,
): BankStatementEntryWithAccount[] {
  return getDb()
    .prepare(
      `SELECT bse.id,
              bse.bank_statement_id,
              bse.entry_date,
              bse.value_date,
              bse.archive_id,
              bse.counterparty,
              bse.counterparty_iban,
              bse.reference,
              bse.message,
              bse.payment_type,
              bse.transaction_number,
              bse.amount,
              CASE WHEN d.id IS NULL THEN NULL ELSE bse.document_id END as document_id,
              bse.counterpart_account_id,
              ca.number as counterpart_account_number, ca.name as counterpart_account_name,
              d.number as document_number
       FROM bank_statement_entry bse
       LEFT JOIN account ca ON ca.id = bse.counterpart_account_id
       LEFT JOIN document d ON d.id = bse.document_id
       WHERE bse.bank_statement_id = ?
       ORDER BY bse.entry_date, bse.transaction_number`,
    )
    .all(statementId) as BankStatementEntryWithAccount[];
}

export function getDocumentBankStatementLinks(
  documentIds: number[],
): Map<number, DocumentBankStatementLinkSummary[]> {
  if (documentIds.length === 0) {
    return new Map();
  }

  const rows = getDb()
    .prepare(
      `SELECT bse.document_id,
              bs.id as bank_statement_id,
              bs.period_start as bank_statement_period_start,
              bs.period_end as bank_statement_period_end,
              a.number as bank_statement_account_number,
              a.name as bank_statement_account_name,
              COUNT(*) as linked_entry_count
       FROM bank_statement_entry bse
       JOIN bank_statement bs ON bs.id = bse.bank_statement_id
       JOIN account a ON a.id = bs.account_id
       WHERE bse.document_id IN (${documentIds.map(() => '?').join(',')})
       GROUP BY
         bse.document_id,
         bs.id,
         bs.period_start,
         bs.period_end,
         a.number,
         a.name
       ORDER BY bse.document_id, bs.period_start DESC, bs.id DESC`,
    )
    .all(...documentIds) as DocumentBankStatementLinkSummary[];

  const summariesByDocumentId = new Map<
    number,
    DocumentBankStatementLinkSummary[]
  >();

  rows.forEach((row) => {
    const current = summariesByDocumentId.get(row.document_id) ?? [];
    current.push(row);
    summariesByDocumentId.set(row.document_id, current);
  });

  return summariesByDocumentId;
}

export function getUnlinkedBankStatementEntriesForPeriod(
  periodStart: number,
  periodEnd: number,
): UnlinkedBankStatementEntrySummary[] {
  return getDb()
    .prepare(
      `SELECT bse.id,
              bse.bank_statement_id,
              bse.entry_date,
              bse.amount,
              bse.counterparty,
              bse.reference,
              bse.message,
              bse.transaction_number,
              bs.period_start as bank_statement_period_start,
              bs.period_end as bank_statement_period_end,
              a.number as bank_statement_account_number,
              a.name as bank_statement_account_name
       FROM bank_statement_entry bse
       JOIN bank_statement bs ON bs.id = bse.bank_statement_id
       JOIN account a ON a.id = bs.account_id
       LEFT JOIN document d ON d.id = bse.document_id
       WHERE d.id IS NULL
         AND bse.entry_date BETWEEN ? AND ?
       ORDER BY bse.entry_date ASC, bse.transaction_number ASC, bse.id ASC`,
    )
    .all(periodStart, periodEnd) as UnlinkedBankStatementEntrySummary[];
}

export function deleteBankStatement(statementId: number): boolean {
  const db = getDb();
  const exists = db
    .prepare('SELECT 1 as found FROM bank_statement WHERE id = ? LIMIT 1')
    .get(statementId) as { found: number } | undefined;

  if (!exists) {
    return false;
  }

  const deleteInTransaction = db.transaction((id: number) => {
    db.prepare(
      'DELETE FROM bank_statement_entry WHERE bank_statement_id = ?',
    ).run(id);
    db.prepare('DELETE FROM bank_statement WHERE id = ?').run(id);
  });

  deleteInTransaction(statementId);
  return true;
}

export function updateBankStatementEntry(
  id: number,
  data: { counterpart_account_id?: number | null; document_id?: number | null },
): void {
  if (data.counterpart_account_id !== undefined) {
    getDb()
      .prepare(
        'UPDATE bank_statement_entry SET counterpart_account_id = ? WHERE id = ?',
      )
      .run(data.counterpart_account_id, id);
  }

  if (data.document_id !== undefined) {
    getDb()
      .prepare('UPDATE bank_statement_entry SET document_id = ? WHERE id = ?')
      .run(data.document_id, id);
  }
}

export function createDocumentsFromBankStatementEntries(
  entryIds: number[],
  bankAccountId: number,
  periodId: number,
): { created: number; errors: string[] } {
  const db = getDb();
  const errors: string[] = [];
  let created = 0;

  const entries = db
    .prepare(
      `SELECT bse.*, ca.number as counterpart_account_number, ca.name as counterpart_account_name,
              ca.vat_code, ca.vat_percentage, ca.vat_account1_id
       FROM bank_statement_entry bse
       LEFT JOIN document d ON d.id = bse.document_id
       LEFT JOIN account ca ON ca.id = bse.counterpart_account_id
       WHERE bse.id IN (${entryIds.map(() => '?').join(',')}) AND d.id IS NULL`,
    )
    .all(...entryIds) as (BankStatementEntry & {
    counterpart_account_number: string | null;
    counterpart_account_name: string | null;
    vat_code: number | null;
    vat_percentage: number | null;
    vat_account1_id: number | null;
  })[];

  const createInTransaction = db.transaction(() => {
    for (const entry of entries) {
      if (!entry.counterpart_account_id) {
        errors.push(
          `Row ${entry.transaction_number}: counterpart account not selected`,
        );
        continue;
      }

      const doc = createDocument(periodId, entry.entry_date);
      const description = [entry.counterparty, entry.message || entry.reference]
        .filter(Boolean)
        .join(' - ');
      const absAmount = Math.abs(entry.amount);

      if (entry.amount > 0) {
        createEntry(doc.id, bankAccountId, true, absAmount, description, 1);
        createEntry(
          doc.id,
          entry.counterpart_account_id,
          false,
          absAmount,
          description,
          2,
        );
      } else {
        const hasVat =
          entry.vat_percentage &&
          entry.vat_percentage > 0 &&
          entry.vat_account1_id;
        if (hasVat) {
          const vatRate = entry.vat_percentage! / 100;
          const netAmount = Math.round((absAmount / (1 + vatRate)) * 100) / 100;
          const vatAmount = Math.round((absAmount - netAmount) * 100) / 100;

          createEntry(
            doc.id,
            entry.counterpart_account_id,
            true,
            netAmount,
            description,
            1,
          );
          createEntry(doc.id, entry.vat_account1_id!, true, vatAmount, '', 2);
          createEntry(doc.id, bankAccountId, false, absAmount, description, 3);
        } else {
          createEntry(
            doc.id,
            entry.counterpart_account_id,
            true,
            absAmount,
            description,
            1,
          );
          createEntry(doc.id, bankAccountId, false, absAmount, description, 2);
        }
      }

      db.prepare(
        'UPDATE bank_statement_entry SET document_id = ? WHERE id = ?',
      ).run(doc.id, entry.id);
      created++;
    }
  });

  createInTransaction();
  return { created, errors };
}

export function bankStatementArchiveIdExists(archiveId: string): boolean {
  const row = getDb()
    .prepare('SELECT 1 FROM bank_statement_entry WHERE archive_id = ? LIMIT 1')
    .get(archiveId);
  return !!row;
}
