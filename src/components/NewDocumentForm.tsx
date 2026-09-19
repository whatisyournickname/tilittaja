'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import AccountPickerModal from '@/components/AccountPickerModal';
import { createDocumentAction } from '@/actions/app-actions';
import { buildDocumentListHref } from '@/lib/document-links';
import { formatNumber } from '@/lib/accounting';
import { parseAmountInputValue } from '@/lib/amount-input';
import { getAccountTypeLabel } from '@/lib/account-labels';
import { useAccountPicker } from '@/hooks/useAccountPicker';
import type { AccountOption } from '@/lib/types';

interface DocumentFormRow {
  accountId: number | null;
  accountNumber: string;
  accountName: string;
  description: string;
  debit: string;
  credit: string;
}

interface Props {
  periodId: number | null;
  periodLocked: boolean;
  accounts: AccountOption[];
}

function createEmptyRow(): DocumentFormRow {
  return {
    accountId: null,
    accountNumber: '',
    accountName: '',
    description: '',
    debit: '',
    credit: '',
  };
}

export default function NewDocumentForm({
  periodId,
  periodLocked,
  accounts,
}: Props) {
  const router = useRouter();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [rows, setRows] = useState<DocumentFormRow[]>([
    createEmptyRow(),
    createEmptyRow(),
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [accountSearch, setAccountSearch] = useState('');

  const handleAccountConfirm = useCallback(
    (rowIndex: number, accountId: number) => {
      const account = accounts.find((a) => a.id === accountId);
      if (!account) return;

      setRows((currentRows) => {
        const nextRows = [...currentRows];
        nextRows[rowIndex] = {
          ...nextRows[rowIndex],
          accountId: account.id,
          accountNumber: account.number,
          accountName: account.name,
        };
        return nextRows;
      });
      setAccountSearch('');
    },
    [accounts],
  );

  const picker = useAccountPicker({
    accounts,
    onConfirm: handleAccountConfirm,
  });

  const filteredAccounts = useMemo(() => {
    const query = accountSearch.trim().toLowerCase();
    if (!query) return picker.sortedAccounts;

    return picker.sortedAccounts.filter(
      (account) =>
        account.number.includes(query) ||
        account.name.toLowerCase().includes(query) ||
        getAccountTypeLabel(account.type).toLowerCase().includes(query),
    );
  }, [accountSearch, picker.sortedAccounts]);

  const accountPickerRow =
    picker.entryId != null ? (rows[picker.entryId] ?? null) : null;

  const addRow = () => {
    setRows((currentRows) => [...currentRows, createEmptyRow()]);
  };

  const removeRow = (index: number) => {
    if (rows.length <= 2) return;
    setRows((currentRows) =>
      currentRows.filter((_, rowIndex) => rowIndex !== index),
    );
    if (picker.entryId === index) {
      closePicker();
    } else if (picker.entryId != null && index < picker.entryId) {
      const adjustedIndex = picker.entryId - 1;
      const currentAccountId = picker.selectedAccountId;
      picker.close();
      picker.open(adjustedIndex, currentAccountId);
    }
  };

  const updateRow = (
    index: number,
    field: keyof DocumentFormRow,
    value: string,
  ) => {
    setRows((currentRows) => {
      const nextRows = [...currentRows];
      nextRows[index] = { ...nextRows[index], [field]: value };
      return nextRows;
    });
  };

  const openPicker = (index: number) => {
    const row = rows[index];
    setAccountSearch('');
    picker.open(index, row?.accountId ?? null);
  };

  const closePicker = () => {
    picker.close();
    setAccountSearch('');
  };

  const totalDebit = rows.reduce(
    (sum, row) => sum + (parseAmountInputValue(row.debit) ?? 0),
    0,
  );
  const totalCredit = rows.reduce(
    (sum, row) => sum + (parseAmountInputValue(row.credit) ?? 0),
    0,
  );
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const handleSave = async () => {
    setSaving(true);
    setError('');

    try {
      const dateMs = new Date(date).getTime();
      const entries = rows
        .filter((row) => row.accountNumber && (row.debit || row.credit))
        .map((row, index) => ({
          accountNumber: row.accountNumber,
          description: row.description,
          debit: Boolean(parseAmountInputValue(row.debit)),
          amount:
            parseAmountInputValue(row.debit) ||
            parseAmountInputValue(row.credit) ||
            0,
          rowNumber: index + 1,
        }));

      const data = await createDocumentAction({
        periodId,
        date: dateMs,
        entries,
      });
      router.push(buildDocumentListHref(data.id, periodId ?? undefined));
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : 'Tuntematon virhe',
      );
    } finally {
      setSaving(false);
    }
  };

  const backHref =
    periodId != null ? `/documents?period=${periodId}` : '/documents';

  return (
    <form
      className="p-8"
      onSubmit={(e) => {
        e.preventDefault();
        if (!periodLocked && !saving && isBalanced) void handleSave();
      }}
    >
      <Link
        href={backHref}
        className="mb-6 inline-flex min-h-[32px] items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to documents
      </Link>

      <div className="mb-6">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
          Bookkeeping
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">
          New document
        </h1>
      </div>

      {error ? (
        <div className="mb-6 rounded-lg border border-red-700 bg-red-900/30 px-4 py-3 text-rose-300">
          {error}
        </div>
      ) : null}

      {periodLocked ? (
        <div className="mb-6 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-yellow-100">
          Period is locked. No new documents can be created for a locked
          period.
        </div>
      ) : null}

      <div className="mb-6 rounded-xl border border-border-subtle bg-surface-2/50 p-6">
        <label
          htmlFor="new-doc-date"
          className="mb-2 block text-sm font-medium text-text-secondary"
        >
          Date
        </label>
          <input
            id="new-doc-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="rounded-lg border border-border-subtle bg-surface-0/60 px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
            disabled={periodLocked}
          />
      </div>

      <div className="mb-6 overflow-hidden rounded-xl border border-border-subtle bg-surface-2/50">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                Account
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                Description
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-text-secondary">
                Debit
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-text-secondary">
                Credit
              </th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="table-divide">
            {rows.map((row, index) => (
              <tr key={index}>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() => openPicker(index)}
                    disabled={periodLocked}
                    className="flex w-full items-center gap-1.5 overflow-hidden rounded-md border border-border-subtle bg-surface-0/60 px-2.5 py-1.5 text-left text-sm transition hover:border-border-medium hover:bg-surface-0/80"
                  >
                    {row.accountNumber ? (
                      <>
                        <span className="inline-flex rounded-full border border-accent/15 bg-accent/10 px-2 py-0.5 font-mono text-[11px] text-accent-light">
                          {row.accountNumber}
                        </span>
                        <span className="truncate text-text-secondary">
                          {row.accountName}
                        </span>
                      </>
                    ) : (
                      <span className="text-text-muted">Select account</span>
                    )}
                  </button>
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={row.description}
                    onChange={(event) =>
                      updateRow(index, 'description', event.target.value)
                    }
                    placeholder="Description"
                    className="w-full rounded-md border border-border-subtle bg-surface-0/60 px-2.5 py-1.5 text-sm text-text-primary outline-none transition focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                    disabled={periodLocked}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.debit}
                    onChange={(event) =>
                      updateRow(index, 'debit', event.target.value)
                    }
                    placeholder="0,00"
                    className="w-full rounded-md border border-border-subtle bg-surface-0/60 px-2.5 py-1.5 text-right font-mono text-sm text-text-primary outline-none transition focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                    disabled={periodLocked}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.credit}
                    onChange={(event) =>
                      updateRow(index, 'credit', event.target.value)
                    }
                    placeholder="0,00"
                    className="w-full rounded-md border border-border-subtle bg-surface-0/60 px-2.5 py-1.5 text-right font-mono text-sm text-text-primary outline-none transition focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                    disabled={periodLocked}
                  />
                </td>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    className="rounded p-2 text-text-muted transition-colors hover:text-rose-400"
                    disabled={periodLocked || rows.length <= 2}
                    aria-label="Delete row"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border-subtle">
              <td colSpan={2} className="px-4 py-3">
                <button
                  type="button"
                  onClick={addRow}
                  disabled={periodLocked}
                  className="flex min-h-[32px] items-center gap-1 text-sm text-accent transition-colors hover:text-accent-light"
                >
                  <Plus className="h-4 w-4" />
                  Add row
                </button>
              </td>
              <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-text-primary">
                {formatNumber(totalDebit)}
              </td>
              <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-text-primary">
                {formatNumber(totalCredit)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <div
          className={`text-sm ${isBalanced ? 'text-emerald-400' : 'text-rose-400'}`}
        >
          {isBalanced
            ? 'Document is balanced'
            : `Difference: ${formatNumber(Math.abs(totalDebit - totalCredit))}`}
        </div>
        <button
          type="submit"
          disabled={periodLocked || saving || !isBalanced}
          className="rounded-lg bg-accent px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:bg-surface-3 disabled:text-text-muted"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {accountPickerRow && (
        <AccountPickerModal
          title="Select account"
          subtitle={`Row ${picker.entryId != null ? picker.entryId + 1 : ''} · ${accountPickerRow.accountNumber ? `current account ${accountPickerRow.accountNumber} ${accountPickerRow.accountName}` : 'no account selected yet'}`}
          searchValue={accountSearch}
          onSearchChange={setAccountSearch}
          onClearSearch={() => setAccountSearch('')}
          filteredAccounts={filteredAccounts}
          totalAccountCount={picker.sortedAccounts.length}
          selectedAccountId={picker.selectedAccountId}
          selectedAccount={picker.selectedAccount}
          currentAccountId={accountPickerRow.accountId}
          onSelectAccount={picker.setSelectedAccountId}
          onClose={closePicker}
          onConfirm={picker.confirm}
          confirmLabel="Select account"
          confirmDisabled={
            picker.selectedAccountId == null ||
            picker.selectedAccountId === accountPickerRow.accountId
          }
          contextItems={[
            {
              label: 'Row',
              value: picker.entryId != null ? String(picker.entryId + 1) : '-',
            },
            {
              label: 'Side',
              value: accountPickerRow.debit
                ? 'Debit'
                : accountPickerRow.credit
                  ? 'Credit'
                  : 'Not selected',
            },
          ]}
          description={accountPickerRow.description}
        />
      )}
    </form>
  );
}
