import { describe, expect, it } from 'vitest';
import { ApiRouteError } from '@/lib/api-helpers';
import {
  isDuplicateImportedDocument,
  normalizeImportedDocument,
  resolveImportedDocumentDate,
  sanitizeImportedDocumentPdfName,
} from '@/lib/document-import';
import type { Account } from '@/lib/types';

const accounts: Account[] = [
  {
    id: 1,
    number: '1910',
    name: 'Pankkitili',
    type: 0,
    vat_code: 0,
    vat_percentage: 0,
    vat_account1_id: null,
    vat_account2_id: null,
    flags: 0,
  },
  {
    id: 2,
    number: '4000',
    name: 'Myyntitulot',
    type: 3,
    vat_code: 0,
    vat_percentage: 0,
    vat_account1_id: null,
    vat_account2_id: null,
    flags: 0,
  },
];

describe('normalizeImportedDocument', () => {
  it('normalizes a balanced imported voucher', () => {
    const result = normalizeImportedDocument(
      {
        date: '2026-04-05',
        category: ' mu ',
        name: ' Asiakaslasku ',
        entries: [
          {
            accountNumber: '1910',
            debit: true,
            amount: 124,
            description: 'Suoritus',
          },
          {
            accountNumber: '4000',
            debit: false,
            amount: 124,
            description: 'Myynti',
          },
        ],
      },
      accounts,
    );

    expect(result.category).toBe('MU');
    expect(result.name).toBe('Asiakaslasku');
    expect(result.entries).toEqual([
      {
        accountNumber: '1910',
        debit: true,
        amount: 124,
        description: 'Suoritus',
        rowNumber: 1,
      },
      {
        accountNumber: '4000',
        debit: false,
        amount: 124,
        description: 'Myynti',
        rowNumber: 2,
      },
    ]);
  });

  it('rejects unknown account numbers', () => {
    expect(() =>
      normalizeImportedDocument(
        {
          date: '2026-04-05',
          category: 'MU',
          name: 'Testi',
          entries: [
            {
              accountNumber: '9999',
              debit: true,
              amount: 50,
              description: 'Virhe',
            },
            {
              accountNumber: '4000',
              debit: false,
              amount: 50,
              description: 'Virhe',
            },
          ],
        },
        accounts,
      ),
    ).toThrowError(ApiRouteError);
  });

  it('rejects unbalanced vouchers', () => {
    expect(() =>
      normalizeImportedDocument(
        {
          date: '2026-04-05',
          category: 'MU',
          name: 'Testi',
          entries: [
            {
              accountNumber: '1910',
              debit: true,
              amount: 50,
              description: 'Virhe',
            },
            {
              accountNumber: '4000',
              debit: false,
              amount: 49.99,
              description: 'Virhe',
            },
          ],
        },
        accounts,
      ),
    ).toThrow('debit and credit');
  });

  it('allows missing dates for later fallback handling', () => {
    const result = normalizeImportedDocument(
      {
        date: null,
        category: 'MU',
        name: 'Skannattu kuitti',
        entries: [
          {
            accountNumber: '1910',
            debit: true,
            amount: 50,
            description: 'Maksu',
          },
          {
            accountNumber: '4000',
            debit: false,
            amount: 50,
            description: 'Tulo',
          },
        ],
      },
      accounts,
    );

    expect(result.date).toBeNull();
  });

  it('drops zero-amount rows instead of failing immediately', () => {
    const result = normalizeImportedDocument(
      {
        date: '2026-04-05',
        category: 'MU',
        name: 'Skannattu kuitti',
        entries: [
          {
            accountNumber: '1910',
            debit: true,
            amount: 0,
            description: 'Epäselvä rivi',
          },
          {
            accountNumber: '1910',
            debit: true,
            amount: 50,
            description: 'Maksu',
          },
          {
            accountNumber: '4000',
            debit: false,
            amount: 50,
            description: 'Tulo',
          },
        ],
      },
      accounts,
    );

    expect(result.entries).toEqual([
      {
        accountNumber: '1910',
        debit: true,
        amount: 50,
        description: 'Maksu',
        rowNumber: 1,
      },
      {
        accountNumber: '4000',
        debit: false,
        amount: 50,
        description: 'Tulo',
        rowNumber: 2,
      },
    ]);
  });

  it('rejects when too few usable rows remain after zero filtering', () => {
    expect(() =>
      normalizeImportedDocument(
        {
          date: '2026-04-05',
          category: 'MU',
          name: 'Skannattu kuitti',
          entries: [
            {
              accountNumber: '1910',
              debit: true,
              amount: 0,
              description: 'Epäselvä rivi',
            },
            {
              accountNumber: '4000',
              debit: false,
              amount: 50,
              description: 'Tulo',
            },
          ],
        },
        accounts,
      ),
    ).toThrow('enough usable entry rows');
  });
});

