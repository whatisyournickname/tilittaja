import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbConnectionMocks = vi.hoisted(() => ({
  resolveRequestDbPath: vi.fn(),
  runWithRequestDb: vi.fn(),
}));
vi.mock('@/lib/db/connection', () => dbConnectionMocks);

const dbMocks = vi.hoisted(() => ({
  getAccounts: vi.fn(),
  getDocument: vi.fn(),
  getDocumentMetadata: vi.fn(),
  getEntriesForDocument: vi.fn(),
  getEntriesForPeriod: vi.fn(),
  getDb: vi.fn(),
  createDocument: vi.fn(),
  createEntry: vi.fn(),
  deleteDocument: vi.fn(),
  updateDocumentDate: vi.fn(),
  updateDocumentMetadata: vi.fn(),
  updateEntryAmount: vi.fn(),
  deleteEntry: vi.fn(),
  setDocumentReceiptLink: vi.fn(),
  requireCurrentDataSource: vi.fn(),
  resolveDbPath: vi.fn(),
  closeDbConnection: vi.fn(),
  getBankStatement: vi.fn(),
  getBankStatementEntries: vi.fn(),
  getSettings: vi.fn(),
  createDocumentsFromBankStatementEntries: vi.fn(),
  getAccount: vi.fn(),
  getEntry: vi.fn(),
  updateEntryAccount: vi.fn(),
  updateEntryDescription: vi.fn(),
  getPeriod: vi.fn(),
  setPeriodLocked: vi.fn(),
  updateBankStatementEntry: vi.fn(),
}));
vi.mock('@/lib/db', () => dbMocks);

const periodLockMocks = vi.hoisted(() => ({
  requireUnlockedDocumentPeriod: vi.fn(),
  requireUnlockedTargetPeriod: vi.fn(),
  requireUnlockedEntryPeriod: vi.fn(),
  requireUnlockedBankStatementPeriod: vi.fn(),
  requireUnlockedBankStatementEntryPeriod: vi.fn(),
  requireUnlockedDocumentPeriodById: vi.fn(),
  requireUnlockedExistingPeriod: vi.fn(),
}));
vi.mock('@/lib/period-locks', () => periodLockMocks);

const vatMocks = vi.hoisted(() => ({
  buildVatSettlementPreview: vi.fn(),
}));
vi.mock('@/lib/vat-report', () => vatMocks);

const receiptMocks = vi.hoisted(() => ({
  resolveBankStatementPdfAbsolutePath: vi.fn(),
}));
vi.mock('@/lib/receipt-pdfs', () => receiptMocks);

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const cookieMocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => cookieMocks),
}));

vi.mock('@/lib/state-transfer', () => ({
  readImportedStateArchive: vi.fn(),
  importStateArchiveAsNewSource: vi.fn(),
}));

vi.mock('@/lib/env', () => ({
  getEnv: vi.fn(() => ({ NODE_ENV: 'test' })),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    default: { ...actual, existsSync: vi.fn(() => false), unlinkSync: vi.fn() },
  };
});

import {
  saveDocumentEntriesAction,
  duplicateDocumentAction,
  createVatSettlementAction,
  importStateTransferAction,
  deleteDocumentAction,
  deleteDocumentsAction,
  updateEntryAccountAction,
  setPeriodLockAction,
} from './app-actions';

beforeEach(() => {
  vi.clearAllMocks();
  dbConnectionMocks.resolveRequestDbPath.mockResolvedValue('/fake/path');
  dbConnectionMocks.runWithRequestDb.mockImplementation(
    (_path: string, fn: () => unknown) => fn(),
  );
  dbMocks.requireCurrentDataSource.mockResolvedValue('demo');
  cookieMocks.get.mockReturnValue({ value: 'demo' });
});

