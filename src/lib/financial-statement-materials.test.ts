import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getAccounts,
  getAllEntriesWithDetails,
  getEntriesForPeriod,
  getPeriods,
  getReportStructure,
  getSettings,
} = vi.hoisted(() => ({
  getAccounts: vi.fn(),
  getAllEntriesWithDetails: vi.fn(),
  getEntriesForPeriod: vi.fn(),
  getPeriods: vi.fn(),
  getReportStructure: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock('@/lib/db/documents', () => ({
  getAccounts,
  getAllEntriesWithDetails,
  getEntriesForPeriod,
  getPeriods,
  getReportStructure,
}));

vi.mock('@/lib/db/settings', () => ({
  getSettings,
}));

vi.mock('@/lib/accounting', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/accounting')>();
  return {
    ...actual,
    calculateBalances: (
      entries: { account_id: number; debit: boolean; amount: number }[],
    ) =>
      entries.reduce((map, entry) => {
        const next = map.get(entry.account_id) ?? 0;
        map.set(
          entry.account_id,
          next + (entry.debit ? entry.amount : -entry.amount),
        );
        return map;
      }, new Map<number, number>()),
    calculateReportAmounts: (rows: Array<Record<string, unknown>>) =>
      rows.map((row, index) => ({
        ...row,
        amount: typeof row.amount === 'number' ? row.amount : 100 + index,
        visible: row.visible ?? true,
      })),
    formatDate: () => '01.01.2025',
    formatNumber: (value: number) => value.toFixed(2),
    getDetailRows: (row: { label: string }) =>
      row.label === 'Pysyvät vastaavat'
        ? [
            { accountNumber: '1000', accountName: 'Kassa', amount: 125 },
            { accountNumber: '1700', accountName: 'Saamiset', amount: 50 },
          ]
        : [],
    getEntrySign: (_accountType: number, debit: boolean) => (debit ? 1 : -1),
    parseReportStructure: (data: string) => {
      if (data === 'income-rows') {
        return [
          {
            type: 'H',
            style: 'B',
            level: 0,
            label: 'Tuloslaskelma',
            visible: true,
          },
          {
            type: 'S',
            style: 'B',
            level: 0,
            label: 'Tilikauden tulos',
            visible: true,
            amount: 250,
          },
        ];
      }

      return [
        { type: '-', style: '', level: 0, label: 'separator', visible: true },
        {
          type: 'D',
          style: 'B',
          level: 0,
          label: 'Pysyvät vastaavat',
          visible: true,
        },
        {
          type: 'S',
          style: 'B',
          level: 0,
          label: 'Vastaavaa yhteensä',
          visible: true,
          amount: 175,
        },
        {
          type: 'G',
          style: '',
          level: 0,
          label: 'Ryhmäotsikko',
          visible: true,
        },
      ];
    },
    periodFilenamePart: () => '2025',
    periodLabel: () => '1.1.2025 - 31.12.2025',
    sanitizeForFilename: (value: string) =>
      value.toLowerCase().replace(/\s+/g, '-'),
  };
});

import {
  buildMaterialPdf,
  isMaterialKind,
  MATERIALS,
} from './tilinpaatos-materials';

describe('tilinpaatos-materials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAccounts.mockReturnValue([
      { id: 1, number: '1000', name: 'Kassa', type: 0 },
      { id: 2, number: '3000', name: 'Myynti', type: 3 },
      { id: 3, number: '1700', name: 'Saamiset', type: 0 },
    ]);
    getAllEntriesWithDetails.mockReturnValue([
      {
        account_id: 1,
        account_number: '1000',
        account_name: 'Kassa',
        document_date: Date.UTC(2025, 0, 1),
        document_number: 1,
        description: 'Ensimmainen tapahtuma joka on aika pitka selite',
        debit: true,
        amount: 125,
      },
      {
        account_id: 1,
        account_number: '1000',
        account_name: 'Kassa',
        document_date: Date.UTC(2025, 0, 2),
        document_number: 2,
        description: 'Toinen tapahtuma',
        debit: false,
        amount: 25,
      },
    ]);
    getEntriesForPeriod.mockImplementation((periodId: number) =>
      periodId === 2
        ? [
            {
              document_id: 10,
              document_number: 3,
              document_date: Date.UTC(2025, 0, 10),
              account_id: 1,
              description: 'Debet-vienti',
              debit: true,
              amount: 50,
              row_number: 1,
            },
            {
              document_id: 10,
              document_number: 3,
              document_date: Date.UTC(2025, 0, 10),
              account_id: 2,
              description: 'Kredit-vienti',
              debit: false,
              amount: 50,
              row_number: 2,
            },
          ]
        : [
            {
              document_id: 9,
              document_number: 2,
              document_date: Date.UTC(2024, 11, 31),
              account_id: 3,
              description: 'Vertailurivi',
              debit: true,
              amount: 20,
              row_number: 1,
            },
          ],
    );
    getPeriods.mockReturnValue([
      {
        id: 1,
        start_date: Date.UTC(2024, 0, 1),
        end_date: Date.UTC(2024, 11, 31),
      },
      {
        id: 2,
        start_date: Date.UTC(2025, 0, 1),
        end_date: Date.UTC(2025, 11, 31),
      },
    ]);
    getReportStructure.mockImplementation((id: string) => {
      if (id === 'income-statement-detailed') {
        return {
          id,
          data: 'income-rows',
        };
      }
      if (id === 'balance-sheet-detailed') {
        return {
          id,
          data: 'balance-rows',
        };
      }
      return null;
    });
    getSettings.mockReturnValue({
      name: 'Test Oy',
      business_id: '1234567-8',
      current_period_id: 2,
      properties: '',
      version: 7,
    });
  });

  describe('isMaterialKind', () => {
    it('returns true for valid material kinds', () => {
      expect(isMaterialKind('paakirja')).toBe(true);
      expect(isMaterialKind('paivakirja')).toBe(true);
      expect(isMaterialKind('tase-erittely')).toBe(true);
      expect(isMaterialKind('tase-laaja')).toBe(true);
      expect(isMaterialKind('tulos-laaja')).toBe(true);
    });

    it('returns false for invalid values', () => {
      expect(isMaterialKind('invalid')).toBe(false);
      expect(isMaterialKind('')).toBe(false);
      expect(isMaterialKind('PAAKIRJA')).toBe(false);
    });
  });

  describe('MATERIALS', () => {
    it('has entries for all five kinds', () => {
      expect(Object.keys(MATERIALS)).toHaveLength(5);
      for (const key of Object.keys(MATERIALS)) {
        expect(MATERIALS[key as keyof typeof MATERIALS].title).toBeTruthy();
        expect(
          MATERIALS[key as keyof typeof MATERIALS].filenamePrefix,
        ).toBeTruthy();
      }
    });
  });

  describe('buildMaterialPdf', () => {
    it('builds paakirja PDF and returns buffer with filename', async () => {
      const result = await buildMaterialPdf('paakirja', 2);
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(0);
      expect(result.filename).toBe('paakirja-test-oy-2025.pdf');
      expect(result.title).toBe('Pääkirja');
    });

    it('builds paivakirja PDF', async () => {
      const result = await buildMaterialPdf('paivakirja', 2);
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.filename).toContain('paivakirja');
    });

    it('builds tase-laaja PDF', async () => {
      const result = await buildMaterialPdf('tase-laaja', 2);
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.filename).toContain('tase-laaja');
    });

    it('builds tase-erittely PDF with detail rows only', async () => {
      const result = await buildMaterialPdf('tase-erittely', 2);
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.filename).toContain('tase-erittely');
    });

    it('builds tulos-laaja PDF', async () => {
      const result = await buildMaterialPdf('tulos-laaja', 2);
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.filename).toContain('tulos-laaja');
    });

    it('falls back to the current settings period when periodId is not provided', async () => {
      const result = await buildMaterialPdf('paakirja');
      expect(result.buffer).toBeInstanceOf(Buffer);
    });

    it('throws when no period found', async () => {
      const { getPeriods } = await import('@/lib/db');
      (getPeriods as ReturnType<typeof vi.fn>).mockReturnValue([]);
      await expect(buildMaterialPdf('paakirja')).rejects.toThrow(
        'Tilikautta ei löytynyt',
      );
    });

    it('throws when income statement structure is missing', async () => {
      getReportStructure.mockImplementation((id: string) =>
        id === 'income-statement-detailed'
          ? null
          : { id, data: 'balance-rows' },
      );

      await expect(buildMaterialPdf('tulos-laaja', 2)).rejects.toThrow(
        'Tuloslaskelman laajaa rakennetta ei löytynyt.',
      );
    });

    it('throws when balance sheet structure is missing', async () => {
      getReportStructure.mockImplementation((id: string) =>
        id === 'balance-sheet-detailed' ? null : { id, data: 'income-rows' },
      );

      await expect(buildMaterialPdf('tase-laaja', 2)).rejects.toThrow(
        'Taseen laajaa rakennetta ei löytynyt.',
      );
    });
  });
});
