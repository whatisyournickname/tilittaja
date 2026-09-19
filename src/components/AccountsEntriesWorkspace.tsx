'use client';

import { useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/accounting';
import { getDateInputValue } from '@/lib/date-input';
import { getAccountTypeLabel } from '@/lib/account-labels';
import { getDebitAmount, getCreditAmount } from '@/lib/entry-amounts';
import { SortableHeader, SortState, toggleSort } from './SortableHeader';
import SearchInput from '@/components/SearchInput';

interface AccountSummary {
  id: number;
  number: string;
  name: string;
  type: number;
  balance: number;
  entryCount: number;
  debitTotal: number;
  creditTotal: number;
}

interface AccountEntryRow {
  id: number;
  account_id: number;
  account_number: string;
  account_name: string;
  document_number: number;
  document_date: number;
  description: string;
  debit: boolean;
  amount: number;
  row_number: number;
}

interface Props {
  periodLabel: string;
  periodStart: number;
  periodEnd: number;
  accounts: AccountSummary[];
  entries: AccountEntryRow[];
}

type SortKey =
  | 'document_number'
  | 'document_date'
  | 'row_number'
  | 'account'
  | 'description'
  | 'debit'
  | 'credit';

export default function AccountsEntriesWorkspace({
  periodLabel,
  periodStart,
  periodEnd,
  accounts,
  entries,
}: Props) {
  const [accountSearch, setAccountSearch] = useState('');
  const [entrySearch, setEntrySearch] = useState('');
  const [fromDate, setFromDate] = useState(() =>
    getDateInputValue(periodStart),
  );
  const [toDate, setToDate] = useState(() => getDateInputValue(periodEnd));
  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>(() => {
    const firstAccount =
      accounts.find((account) => account.entryCount > 0) ?? accounts[0];
    return firstAccount ? [firstAccount.id] : [];
  });
  const [sort, setSort] = useState<SortState<SortKey>>({
    key: 'document_number',
    direction: 'asc',
  });

  const selectedAccountIdSet = useMemo(
    () => new Set(selectedAccountIds),
    [selectedAccountIds],
  );

  const filteredAccounts = useMemo(() => {
    const query = accountSearch.trim().toLowerCase();
    return accounts.filter((account) => {
      if (account.entryCount === 0) {
        return false;
      }

      if (!query) {
        return true;
      }

      return (
        account.number.includes(query) ||
        account.name.toLowerCase().includes(query) ||
        getAccountTypeLabel(account.type).toLowerCase().includes(query)
      );
    });
  }, [accountSearch, accounts]);

  const selectedAccounts = useMemo(
    () => accounts.filter((account) => selectedAccountIdSet.has(account.id)),
    [accounts, selectedAccountIdSet],
  );

  const filteredEntries = useMemo(() => {
    const query = entrySearch.trim().toLowerCase();

    return entries.filter((entry) => {
      if (!selectedAccountIdSet.has(entry.account_id)) {
        return false;
      }

      const entryDate = getDateInputValue(entry.document_date);
      if (fromDate && entryDate < fromDate) {
        return false;
      }
      if (toDate && entryDate > toDate) {
        return false;
      }

      if (!query) {
        return true;
      }

      const debitAmount = formatCurrency(
        getDebitAmount(entry.amount, entry.debit),
      ).toLowerCase();
      const creditAmount = formatCurrency(
        getCreditAmount(entry.amount, entry.debit),
      ).toLowerCase();

      return (
        String(entry.document_number).includes(query) ||
        String(entry.row_number).includes(query) ||
        entry.account_number.includes(query) ||
        entry.account_name.toLowerCase().includes(query) ||
        entry.description.toLowerCase().includes(query) ||
        formatDate(entry.document_date).includes(query) ||
        debitAmount.includes(query) ||
        creditAmount.includes(query)
      );
    });
  }, [entries, selectedAccountIdSet, fromDate, toDate, entrySearch]);

  const sortedEntries = useMemo(() => {
    const multiplier = sort.direction === 'asc' ? 1 : -1;

    return [...filteredEntries].sort((left, right) => {
      switch (sort.key) {
        case 'document_number':
          return (left.document_number - right.document_number) * multiplier;
        case 'document_date':
          return (left.document_date - right.document_date) * multiplier;
        case 'row_number':
          return (left.row_number - right.row_number) * multiplier;
        case 'account':
          return (
            `${left.account_number} ${left.account_name}`.localeCompare(
              `${right.account_number} ${right.account_name}`,
              'fi',
            ) * multiplier
          );
        case 'description':
          return (
            left.description.localeCompare(right.description, 'fi') * multiplier
          );
        case 'debit':
          return (
            (getDebitAmount(left.amount, left.debit) -
              getDebitAmount(right.amount, right.debit)) *
            multiplier
          );
        case 'credit':
          return (
            (getCreditAmount(left.amount, left.debit) -
              getCreditAmount(right.amount, right.debit)) *
            multiplier
          );
        default:
          return 0;
      }
    });
  }, [filteredEntries, sort]);

  const selectedEntryCount = filteredEntries.length;
  const selectedDebitTotal = filteredEntries.reduce(
    (sum, entry) => sum + getDebitAmount(entry.amount, entry.debit),
    0,
  );
  const selectedCreditTotal = filteredEntries.reduce(
    (sum, entry) => sum + getCreditAmount(entry.amount, entry.debit),
    0,
  );
  const selectedDifference = Math.abs(selectedDebitTotal - selectedCreditTotal);

  const toggleAccountSelection = (accountId: number) => {
    setSelectedAccountIds((current) =>
      current.includes(accountId)
        ? current.filter((id) => id !== accountId)
        : [...current, accountId],
    );
  };

  const selectSingleAccount = (accountId: number) => {
    setSelectedAccountIds([accountId]);
  };

  const handleSort = (key: SortKey) => {
    setSort((current) => toggleSort(current, key));
  };

  return (
    <div className="w-full max-w-[1400px] p-5">
      <div className="mb-6">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
          Accounting
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">
          Accounts & entries
        </h1>
        <p className="mt-1 text-sm text-text-secondary">{periodLabel}</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <section className="card-panel xl:sticky xl:top-8 xl:self-start xl:flex xl:h-[calc(100vh-4rem)] xl:max-h-[calc(100vh-4rem)] xl:flex-col">
          <div className="border-b border-border-subtle px-4 py-4">
            <div className="mb-3">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">
                  Accounts
                </h2>
              </div>
            </div>

            <SearchInput
              value={accountSearch}
              onChange={setAccountSearch}
              placeholder="Search account number, name, or type..."
            />
          </div>

          <div className="overflow-y-auto xl:min-h-0 xl:flex-1">
            <div className="table-divide-60">
              {filteredAccounts.map((account) => {
                const selected = selectedAccountIdSet.has(account.id);

                return (
                  <div
                    key={account.id}
                    className={`flex items-start gap-3 px-4 py-2 transition ${
                      selected ? 'bg-accent-muted/90' : 'hover:bg-surface-3/40'
                    }`}
                  >
                    <label className="inline-flex min-h-[32px] min-w-[32px] shrink-0 cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleAccountSelection(account.id)}
                        onClick={(event) => event.stopPropagation()}
                        className="h-4 w-4 rounded border-border-medium bg-surface-0/60 text-accent"
                        aria-label={`Select account ${account.number} ${account.name}`}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => selectSingleAccount(account.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] text-accent-light">
                              {account.number}
                            </span>
                            <span className="rounded-full border border-border-subtle px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-muted">
                              {getAccountTypeLabel(account.type)}
                            </span>
                          </div>
                          <div className="mt-0.5 truncate text-xs text-text-primary">
                            {account.name}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-mono tabular-nums text-text-primary">
                            {formatCurrency(account.balance)}
                          </div>
                          <div className="mt-0.5 text-[11px] text-text-muted">
                            {account.entryCount} entries
                          </div>
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}

              {filteredAccounts.length === 0 && (
                <div className="px-3 py-10 text-center text-xs text-text-muted">
                  No accounts matching filters
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="min-w-0 overflow-hidden card-panel xl:sticky xl:top-8 xl:flex xl:h-[calc(100vh-4rem)] xl:max-h-[calc(100vh-4rem)] xl:flex-col">
          <div className="border-b border-border-subtle bg-surface-1/90 px-4 py-4 backdrop-blur-sm">
            <div className="mb-3 flex flex-col gap-2">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">
                  Entries
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full border border-border-subtle bg-surface-1/60 px-2 py-0.5 text-[11px] text-text-secondary">
                  Debit{' '}
                  <span className="font-mono text-text-primary">
                    {formatCurrency(selectedDebitTotal)}
                  </span>
                </span>
                <span className="rounded-full border border-border-subtle bg-surface-1/60 px-2 py-0.5 text-[11px] text-text-secondary">
                  Credit{' '}
                  <span className="font-mono text-text-primary">
                    {formatCurrency(selectedCreditTotal)}
                  </span>
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${
                    selectedDifference === 0
                      ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300'
                      : 'border-amber-400/20 bg-amber-500/10 text-amber-300'
                  }`}
                >
                  Difference{' '}
                  <span className="font-mono">
                    {formatCurrency(selectedDifference)}
                  </span>
                </span>
                <span className="rounded-full border border-border-subtle bg-surface-1/60 px-2 py-0.5 text-[11px] text-text-muted">
                  {selectedEntryCount} entries
                </span>
                {selectedAccounts.length > 0 && (
                  <span className="rounded-full border border-border-subtle bg-surface-1/60 px-2 py-0.5 text-[11px] text-text-muted">
                    {selectedAccounts.length} accounts
                  </span>
                )}
              </div>
            </div>

            <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_150px_150px] lg:items-end">
              <SearchInput
                value={entrySearch}
                onChange={setEntrySearch}
                placeholder="Search by document number, description, account, or amount..."
              />

              <label className="relative block">
                <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted">
                  Starting
                </span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  className="w-full rounded-lg border border-border-subtle bg-surface-0/60 px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                />
                <CalendarDays className="pointer-events-none absolute right-3 top-[34px] h-4 w-4 text-text-muted" />
              </label>

              <label className="relative block">
                <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted">
                  Ending
                </span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  className="w-full rounded-lg border border-border-subtle bg-surface-0/60 px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                />
                <CalendarDays className="pointer-events-none absolute right-3 top-[34px] h-4 w-4 text-text-muted" />
              </label>
            </div>
          </div>

          <div className="overflow-auto xl:min-h-0 xl:flex-1">
            <table className="w-full min-w-[800px]">
              <thead className="sticky top-0 z-10 bg-surface-1/90 backdrop-blur-sm">
                <tr className="border-b border-border-subtle/70 bg-surface-1/60">
                  <SortableHeader
                    label="Document"
                    sortKey="document_number"
                    current={sort}
                    onSort={handleSort}
                    className="w-20"
                  />
                  <SortableHeader
                    label="Date"
                    sortKey="document_date"
                    current={sort}
                    onSort={handleSort}
                    className="w-24"
                  />
                  <SortableHeader
                    label="Row"
                    sortKey="row_number"
                    current={sort}
                    onSort={handleSort}
                    className="w-14"
                  />
                  <SortableHeader
                    label="Account"
                    sortKey="account"
                    current={sort}
                    onSort={handleSort}
                    className="w-48"
                  />
                  <SortableHeader
                    label="Description"
                    sortKey="description"
                    current={sort}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Debit"
                    sortKey="debit"
                    current={sort}
                    onSort={handleSort}
                    align="right"
                    className="w-24"
                  />
                  <SortableHeader
                    label="Credit"
                    sortKey="credit"
                    current={sort}
                    onSort={handleSort}
                    align="right"
                    className="w-24"
                  />
                </tr>
              </thead>
              <tbody className="table-divide">
                {sortedEntries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="transition-colors hover:bg-surface-3/30"
                  >
                    <td className="px-3 py-1.5 text-xs font-mono text-accent-light">
                      {entry.document_number}
                    </td>
                    <td className="px-3 py-1.5 text-xs tabular-nums text-text-secondary">
                      {formatDate(entry.document_date)}
                    </td>
                    <td className="px-3 py-1.5 text-xs font-mono text-text-muted">
                      {entry.row_number}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-text-secondary">
                      <span className="mr-2 font-mono text-accent">
                        {entry.account_number}
                      </span>
                      {entry.account_name}
                    </td>
                    <td className="max-w-0 px-3 py-1.5 text-xs text-text-primary">
                      <div className="truncate">
                        {entry.description || 'No description'}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right text-xs font-mono tabular-nums text-text-primary">
                      {entry.debit ? formatCurrency(entry.amount) : ''}
                    </td>
                    <td className="px-3 py-1.5 text-right text-xs font-mono tabular-nums text-text-primary">
                      {entry.debit ? '' : formatCurrency(entry.amount)}
                    </td>
                  </tr>
                ))}

                {sortedEntries.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-12 text-center text-xs text-text-muted"
                    >
                      {selectedAccountIds.length === 0
                        ? 'Select at least one account on the left.'
                        : 'No entries matching filters.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