describe('saveDocumentEntriesAction', () => {
  it('updates entry amounts and deletes entries in a transaction', async () => {
    dbMocks.getDocument.mockReturnValue({
      id: 1,
      period_id: 1,
      date: Date.UTC(2025, 0, 1),
    });
    dbMocks.getEntriesForDocument.mockReturnValue([
      {
        id: 10,
        document_id: 1,
        account_id: 1,
        debit: true,
        amount: 100,
        row_number: 1,
        flags: 0,
      },
      {
        id: 11,
        document_id: 1,
        account_id: 2,
        debit: false,
        amount: 80,
        row_number: 2,
        flags: 0,
      },
      {
        id: 12,
        document_id: 1,
        account_id: 3,
        debit: false,
        amount: 20,
        row_number: 3,
        flags: 0,
      },
    ]);
    dbMocks.getDb.mockReturnValue({
      transaction: (fn: () => unknown) => fn,
    });

    const result = await saveDocumentEntriesAction(1, {
      entries: [
        { id: 10, amount: 100 },
        { id: 11, amount: 100 },
      ],
      deletedEntryIds: [12],
    });

    expect(result.entries).toHaveLength(2);
    expect(result.deletedEntryIds).toEqual([12]);
    expect(dbMocks.updateEntryAmount).toHaveBeenCalledWith(10, 100);
    expect(dbMocks.updateEntryAmount).toHaveBeenCalledWith(11, 100);
    expect(dbMocks.deleteEntry).toHaveBeenCalledWith(12);
  });

  it("rejects when debit/credit don't balance", async () => {
    dbMocks.getDocument.mockReturnValue({
      id: 1,
      period_id: 1,
      date: Date.UTC(2025, 0, 1),
    });
    dbMocks.getEntriesForDocument.mockReturnValue([
      {
        id: 10,
        document_id: 1,
        account_id: 1,
        debit: true,
        amount: 100,
        row_number: 1,
        flags: 0,
      },
      {
        id: 11,
        document_id: 1,
        account_id: 2,
        debit: false,
        amount: 100,
        row_number: 2,
        flags: 0,
      },
    ]);

    await expect(
      saveDocumentEntriesAction(1, {
        entries: [
          { id: 10, amount: 150 },
          { id: 11, amount: 100 },
        ],
      }),
    ).rejects.toThrow('balance');
  });

  it('rejects when fewer than 2 entries remain after deletion', async () => {
    dbMocks.getDocument.mockReturnValue({
      id: 1,
      period_id: 1,
      date: Date.UTC(2025, 0, 1),
    });
    dbMocks.getEntriesForDocument.mockReturnValue([
      {
        id: 10,
        document_id: 1,
        account_id: 1,
        debit: true,
        amount: 100,
        row_number: 1,
        flags: 0,
      },
      {
        id: 11,
        document_id: 1,
        account_id: 2,
        debit: false,
        amount: 100,
        row_number: 2,
        flags: 0,
      },
    ]);

    await expect(
      saveDocumentEntriesAction(1, {
        entries: [{ id: 10, amount: 100 }],
        deletedEntryIds: [11],
      }),
    ).rejects.toThrow('at least two');
  });
});

describe('duplicateDocumentAction', () => {
  it('duplicates a document with its entries', async () => {
    dbMocks.getAccounts.mockReturnValue([
      {
        id: 1,
        number: '1000',
        name: 'Kassa',
        type: 0,
        vat_code: 0,
        vat_percentage: 0,
        vat_account1_id: null,
        vat_account2_id: null,
        flags: 0,
      },
    ]);
    dbMocks.getDocument.mockReturnValue({
      id: 1,
      number: 1,
      period_id: 1,
      date: Date.UTC(2025, 0, 1),
    });
    dbMocks.getDocumentMetadata.mockReturnValue({
      category: 'MU',
      name: 'Testi',
    });
    dbMocks.getEntriesForDocument
      .mockReturnValueOnce([
        {
          id: 10,
          document_id: 1,
          account_id: 1,
          account_number: '1000',
          account_name: 'Kassa',
          debit: true,
          amount: 100,
          description: 'Testi',
          row_number: 1,
          flags: 0,
        },
        {
          id: 11,
          document_id: 1,
          account_id: 1,
          account_number: '1000',
          account_name: 'Kassa',
          debit: false,
          amount: 100,
          description: 'Testi',
          row_number: 2,
          flags: 0,
        },
      ])
      .mockReturnValueOnce([
        {
          id: 20,
          document_id: 2,
          account_id: 1,
          account_number: '1000',
          account_name: 'Kassa',
          debit: true,
          amount: 100,
          description: 'Testi',
          row_number: 1,
          flags: 0,
        },
        {
          id: 21,
          document_id: 2,
          account_id: 1,
          account_number: '1000',
          account_name: 'Kassa',
          debit: false,
          amount: 100,
          description: 'Testi',
          row_number: 2,
          flags: 0,
        },
      ]);
    dbMocks.createDocument.mockReturnValue({
      id: 2,
      number: 2,
      date: Date.UTC(2025, 0, 1),
    });
    dbMocks.getDb.mockReturnValue({
      transaction: (fn: () => unknown) => fn,
    });

    const result = await duplicateDocumentAction(1);

    expect(result.document.id).toBe(2);
    expect(result.document.entries).toHaveLength(2);
    expect(dbMocks.createEntry).toHaveBeenCalledTimes(2);
    expect(dbMocks.setDocumentReceiptLink).toHaveBeenCalledWith(2, '');
  });

  it('rejects when document has no entries', async () => {
    dbMocks.getAccounts.mockReturnValue([]);
    dbMocks.getDocument.mockReturnValue({
      id: 1,
      number: 1,
      period_id: 1,
      date: Date.UTC(2025, 0, 1),
    });
    dbMocks.getDocumentMetadata.mockReturnValue(null);
    dbMocks.getEntriesForDocument.mockReturnValue([]);

    await expect(duplicateDocumentAction(1)).rejects.toThrow(
      'no entry rows to copy',
    );
  });
});