describe('sanitizeImportedDocumentPdfName', () => {
  it('normalizes file names into safe ascii slugs', () => {
    expect(sanitizeImportedDocumentPdfName('Ääkköset / Testi.pdf')).toBe(
      'aakkoset-testi',
    );
  });
});

describe('isDuplicateImportedDocument', () => {
  it('matches identical vouchers', () => {
    expect(
      isDuplicateImportedDocument(
        {
          date: Date.UTC(2026, 3, 5),
          category: 'mu',
          name: '  Lounas  ',
          entries: [
            {
              accountNumber: '7000',
              debit: true,
              amount: 12.4,
              description: 'Lounas',
            },
            {
              accountNumber: '1910',
              debit: false,
              amount: 12.4,
              description: ' Lounas ',
            },
          ],
        },
        {
          date: Date.UTC(2026, 3, 5),
          category: 'MU',
          name: 'Lounas',
          entries: [
            {
              accountNumber: '7000',
              debit: true,
              amount: 12.4,
              description: 'Lounas',
            },
            {
              accountNumber: '1910',
              debit: false,
              amount: 12.4,
              description: 'Lounas',
            },
          ],
        },
      ),
    ).toBe(true);
  });

  it('does not match if the voucher contents differ', () => {
    expect(
      isDuplicateImportedDocument(
        {
          date: Date.UTC(2026, 3, 5),
          category: 'MU',
          name: 'Lounas',
          entries: [
            {
              accountNumber: '7000',
              debit: true,
              amount: 12.4,
              description: 'Lounas',
            },
            {
              accountNumber: '1910',
              debit: false,
              amount: 12.4,
              description: 'Lounas',
            },
          ],
        },
        {
          date: Date.UTC(2026, 3, 5),
          category: 'MU',
          name: 'Lounas',
          entries: [
            {
              accountNumber: '7000',
              debit: true,
              amount: 10,
              description: 'Lounas',
            },
            {
              accountNumber: '1910',
              debit: false,
              amount: 10,
              description: 'Lounas',
            },
          ],
        },
      ),
    ).toBe(false);
  });
});

describe('resolveImportedDocumentDate', () => {
  const periodStart = Date.UTC(2026, 0, 1);
  const periodEnd = Date.UTC(2026, 11, 31);

  it('keeps dates that already belong to the selected period', () => {
    expect(
      resolveImportedDocumentDate({
        importedDate: Date.UTC(2026, 3, 5),
        periodStart,
        periodEnd,
      }),
    ).toEqual({
      date: Date.UTC(2026, 3, 5),
      usedFallback: false,
      fallbackReason: null,
    });
  });

  it('shifts the year when day and month fit the selected period', () => {
    expect(
      resolveImportedDocumentDate({
        importedDate: Date.UTC(2025, 3, 5),
        periodStart,
        periodEnd,
      }),
    ).toEqual({
      date: Date.UTC(2026, 3, 5),
      usedFallback: true,
      fallbackReason: 'shifted_year',
    });
  });

  it('falls back to period start when date is missing', () => {
    expect(
      resolveImportedDocumentDate({
        importedDate: null,
        periodStart,
        periodEnd,
      }),
    ).toEqual({
      date: periodStart,
      usedFallback: true,
      fallbackReason: 'missing',
    });
  });
});
