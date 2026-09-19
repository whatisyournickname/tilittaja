import { describe, expect, it } from 'vitest';
import { getAccountTypeLabel } from '@/lib/account-labels';

describe('account-labels', () => {
  it('returns labels for known ACCOUNT_TYPES keys', () => {
    expect(getAccountTypeLabel(0)).toBe('Assets');
    expect(getAccountTypeLabel(1)).toBe('Liabilities');
    expect(getAccountTypeLabel(2)).toBe('Equity');
    expect(getAccountTypeLabel(3)).toBe('Revenue');
    expect(getAccountTypeLabel(4)).toBe('Expenses');
    expect(getAccountTypeLabel(5)).toBe("Prior periods' profit");
    expect(getAccountTypeLabel(6)).toBe("Current period's profit");
  });

  it('returns Other for unknown type numbers', () => {
    expect(getAccountTypeLabel(99)).toBe('Other');
    expect(getAccountTypeLabel(-1)).toBe('Other');
  });
});
