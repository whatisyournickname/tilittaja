import { describe, expect, it } from 'vitest';
import {
  calculateBalances,
  calculateReportAmounts,
  filterVisibleReportRows,
  formatCurrency,
  formatCurrencyForPdf,
  formatDate,
  formatNumber,
  getDetailRows,
  getDetailRowsWithIds,
  getEntrySign,
  isDetailReportRow,
  parseReportStructure,
  periodFilenamePart,
  periodLabel,
  periodToDateString,
  sanitizeForFilename,
  withImplicitCurrentPeriodProfit,
} from '@/lib/accounting';
import { account, entry } from '@/lib/test-helpers';

describe('accounting report calculations', () => {
  it('formats rounded negative zero as zero', () => {
    const result1 = formatCurrency(-0.0001);
    const result2 = formatCurrency(-0.004);
    expect(result1).toContain('0,00');
    expect(result1).toContain('HKD');
    expect(result1).not.toContain('-');
    expect(result2).toContain('0,00');
    expect(result2).not.toContain('-');
  });

  it('keeps revenue positive and expenses negative in reports', () => {
    const accounts = [
      account({ id: 1, number: '3000', name: 'Myynti', type: 3 }),
      account({ id: 2, number: '7700', name: 'Kulut', type: 4 }),
    ];

    const balances = calculateBalances(
      [
        entry({ account_id: 1, debit: false, amount: 800 }),
        entry({ account_id: 2, debit: true, amount: 1254.71 }),
      ],
      accounts,
    );

    const rows = parseReportStructure(
      'SP0;3000;4000;Liikevaihto\nSP0;7000;9000;Kulut\nSB0;3000;9000;Tilikauden voitto (tappio)',
    );
    const calculated = calculateReportAmounts(rows, accounts, balances);

    expect(calculated[0].amount).toBe(800);
    expect(calculated[1].amount).toBe(-1254.71);
    expect(calculated[2].amount).toBeCloseTo(-454.71, 2);
  });

  it('matches 5-digit subaccounts to 4-digit report ranges', () => {
    const accounts = [
      account({ id: 1, number: '29391', name: 'Alv myynnistä', type: 1 }),
      account({ id: 2, number: '29392', name: 'Alv ostoista', type: 1 }),
    ];
    const balances = new Map<number, number>([
      [1, 181.04],
      [2, -163.26],
    ]);
    const row = parseReportStructure('SP0;2920;2950;Muut velat')[0];

    const [calculated] = calculateReportAmounts([row], accounts, balances);
    const details = getDetailRows(row, accounts, balances);

    expect(calculated.amount).toBe(17.78);
    expect(details).toHaveLength(2);
    expect(details[0].accountNumber).toBe('29391');
    expect(details[1].accountNumber).toBe('29392');
  });
});

describe('getEntrySign', () => {
  it('returns correct sign for asset accounts', () => {
    expect(getEntrySign(0, true)).toBe(1);
    expect(getEntrySign(0, false)).toBe(-1);
  });

  it('returns correct sign for liability accounts', () => {
    expect(getEntrySign(1, true)).toBe(-1);
    expect(getEntrySign(1, false)).toBe(1);
  });

  it('returns correct sign for equity accounts', () => {
    expect(getEntrySign(2, true)).toBe(-1);
    expect(getEntrySign(2, false)).toBe(1);
  });

  it('returns correct sign for revenue accounts', () => {
    expect(getEntrySign(3, true)).toBe(-1);
    expect(getEntrySign(3, false)).toBe(1);
  });

  it('returns correct sign for expense accounts', () => {
    expect(getEntrySign(4, true)).toBe(1);
    expect(getEntrySign(4, false)).toBe(-1);
  });

  it('returns correct sign for prior year profit and current year profit', () => {
    expect(getEntrySign(5, false)).toBe(1);
    expect(getEntrySign(6, false)).toBe(1);
  });

  it('defaults to asset-like behavior for unknown types', () => {
    const unknownAccountType = 99 as unknown as import('@/lib/types').AccountType;
    expect(getEntrySign(unknownAccountType, true)).toBe(1);
    expect(getEntrySign(unknownAccountType, false)).toBe(-1);
  });
});

describe('parseReportStructure', () => {
  it('parses separator rows', () => {
    const rows = parseReportStructure('-\n--');
    expect(rows).toHaveLength(2);
    expect(rows[0].type).toBe('-');
  });

  it('skips empty and malformed lines', () => {
    const rows = parseReportStructure('\n\nX\nAB\n');
    expect(rows).toHaveLength(0);
  });

  it('parses type, style, level and label', () => {
    const rows = parseReportStructure('HB2;1000;2000;Header label');
    expect(rows[0]).toMatchObject({
      type: 'H',
      style: 'B',
      level: 2,
      label: 'Header label',
    });
    expect(rows[0].accountRanges).toEqual([[1000, 2000]]);
  });

  it('handles rows without account ranges', () => {
    const rows = parseReportStructure('HP0;Group label');
    expect(rows[0].accountRanges).toEqual([]);
    expect(rows[0].label).toBe('Group label');
  });
});

