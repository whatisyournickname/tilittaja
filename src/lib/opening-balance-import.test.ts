import { describe, expect, it } from 'vitest';
import { account } from '@/lib/test-helpers';
import {
  buildOpeningBalancePlan,
  getOpeningBalanceEntryDebit,
  normalizeImportedOpeningBalance,
  sanitizeOpeningBalancePdfName,
} from './opening-balance-import';

describe('sanitizeOpeningBalancePdfName', () => {
  it('normalizes imported PDF names to safe ASCII slugs', () => {
    expect(
      sanitizeOpeningBalancePdfName('Tilinpäätös 2025 / Tase-erittely.pdf'),
    ).toBe('tilinpaatos-2025-tase-erittely');
  });
});

describe('normalizeImportedOpeningBalance', () => {
  it('merges duplicate balance-sheet accounts with identical balances', () => {
    const result = normalizeImportedOpeningBalance({
      companyName: ' Demo Oy ',
      businessId: '1234567-8',
      previousPeriodEnd: '2025-12-31',
      notes: [' tarkistettu '],
      accounts: [
        { number: '1910', name: 'Pankkitili', balance: 1500 },
        { number: '1910', name: 'Pankkitili', balance: 1500 },
        { number: '2370', name: 'Tilikauden voitto', balance: 1500 },
        { number: '3000', name: 'Liikevaihto', balance: 999 },
      ],
    });

    expect(result.companyName).toBe('Demo Oy');
    expect(result.previousPeriodEndIso).toBe('2025-12-31');
    expect(result.notes).toEqual(['tarkistettu']);
    expect(result.accounts).toEqual([
      { number: '1910', name: 'Pankkitili', balance: 1500 },
      { number: '2370', name: 'Tilikauden voitto', balance: 1500 },
    ]);
  });
});

describe('getOpeningBalanceEntryDebit', () => {
  it('uses the natural side of the account type', () => {
    expect(getOpeningBalanceEntryDebit(0, 1250)).toBe(true);
    expect(getOpeningBalanceEntryDebit(1, 1250)).toBe(false);
    expect(getOpeningBalanceEntryDebit(2, -50)).toBe(true);
  });
});

describe('buildOpeningBalancePlan', () => {
  it('moves current-period profit to retained earnings for a new period', () => {
    const plan = buildOpeningBalancePlan(
      {
        companyName: 'Demo Oy',
        businessId: null,
        previousPeriodEnd: Date.parse('2025-12-31T00:00:00.000Z'),
        previousPeriodEndIso: '2025-12-31',
        notes: [],
        accounts: [
          { number: '1910', name: 'Pankkitili', balance: 1500 },
          { number: '2370', name: 'Tilikauden voitto', balance: 1500 },
        ],
      },
      [account({ id: 10, number: '1910', name: 'Pankkitili', type: 0 })],
    );

    expect(plan.entries).toEqual([
      {
        accountNumber: '1910',
        accountName: 'Pankkitili',
        accountType: 0,
        balance: 1500,
        amount: 1500,
        debit: true,
        existingAccountId: 10,
      },
      {
        accountNumber: '2250',
        accountName: 'Edellisten tilikausien voitto (tappio)',
        accountType: 5,
        balance: 1500,
        amount: 1500,
        debit: false,
        existingAccountId: null,
      },
    ]);
    expect(plan.missingAccounts).toEqual([
      {
        number: '2250',
        name: 'Edellisten tilikausien voitto (tappio)',
        type: 5,
      },
    ]);
    expect(plan.debitTotal).toBe(1500);
    expect(plan.creditTotal).toBe(1500);
  });

  it('merges imported 2370 balance into existing 2250 balance', () => {
    const plan = buildOpeningBalancePlan(
      {
        companyName: 'Demo Oy',
        businessId: null,
        previousPeriodEnd: Date.parse('2025-12-31T00:00:00.000Z'),
        previousPeriodEndIso: '2025-12-31',
        notes: [],
        accounts: [
          { number: '1910', name: 'Pankkitili', balance: 2000 },
          { number: '2250', name: 'Edellisten tilikausien voitto', balance: 500 },
          { number: '2370', name: 'Tilikauden voitto', balance: 1500 },
        ],
      },
      [
        account({ id: 10, number: '1910', name: 'Pankkitili', type: 0 }),
        account({
          id: 11,
          number: '2250',
          name: 'Edellisten tilikausien voitto (tappio)',
          type: 5,
        }),
      ],
    );

    expect(plan.entries).toEqual([
      {
        accountNumber: '1910',
        accountName: 'Pankkitili',
        accountType: 0,
        balance: 2000,
        amount: 2000,
        debit: true,
        existingAccountId: 10,
      },
      {
        accountNumber: '2250',
        accountName: 'Edellisten tilikausien voitto (tappio)',
        accountType: 5,
        balance: 2000,
        amount: 2000,
        debit: false,
        existingAccountId: 11,
      },
    ]);
    expect(plan.missingAccounts).toEqual([]);
    expect(plan.debitTotal).toBe(2000);
    expect(plan.creditTotal).toBe(2000);
  });

  it('rejects unbalanced opening balances', () => {
    expect(() =>
      buildOpeningBalancePlan(
        {
          companyName: null,
          businessId: null,
          previousPeriodEnd: Date.parse('2025-12-31T00:00:00.000Z'),
          previousPeriodEndIso: '2025-12-31',
          notes: [],
          accounts: [{ number: '1910', name: 'Pankkitili', balance: 1500 }],
        },
        [],
      ),
    ).toThrow(/Opening balances do not match/);
  });
});
