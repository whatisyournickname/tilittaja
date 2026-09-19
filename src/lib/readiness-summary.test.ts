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

describe('buildReadinessSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    dbMocks.getPeriods.mockReturnValue([
      {
        id: 1,
        start_date: Date.UTC(2024, 0, 1),
        end_date: Date.UTC(2024, 11, 31),
        locked: false,
      },
    ]);
    dbMocks.getBankStatements.mockReturnValue([
      {
        id: 1,
        account_id: 1,
        iban: 'FI123',
        period_start: Date.UTC(2024, 0, 1),
        period_end: Date.UTC(2024, 11, 31),
        opening_balance: 0,
        closing_balance: 100,
        source_file: 'statement.xml',
        created_at: Date.UTC(2024, 11, 31),
        entry_count: 1,
        processed_count: 1,
        account_number: '1910',
        account_name: 'Pankki',
      },
    ]);
    dbMocks.getUnlinkedBankStatementEntriesForPeriod.mockReturnValue([]);
    dbMocks.getDocumentMetadataMap.mockReturnValue(new Map());
  });

  it('shows open VAT settlement when VAT accounts still have saldo', () => {
    dbMocks.getAccounts.mockReturnValue([
      account({
        id: 1,
        number: '2939',
        name: 'Arvonlisäverovelka',
        type: 1,
        vat_code: 1,
      }),
      account({
        id: 2,
        number: '29391',
        name: 'Alv myynnistä',
        type: 1,
        vat_code: 2,
      }),
      account({
        id: 10,
        number: '3000',
        name: 'Myynti',
        type: 3,
        vat_code: 4,
        vat_percentage: 24,
        vat_account1_id: 2,
      }),
    ]);
    dbMocks.getDocuments.mockReturnValue([
      { id: 11, number: 1, period_id: 1, date: Date.UTC(2024, 0, 15) },
    ]);
    dbMocks.getDocumentBalances.mockReturnValue([
      { document_number: 1, total_debit: 1240, total_credit: 1240 },
    ]);
    dbMocks.getDocumentReceiptLinks.mockReturnValue(
      new Map([[11, '/tmp/mu-1.pdf']]),
    );
    dbMocks.getEntriesForPeriod.mockReturnValue([
      entry({
        document_id: 11,
        account_id: 10,
        debit: false,
        amount: 1000,
        description: 'Myynti',
        row_number: 1,
      }),
      entry({
        document_id: 11,
        account_id: 2,
        debit: false,
        amount: 240,
        description: 'Laskun ALV',
        row_number: 2,
      }),
    ]);

    const summary = buildReadinessSummary(1);
    const vatSection = summary.sections.find(
      (section) => section.title === 'VAT',
    );
    const settlementItem = vatSection?.items.find(
      (item) => item.label === 'VAT account settlement',
    );
    const vatDocumentItem = vatSection?.items.find(
      (item) => item.label === 'VAT return documents',
    );

    expect(vatSection).toBeDefined();
    expect(settlementItem?.ok).toBe(false);
    expect(settlementItem?.details).toContain('Payable');
    expect(settlementItem?.details).toContain('2939');
    expect(vatDocumentItem?.ok).toBe(false);
  });

  it('marks VAT section ready when settlement is done and VAT document has receipt', () => {
    dbMocks.getAccounts.mockReturnValue([
      account({
        id: 1,
        number: '2939',
        name: 'Arvonlisäverovelka',
        type: 1,
        vat_code: 1,
      }),
      account({
        id: 2,
        number: '29391',
        name: 'Alv myynnistä',
        type: 1,
        vat_code: 2,
      }),
      account({
        id: 10,
        number: '3000',
        name: 'Myynti',
        type: 3,
        vat_code: 4,
        vat_percentage: 24,
        vat_account1_id: 2,
      }),
    ]);
    dbMocks.getDocuments.mockReturnValue([
      { id: 11, number: 1, period_id: 1, date: Date.UTC(2024, 0, 15) },
      { id: 12, number: 2, period_id: 1, date: Date.UTC(2024, 0, 31) },
    ]);
    dbMocks.getDocumentBalances.mockReturnValue([
      { document_number: 1, total_debit: 1240, total_credit: 1240 },
      { document_number: 2, total_debit: 240, total_credit: 240 },
    ]);
    dbMocks.getDocumentMetadataMap.mockReturnValue(
      new Map([
        [12, { document_id: 12, category: 'ALV', name: 'ALV-ilmoitus' }],
      ]),
    );
    dbMocks.getDocumentReceiptLinks.mockReturnValue(
      new Map([
        [11, '/tmp/mu-1.pdf'],
        [12, '/tmp/alv-1.pdf'],
      ]),
    );
    dbMocks.getEntriesForPeriod.mockReturnValue([
      entry({
        document_id: 11,
        account_id: 10,
        debit: false,
        amount: 1000,
        description: 'Myynti',
        row_number: 1,
      }),
      entry({
        document_id: 11,
        account_id: 2,
        debit: false,
        amount: 240,
        description: 'ALV myynnistä',
        row_number: 2,
      }),
      entry({
        document_id: 12,
        account_id: 2,
        debit: true,
        amount: 240,
        description: 'ALV-ilmoitus',
        row_number: 1,
      }),
      entry({
        document_id: 12,
        account_id: 1,
        debit: false,
        amount: 240,
        description: 'ALV-ilmoitus',
        row_number: 2,
      }),
    ]);

    const summary = buildReadinessSummary(1);
    const vatSection = summary.sections.find(
      (section) => section.title === 'VAT',
    );

    expect(vatSection?.allOk).toBe(true);
    expect(
      vatSection?.items.find((item) => item.label === 'VAT account settlement')?.ok,
    ).toBe(true);
    expect(
      vatSection?.items.find(
        (item) => item.label === 'VAT return documents',
      )?.ok,
    ).toBe(true);
    expect(
      vatSection?.items.find(
        (item) => item.label === 'VAT return documents',
      )?.count,
    ).toBe(1);
    expect(
      vatSection?.items.find(
        (item) => item.label === 'VAT return documents',
      )?.total,
    ).toBe(1);
  });
});
