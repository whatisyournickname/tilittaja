import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getSettings,
  getPeriods,
  getAccounts,
  getEntriesForPeriod,
  getReportStructure,
  getSettingProperties,
  getDocumentBalances,
  getDocuments,
  getDocumentMetadataMap,
  getDocumentReceiptLinks,
  getUnlinkedBankStatementEntriesForPeriod,
  getBankStatements,
} = vi.hoisted(() => ({
  getSettings: vi.fn(),
  getPeriods: vi.fn(),
  getAccounts: vi.fn(),
  getEntriesForPeriod: vi.fn(),
  getReportStructure: vi.fn(),
  getSettingProperties: vi.fn(),
  getDocumentBalances: vi.fn(),
  getDocuments: vi.fn(),
  getDocumentMetadataMap: vi.fn(),
  getDocumentReceiptLinks: vi.fn(),
  getUnlinkedBankStatementEntriesForPeriod: vi.fn(),
  getBankStatements: vi.fn(),
}));

vi.mock('@/lib/db/documents', () => ({
  getPeriods,
  getAccounts,
  getEntriesForPeriod,
  getReportStructure,
  getDocumentBalances,
  getDocuments,
}));

vi.mock('@/lib/db/settings', () => ({
  getSettings,
  getSettingProperties,
}));

vi.mock('@/lib/db/metadata-receipts', () => ({
  getDocumentMetadataMap,
  getDocumentReceiptLinks,
}));

vi.mock('@/lib/db/bank-statements', () => ({
  getUnlinkedBankStatementEntriesForPeriod,
  getBankStatements,
}));

vi.mock('@/lib/accounting', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/accounting')>();
  return {
    ...actual,
    calculateBalances: () =>
      new Map<number, number>([
        [1, 200],
        [2, 0],
      ]),
    parseReportStructure: (data: string) =>
      data === 'income-statement'
        ? [
            {
              type: 'H',
              style: 'B',
              level: 0,
              accountRanges: [],
              label: 'Header',
            },
            {
              type: 'S',
              style: 'B',
              level: 0,
              accountRanges: [],
              label: 'Tilikauden voitto (tappio)',
            },
          ]
        : [
            {
              type: 'H',
              style: 'B',
              level: 0,
              accountRanges: [],
              label: 'Header',
            },
            {
              type: 'S',
              style: 'B',
              level: 0,
              accountRanges: [],
              label: 'Total',
            },
          ],
    calculateReportAmounts: (rows: { label: string }[]) =>
      rows.map((row) => ({
        ...row,
        amount:
          row.label === 'Tilikauden voitto (tappio)'
            ? -125
            : row.label === 'Total'
              ? 250
              : undefined,
        visible: true,
      })),
    periodLabel: () => '1.1.2024 – 31.12.2024',
  };
});

import {
  buildTilinpaatosPackage,
  getTilinpaatosMetadataDefaults,
  formatAmount,
  metadataToProperties,
  signatureDateAsFi,
} from '@/lib/tilinpaatos';