describe('createVatSettlementAction', () => {
  it('creates a VAT settlement document with entries', async () => {
    dbMocks.getAccounts.mockReturnValue([]);
    dbMocks.getEntriesForPeriod.mockReturnValue([]);
    vatMocks.buildVatSettlementPreview.mockReturnValue({
      settlementAccountId: 100,
      settlementAccountNumber: '2939',
      settlementAccountName: 'ALV-velka',
      settlementBalance: -200,
      settlementDebit: false,
      settlementAmount: 200,
      sourceLines: [
        {
          accountId: 101,
          accountNumber: '29391',
          accountName: 'ALV myynnistä',
          balance: 200,
          debit: true,
          amount: 200,
        },
      ],
    });
    dbMocks.createDocument.mockReturnValue({ id: 5, number: 5 });

    const result = await createVatSettlementAction({
      periodId: 1,
      date: Date.UTC(2025, 0, 31),
    });

    expect(result).toEqual({ id: 5, number: 5 });
    expect(dbMocks.createEntry).toHaveBeenCalledTimes(2);
    expect(dbMocks.updateDocumentMetadata).toHaveBeenCalledWith(
      5,
      'ALV',
      'ALV-ilmoitus',
    );
  });

  it('rejects when no VAT balance to settle', async () => {
    dbMocks.getAccounts.mockReturnValue([]);
    dbMocks.getEntriesForPeriod.mockReturnValue([]);
    vatMocks.buildVatSettlementPreview.mockReturnValue(null);

    await expect(
      createVatSettlementAction({ periodId: 1, date: Date.UTC(2025, 0, 31) }),
    ).rejects.toThrow('transferable balance');
  });
});

describe('importStateTransferAction', () => {
  it('rejects non-File input', async () => {
    await expect(
      importStateTransferAction('not a file' as unknown as File),
    ).rejects.toThrow('ZIP package');
  });

  it('rejects when active datasource DB not found', async () => {
    dbMocks.resolveDbPath.mockReturnValue(null);
    const file = new File([Buffer.from('zip')], 'state.zip', {
      type: 'application/zip',
    });
    await expect(importStateTransferAction(file)).rejects.toThrow(
      'SQLite database not found',
    );
  });
});

describe('deleteDocumentAction', () => {
  it('deletes the document', async () => {
    dbMocks.getDocument.mockReturnValue({
      id: 1,
      period_id: 1,
      date: Date.UTC(2025, 0, 1),
    });
    const result = await deleteDocumentAction(1);
    expect(result.ok).toBe(true);
    expect(dbMocks.deleteDocument).toHaveBeenCalledWith(1);
  });

  it('rejects when document not found', async () => {
    dbMocks.getDocument.mockReturnValue(null);
    await expect(deleteDocumentAction(999)).rejects.toThrow(
      'Document not found',
    );
  });
});

describe('deleteDocumentsAction', () => {
  it('deletes every selected document', async () => {
    dbMocks.getDocument.mockImplementation((id: number) => ({
      id,
      period_id: 1,
      date: Date.UTC(2025, 0, id),
    }));

    const result = await deleteDocumentsAction({ documentIds: [1, 2, 3] });

    expect(result).toEqual({ ok: true, deletedCount: 3 });
    expect(dbMocks.deleteDocument).toHaveBeenNthCalledWith(1, 1);
    expect(dbMocks.deleteDocument).toHaveBeenNthCalledWith(2, 2);
    expect(dbMocks.deleteDocument).toHaveBeenNthCalledWith(3, 3);
  });
});

describe('updateEntryAccountAction', () => {
  it('updates the entry account and returns result', async () => {
    dbMocks.getAccount.mockReturnValue({
      id: 5,
      number: '1000',
      name: 'Kassa',
    });
    dbMocks.getEntry.mockReturnValue({ id: 10, document_id: 1, account_id: 1 });

    const result = await updateEntryAccountAction(10, { accountId: 5 });

    expect(result).toEqual({
      id: 10,
      accountId: 5,
      accountNumber: '1000',
      accountName: 'Kassa',
    });
    expect(dbMocks.updateEntryAccount).toHaveBeenCalledWith(10, 5);
  });
});

describe('setPeriodLockAction', () => {
  it('locks a period', async () => {
    dbMocks.getPeriod.mockReturnValue({ id: 1 });
    const result = await setPeriodLockAction(1, true);
    expect(result).toEqual({ ok: true, locked: true });
    expect(dbMocks.setPeriodLocked).toHaveBeenCalledWith(1, true);
  });
});