describe('calculateReportAmounts', () => {
  it('marks separator rows as visible', () => {
    const rows = parseReportStructure('-');
    const calculated = calculateReportAmounts(rows, [], new Map());
    expect(calculated[0].visible).toBe(true);
  });

  it('marks H rows without ranges as visible', () => {
    const rows = parseReportStructure('HP0;Header');
    const calculated = calculateReportAmounts(rows, [], new Map());
    expect(calculated[0].visible).toBe(true);
  });

  it('hides S rows with zero balance', () => {
    const accounts = [
      account({ id: 1, number: '1000', name: 'Kassa', type: 0 }),
    ];
    const rows = parseReportStructure('SP0;1000;2000;Empty sum');
    const calculated = calculateReportAmounts(rows, accounts, new Map());
    expect(calculated[0].visible).toBe(false);
  });

  it('always shows F rows', () => {
    const rows = parseReportStructure('FP0;Footer');
    const calculated = calculateReportAmounts(rows, [], new Map());
    expect(calculated[0].visible).toBe(true);
  });

  it('adds implicit current-period result to balance sheet equity', () => {
    const accounts = [
      account({ id: 1, number: '1910', name: 'Pankkisaamiset', type: 0 }),
      account({ id: 2, number: '2600', name: 'Pääomalainat', type: 1 }),
      account({ id: 3, number: '3750', name: 'Vuokratuotot', type: 3 }),
      account({ id: 4, number: '8460', name: 'Pankinkulut', type: 4 }),
    ];
    const balanceSheetBalances = new Map<number, number>([
      [1, 1000],
      [2, 1200],
    ]);
    const incomeStatementBalances = new Map<number, number>([
      [3, 200],
      [4, 400],
    ]);
    const rows = parseReportStructure(
      'SP0;1000;2000;Vastaavaa yhteensä\nSP0;2370;2400;Tilikauden voitto (tappio)\nSP0;2000;3000;Vastattavaa yhteensä',
    );

    const adjusted = withImplicitCurrentPeriodProfit(
      balanceSheetBalances,
      incomeStatementBalances,
      accounts,
    );
    const calculated = calculateReportAmounts(
      rows,
      adjusted.accounts,
      adjusted.balances,
    );

    expect(calculated[0].amount).toBe(1000);
    expect(calculated[1].amount).toBe(-200);
    expect(calculated[2].amount).toBe(1000);
    expect(
      adjusted.accounts.find((entry) => entry.number === '2370')?.type,
    ).toBe(6);
  });
});

describe('getDetailRowsWithIds', () => {
  it('returns details with account IDs', () => {
    const accounts = [
      account({ id: 5, number: '1000', name: 'Kassa', type: 0 }),
    ];
    const balances = new Map([[5, 100]]);
    const row = parseReportStructure('DP0;1000;2000;Details')[0];
    const details = getDetailRowsWithIds(row, accounts, balances);
    expect(details).toHaveLength(1);
    expect(details[0].accountId).toBe(5);
    expect(details[0].amount).toBe(100);
  });

  it('excludes zero-balance accounts', () => {
    const accounts = [
      account({ id: 1, number: '1000', name: 'Kassa', type: 0 }),
    ];
    const balances = new Map([[1, 0]]);
    const row = parseReportStructure('DP0;1000;2000;Details')[0];
    expect(getDetailRowsWithIds(row, accounts, balances)).toHaveLength(0);
  });
});

describe('isDetailReportRow', () => {
  it('treats legacy D rows as detail rows', () => {
    const row = parseReportStructure('DP0;1000;2000;Details')[0];
    expect(isDetailReportRow(row)).toBe(true);
  });

  it('treats plain S rows with account ranges as detail rows', () => {
    const row = parseReportStructure('SP0;1000;2000;Kassa')[0];
    expect(isDetailReportRow(row)).toBe(true);
  });

  it('keeps bold total rows as summary rows', () => {
    const row = parseReportStructure('SB0;1000;2000;Yhteensä')[0];
    expect(isDetailReportRow(row)).toBe(false);
  });
});