describe('tilinpaatos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSettings.mockReturnValue({
      version: 1,
      name: 'Testi Oy',
      business_id: '1234567-8',
      current_period_id: 2,
      document_type_id: null,
      properties: '',
    });
    getPeriods.mockReturnValue([
      {
        id: 2,
        start_date: Date.UTC(2024, 0, 1),
        end_date: Date.UTC(2024, 11, 31),
        locked: true,
      },
      {
        id: 1,
        start_date: Date.UTC(2023, 0, 1),
        end_date: Date.UTC(2023, 11, 31),
        locked: true,
      },
    ]);
    getAccounts.mockReturnValue([
      { id: 1, number: '2250', name: 'Edelliset voitot', type: 5 },
      { id: 2, number: '2370', name: 'Tilikauden voitto', type: 6 },
    ]);
    getEntriesForPeriod.mockReturnValue([]);
    getReportStructure.mockImplementation((id: string) => ({ id, data: id }));
    getSettingProperties.mockReturnValue({
      'tilinpaatos.signerName': 'Kai Testi',
      'tilinpaatos.place': 'Helsingissä',
      'tilinpaatos.signatureDate': '2025-03-01',
      'tilinpaatos.microDeclaration': 'Mikroyrityslausuma',
    });
    getDocumentBalances.mockReturnValue([]);
    getDocuments.mockReturnValue([]);
    getDocumentMetadataMap.mockReturnValue(new Map());
    getDocumentReceiptLinks.mockReturnValue(new Map());
    getUnlinkedBankStatementEntriesForPeriod.mockReturnValue([]);
    getBankStatements.mockReturnValue([]);
  });

  it('formats rounded negative zero as zero', () => {
    expect(formatAmount(-0.0001)).toBe('0,00 €');
    expect(formatAmount(-0.004)).toBe('0,00 €');
  });

  it('builds package with required compliance and equity figures', () => {
    const result = buildTilinpaatosPackage(2);
    expect(result.companyName).toBe('Testi Oy');
    expect(result.metadata.signerName).toBe('Kai Testi');
    expect(result.metadata.dischargeTarget).toBe('board-and-ceo');
    expect(result.compliance.hardErrors).toBe(0);
    expect(result.equity.currentPeriodProfit).toBe(-125);
    expect(result.equity.distributableEquity).toBe(75);
    expect(result.balanceSheetRows.length).toBeGreaterThan(0);
    expect(result.notes).not.toContain('Konsernitieto ei käytössä.');
  });

  it('converts metadata into persisted setting keys', () => {
    const mapped = metadataToProperties({
      place: 'Oulussa',
      signatureDate: '2025-03-31',
      preparedBy: 'A',
      signerName: 'B',
      signerTitle: 'C',
      microDeclaration: 'D',
      boardProposal: 'E',
      parentCompany: 'F',
      shareInfo: 'G',
      personnelCount: '1',
      archiveNote: 'H',
      meetingDate: '2025-04-30',
      attendees: '',
      dischargeTarget: 'ceo',
    });

    expect(mapped['tilinpaatos.place']).toBe('Oulussa');
    expect(mapped['tilinpaatos.boardProposal']).toBe('E');
    expect(mapped['tilinpaatos.dischargeTarget']).toBe('ceo');
    expect(
      signatureDateAsFi({
        place: 'Oulussa',
        signatureDate: '2025-03-31',
        preparedBy: 'A',
        signerName: 'B',
        signerTitle: 'C',
        microDeclaration: 'D',
        boardProposal: 'E',
        parentCompany: 'F',
        shareInfo: 'G',
        personnelCount: '1',
        archiveNote: 'H',
        meetingDate: '2025-04-30',
        attendees: '',
        dischargeTarget: 'ceo',
      }),
    ).toBe('31.03.2025');
  });

  it('returns metadata defaults based on the current period', () => {
    const defaults = getTilinpaatosMetadataDefaults();

    expect(defaults.preparedBy).toBe('Testi Oy');
    expect(defaults.signatureDate).toBe('2024-12-31');
    expect(defaults.meetingDate).toBe('2025-03-31');
    expect(defaults.dischargeTarget).toBe('board-and-ceo');
  });

  it('omits comparison period data when no earlier period exists', () => {
    getPeriods.mockReturnValue([
      {
        id: 2,
        start_date: Date.UTC(2024, 0, 1),
        end_date: Date.UTC(2024, 11, 31),
        locked: true,
      },
    ]);

    const result = buildTilinpaatosPackage(2);

    expect(result.comparisonPeriodLabel).toBeNull();
    expect(result.equity.comparison).toBeUndefined();
    expect(
      result.compliance.checks.find(
        (check) => check.id === 'comparative-figures',
      ),
    ).toMatchObject({
      ok: false,
      severity: 'warning',
    });
    expect(result.compliance.warnings).toBe(1);
  });

  it('uses defaults when persisted metadata is blank or invalid', () => {
    getSettingProperties.mockReturnValue({
      'tilinpaatos.place': '',
      'tilinpaatos.signerName': '',
      'tilinpaatos.dischargeTarget': 'invalid-value',
      'tilinpaatos.microDeclaration': '',
    });

    const result = buildTilinpaatosPackage(2);

    expect(result.metadata.place).toBe('Kolarissa');
    expect(result.metadata.signerName).toBe('');
    expect(result.metadata.dischargeTarget).toBe('board-and-ceo');
    expect(result.metadata.microDeclaration).toContain('mikroyritys');
    expect(result.compliance.hardErrors).toBeGreaterThan(0);
  });
});
