import { beforeEach, describe, expect, it, vi } from 'vitest';
import { account, entry } from '@/lib/test-helpers';

const dbMocks = vi.hoisted(() => ({
  getAccounts: vi.fn(),
  getDocumentBalances: vi.fn(),
  getDocumentMetadataMap: vi.fn(),
  getDocumentReceiptLinks: vi.fn(),
  getDocuments: vi.fn(),
  getEntriesForPeriod: vi.fn(),
  getPeriods: vi.fn(),
  getReportStructure: vi.fn(),
  getSettingProperties: vi.fn(),
  getSettings: vi.fn(),
  getUnlinkedBankStatementEntriesForPeriod: vi.fn(),
  getBankStatements: vi.fn(),
}));

vi.mock('@/lib/db/documents', () => ({
  getAccounts: dbMocks.getAccounts,
  getDocumentBalances: dbMocks.getDocumentBalances,
  getDocuments: dbMocks.getDocuments,
  getEntriesForPeriod: dbMocks.getEntriesForPeriod,
  getPeriods: dbMocks.getPeriods,
  getReportStructure: dbMocks.getReportStructure,
}));

vi.mock('@/lib/db/settings', () => ({
  getSettingProperties: dbMocks.getSettingProperties,
  getSettings: dbMocks.getSettings,
}));

vi.mock('@/lib/db/bank-statements', () => ({
  getBankStatements: dbMocks.getBankStatements,
  getUnlinkedBankStatementEntriesForPeriod:
    dbMocks.getUnlinkedBankStatementEntriesForPeriod,
}));

vi.mock('@/lib/db/metadata-receipts', () => ({
  getDocumentMetadataMap: dbMocks.getDocumentMetadataMap,
  getDocumentReceiptLinks: dbMocks.getDocumentReceiptLinks,
}));

import { buildReadinessSummary } from '@/lib/financial-statement';

function baseMocks() {
  dbMocks.getPeriods.mockReturnValue([
    {
      id: 1,
      start_date: Date.UTC(2024, 0, 1),
      end_date: Date.UTC(2024, 11, 31),
      locked: false,
    },
  ]);
  dbMocks.getAccounts.mockReturnValue([
    account({ id: 1, number: '1000', name: 'Kassa', type: 0 }),
    account({ id: 2, number: '3000', name: 'Myynti', type: 3 }),
  ]);
  dbMocks.getDocuments.mockReturnValue([
    { id: 10, number: 1, period_id: 1, date: Date.UTC(2024, 1, 1) },
    { id: 11, number: 2, period_id: 1, date: Date.UTC(2024, 2, 1) },
  ]);
  dbMocks.getDocumentBalances.mockReturnValue([
    { document_number: 1, total_debit: 100, total_credit: 100 },
    { document_number: 2, total_debit: 200, total_credit: 200 },
  ]);
  dbMocks.getDocumentReceiptLinks.mockReturnValue(
    new Map([
      [10, '/tmp/receipt-1.pdf'],
      [11, '/tmp/receipt-2.pdf'],
    ]),
  );
  dbMocks.getEntriesForPeriod.mockReturnValue([
    entry({
      document_id: 10,
      account_id: 1,
      debit: true,
      amount: 100,
      row_number: 1,
    }),
    entry({
      document_id: 10,
      account_id: 2,
      debit: false,
      amount: 100,
      row_number: 2,
    }),
    entry({
      document_id: 11,
      account_id: 1,
      debit: true,
      amount: 200,
      row_number: 1,
    }),
    entry({
      document_id: 11,
      account_id: 2,
      debit: false,
      amount: 200,
      row_number: 2,
    }),
  ]);
  dbMocks.getDocumentMetadataMap.mockReturnValue(new Map());
  dbMocks.getBankStatements.mockReturnValue([
    {
      id: 1,
      account_id: 1,
      iban: 'FI123',
      period_start: Date.UTC(2024, 0, 1),
      period_end: Date.UTC(2024, 11, 31),
      opening_balance: 0,
      closing_balance: 300,
      source_file: 'statement.xml',
      created_at: Date.UTC(2024, 11, 31),
      entry_count: 2,
      processed_count: 2,
      account_number: '1000',
      account_name: 'Kassa',
    },
  ]);
  dbMocks.getUnlinkedBankStatementEntriesForPeriod.mockReturnValue([]);
}