describe('filterVisibleReportRows', () => {
  it('removes invisible rows', () => {
    const rows = [
      {
        type: 'S' as const,
        style: 'P' as const,
        level: 0,
        accountRanges: [] as [number, number][],
        label: 'Visible',
        visible: true,
      },
      {
        type: 'S' as const,
        style: 'P' as const,
        level: 0,
        accountRanges: [] as [number, number][],
        label: 'Hidden',
        visible: false,
      },
    ];
    expect(filterVisibleReportRows(rows)).toHaveLength(1);
  });

  it('keeps a leading separator when followed by non-separator content', () => {
    const rows = [
      {
        type: '-' as const,
        style: 'P' as const,
        level: 0,
        accountRanges: [] as [number, number][],
        label: '',
        visible: true,
      },
      {
        type: 'S' as const,
        style: 'P' as const,
        level: 0,
        accountRanges: [] as [number, number][],
        label: 'Content',
        visible: true,
      },
    ];
    const result = filterVisibleReportRows(rows);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('-');
  });

  it('removes trailing separators', () => {
    const rows = [
      {
        type: 'S' as const,
        style: 'P' as const,
        level: 0,
        accountRanges: [] as [number, number][],
        label: 'Content',
        visible: true,
      },
      {
        type: '-' as const,
        style: 'P' as const,
        level: 0,
        accountRanges: [] as [number, number][],
        label: '',
        visible: true,
      },
    ];
    expect(filterVisibleReportRows(rows)).toHaveLength(1);
  });

  it('collapses consecutive separators to zero', () => {
    const rows = [
      {
        type: 'S' as const,
        style: 'P' as const,
        level: 0,
        accountRanges: [] as [number, number][],
        label: 'A',
        visible: true,
      },
      {
        type: '-' as const,
        style: 'P' as const,
        level: 0,
        accountRanges: [] as [number, number][],
        label: '',
        visible: true,
      },
      {
        type: '-' as const,
        style: 'P' as const,
        level: 0,
        accountRanges: [] as [number, number][],
        label: '',
        visible: true,
      },
      {
        type: 'S' as const,
        style: 'P' as const,
        level: 0,
        accountRanges: [] as [number, number][],
        label: 'B',
        visible: true,
      },
    ];
    const filtered = filterVisibleReportRows(rows);
    expect(filtered).toHaveLength(2);
    expect(filtered[0].label).toBe('A');
    expect(filtered[1].label).toBe('B');
  });
});

describe('formatting functions', () => {
  it('formatCurrencyForPdf returns PDF-safe string', () => {
    const result = formatCurrencyForPdf(1234.56);
    expect(result).toContain('1');
    expect(result).toContain('234');
    expect(result).not.toContain('\u00a0');
    expect(result).not.toContain('\u202f');
  });

  it('formatNumber formats without currency symbol', () => {
    const result = formatNumber(1000);
    expect(result).not.toContain('HKD');
    expect(result).toContain('1');
  });

  it('formatDate formats timestamp to Finnish date', () => {
    const date = Date.UTC(2025, 0, 15, 12, 0, 0);
    const result = formatDate(date);
    expect(result).toContain('15');
    expect(result).toContain('01');
    expect(result).toContain('2025');
  });

  it('periodToDateString formats timestamp', () => {
    const result = periodToDateString(Date.UTC(2025, 11, 31, 12, 0, 0));
    expect(result).toContain('31');
    expect(result).toContain('12');
  });

  it('periodLabel joins start and end', () => {
    const result = periodLabel(Date.UTC(2025, 0, 1), Date.UTC(2025, 11, 31));
    expect(result).toContain('–');
  });

  it('sanitizeForFilename removes special characters', () => {
    expect(sanitizeForFilename('Test/Company: "Oy"')).toBe('TestCompany-Oy');
    expect(sanitizeForFilename('  spaces  ')).toBe('spaces');
  });

  it('periodFilenamePart returns compact date range', () => {
    const result = periodFilenamePart(
      Date.UTC(2025, 0, 1),
      Date.UTC(2025, 11, 31),
    );
    expect(result).toMatch(/^\d+-\d+$/);
  });
});

describe('calculateBalances', () => {
  it('skips entries for unknown accounts', () => {
    const accounts = [
      account({ id: 1, number: '1000', name: 'Kassa', type: 0 }),
    ];
    const entries = [
      entry({ account_id: 1, debit: true, amount: 100 }),
      entry({ account_id: 999, debit: true, amount: 50 }),
    ];
    const balances = calculateBalances(entries, accounts);
    expect(balances.get(1)).toBe(100);
    expect(balances.has(999)).toBe(false);
  });

  it('accumulates multiple entries for same account', () => {
    const accounts = [
      account({ id: 1, number: '1000', name: 'Kassa', type: 0 }),
    ];
    const entries = [
      entry({ account_id: 1, debit: true, amount: 100 }),
      entry({ account_id: 1, debit: true, amount: 50 }),
      entry({ account_id: 1, debit: false, amount: 30 }),
    ];
    const balances = calculateBalances(entries, accounts);
    expect(balances.get(1)).toBe(120);
  });
});