describe('buildReadinessSummary - extended', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    baseMocks();
  });

  it('returns empty summary for non-existent period', () => {
    const summary = buildReadinessSummary(999);
    expect(summary.sections).toHaveLength(0);
    expect(summary.blockerCount).toBe(1);
    expect(summary.canLock).toBe(false);
  });

  it('reports all-green documents section when everything is balanced and has receipts', () => {
    const summary = buildReadinessSummary(1);
    const docSection = summary.sections.find((s) => s.title === 'Documents');

    expect(docSection).toBeDefined();
    expect(docSection!.allOk).toBe(true);
    expect(
      docSection!.items.find((i) => i.label === 'Number of documents')!.ok,
    ).toBe(true);
    expect(
      docSection!.items.find((i) => i.label === 'Number of documents')!.count,
    ).toBe(2);
    expect(
      docSection!.items.find((i) => i.label === 'Unbalanced documents')!.ok,
    ).toBe(true);
    expect(
      docSection!.items.find((i) => i.label === 'Empty documents')!.ok,
    ).toBe(true);
    expect(
      docSection!.items.find((i) => i.label === 'Document receipts')!.ok,
    ).toBe(true);
  });

  it('flags unbalanced documents', () => {
    dbMocks.getDocumentBalances.mockReturnValue([
      { document_number: 1, total_debit: 100, total_credit: 99 },
      { document_number: 2, total_debit: 200, total_credit: 200 },
    ]);

    const summary = buildReadinessSummary(1);
    const docSection = summary.sections.find((s) => s.title === 'Documents')!;
    const unbalanced = docSection.items.find(
      (i) => i.label === 'Unbalanced documents',
    )!;

    expect(unbalanced.ok).toBe(false);
    expect(unbalanced.count).toBe(1);
    expect(unbalanced.details).toContain('#1');
    expect(summary.canLock).toBe(false);
  });

  it('flags empty documents', () => {
    dbMocks.getDocumentBalances.mockReturnValue([
      { document_number: 1, total_debit: 0, total_credit: 0 },
      { document_number: 2, total_debit: 200, total_credit: 200 },
    ]);

    const summary = buildReadinessSummary(1);
    const docSection = summary.sections.find((s) => s.title === 'Documents')!;
    const empty = docSection.items.find((i) => i.label === 'Empty documents')!;

    expect(empty.ok).toBe(false);
    expect(empty.count).toBe(1);
  });

  it('flags documents missing receipts', () => {
    dbMocks.getDocumentReceiptLinks.mockReturnValue(
      new Map([[10, '/tmp/receipt-1.pdf']]),
    );

    const summary = buildReadinessSummary(1);
    const docSection = summary.sections.find((s) => s.title === 'Documents')!;
    const receipts = docSection.items.find(
      (i) => i.label === 'Document receipts',
    )!;

    expect(receipts.ok).toBe(false);
    expect(receipts.count).toBe(1);
    expect(receipts.total).toBe(2);
  });

  it('reports bank statement section with all linked entries', () => {
    const summary = buildReadinessSummary(1);
    const bsSection = summary.sections.find((s) => s.title === 'Bank statements')!;

    expect(bsSection.allOk).toBe(true);
    expect(
      bsSection.items.find((i) => i.label === 'Bank statements in period')!.ok,
    ).toBe(true);
    expect(
      bsSection.items.find(
        (i) => i.label === 'Unlinked bank transactions',
      )!.ok,
    ).toBe(true);
    expect(
      bsSection.items.find((i) => i.label === 'Processed bank transactions')!.ok,
    ).toBe(true);
  });

  it('flags unlinked bank statement entries', () => {
    dbMocks.getUnlinkedBankStatementEntriesForPeriod.mockReturnValue([
      { id: 1, amount: 50, date: Date.UTC(2024, 5, 1) },
    ]);

    const summary = buildReadinessSummary(1);
    const bsSection = summary.sections.find((s) => s.title === 'Bank statements')!;
    const unlinked = bsSection.items.find(
      (i) => i.label === 'Unlinked bank transactions',
    )!;

    expect(unlinked.ok).toBe(false);
    expect(unlinked.count).toBe(1);
  });

  it('flags missing bank statements', () => {
    dbMocks.getBankStatements.mockReturnValue([]);

    const summary = buildReadinessSummary(1);
    const bsSection = summary.sections.find((s) => s.title === 'Bank statements')!;

    expect(
      bsSection.items.find((i) => i.label === 'Bank statements in period')!.ok,
    ).toBe(false);
    expect(
      bsSection.items.find((i) => i.label === 'Processed bank transactions')!.ok,
    ).toBe(false);
  });

  it('reports no VAT activity when no VAT-coded accounts exist', () => {
    const summary = buildReadinessSummary(1);
    const vatSection = summary.sections.find((s) => s.title === 'VAT')!;

    expect(vatSection.allOk).toBe(true);
    expect(
      vatSection.items.find((i) => i.label === 'VAT net for period')!
        .details,
    ).toContain('No VAT activity');
  });

  it('canLock is true when all documents are balanced', () => {
    const summary = buildReadinessSummary(1);
    expect(summary.canLock).toBe(true);
  });

  it('counts all non-ok items as blockers', () => {
    dbMocks.getDocumentBalances.mockReturnValue([
      { document_number: 1, total_debit: 100, total_credit: 99 },
      { document_number: 2, total_debit: 0, total_credit: 0 },
    ]);
    dbMocks.getDocumentReceiptLinks.mockReturnValue(new Map());
    dbMocks.getBankStatements.mockReturnValue([]);

    const summary = buildReadinessSummary(1);
    expect(summary.blockerCount).toBeGreaterThan(3);
  });
});
