'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import AccountPickerModal from '@/components/AccountPickerModal';
import { createBankStatementManualAction } from '@/actions/app-actions';
import { formatNumber } from '@/lib/accounting';
import { getAccountTypeLabel } from '@/lib/account-labels';
import { useAccountPicker } from '@/hooks/useAccountPicker';
import type { AccountOption } from '@/lib/types';

interface EntryRow {
  date: string;
  counterparty: string;
  message: string;
  amount: string;
  isDeposit: boolean;
}

interface Props {
  accounts: AccountOption[];
}

function createEmptyRow(): EntryRow {
  return {
    date: new Date().toISOString().split('T')[0],
    counterparty: '',
    message: '',
    amount: '',
    isDeposit: true,
  };
}

function parseAmount(value: string): number | null {
  const normalized = value.trim().replace(/\s+/g, '').replace(',', '.');
  if (!normalized) return null;
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100) / 100;
}

function parseBalance(value: string): number {
  return parseAmount(value) ?? 0;
}

export default function NewBankStatementForm({ accounts }: Props) {
  const router = useRouter();
  const [bankAccountId, setBankAccountId] = useState<number | null>(null);
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [iban, setIban] = useState('');
  const [periodStart, setPeriodStart] = useState(
    new Date().toISOString().split('T')[0],
  );
  const [periodEnd, setPeriodEnd] = useState(
    new Date().toISOString().split('T')[0],
  );
  const [openingBalance, setOpeningBalance] = useState('');
  const [closingBalance, setClosingBalance] = useState('');
  const [rows, setRows] = useState<EntryRow[]>([createEmptyRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [accountSearch, setAccountSearch] = useState('');
  const [showAccountPicker, setShowAccountPicker] = useState(false);

  const handleAccountConfirm = useCallback(
    (_entryId: number, accountId: number) => {
      const account = accounts.find((a) => a.id === accountId);
      if (!account) return;
      setBankAccountId(account.id);
      setBankAccountNumber(account.number);
      setBankAccountName(account.name);
      setShowAccountPicker(false);
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

  const openAccountPicker = () => {
    setAccountSearch('');
    picker.open(0, bankAccountId);
    setShowAccountPicker(true);
  };

  const closeAccountPicker = () => {
    picker.close();
    setShowAccountPicker(false);
    setAccountSearch('');
  };

  const addRow = () => {
    setRows((current) => [...current, createEmptyRow()]);
  };

  const removeRow = (index: number) => {
    if (rows.length <= 1) return;
    setRows((current) => current.filter((_, i) => i !== index));
  };

  const updateRow = (
    index: number,
    field: keyof EntryRow,
    value: string | boolean,
  ) => {
    setRows((current) => {
      const next = [...current];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const totalDeposits = rows.reduce((sum, row) => {
    const amount = parseAmount(row.amount);
    if (amount == null) return sum;
    return row.isDeposit ? sum + amount : sum;
  }, 0);

  const totalWithdrawals = rows.reduce((sum, row) => {
    const amount = parseAmount(row.amount);
    if (amount == null) return sum;
    return !row.isDeposit ? sum + amount : sum;
  }, 0);

  const validEntryCount = rows.filter(
    (row) => parseAmount(row.amount) != null && parseAmount(row.amount) !== 0,
  ).length;

  const handleSave = async () => {
    setSaving(true);
    setError('');

    try {
      if (!bankAccountId) {
        throw new Error('Valitse pankkitili');
      }

      const entries = rows
        .filter(
          (row) =>
            parseAmount(row.amount) != null && parseAmount(row.amount) !== 0,
        )
        .map((row) => {
          const absAmount = Math.abs(parseAmount(row.amount)!);
          return {
            entryDate: new Date(row.date).getTime(),
            counterparty: row.counterparty,
            message: row.message || null,
            reference: null,
            amount: row.isDeposit ? absAmount : -absAmount,
          };
        });

      if (entries.length === 0) {
        throw new Error('Add at least one row');
      }

      const data = await createBankStatementManualAction({
        accountId: bankAccountId,
        iban,
        periodStart: new Date(periodStart).getTime(),
        periodEnd: new Date(periodEnd).getTime(),
        openingBalance: parseBalance(openingBalance),
        closingBalance: parseBalance(closingBalance),
        entries,
      });
      router.push(`/bank-statements/${data.id}`);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : 'Tuntematon virhe',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="p-8 max-w-4xl"
      onSubmit={(e) => {
        e.preventDefault();
        if (!saving && bankAccountId && validEntryCount > 0)
          void handleSave();
      }}
    >
      <Link
        href="/bank-statements"
        className="mb-6 inline-flex min-h-[32px] items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Takaisin tilioteisiin
      </Link>

      <div className="mb-6">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
          Kirjanpito
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">
          Add bank statement
        </h1>
      </div>

      {error ? (
        <div className="mb-6 rounded-lg border border-red-700 bg-red-900/30 px-4 py-3 text-rose-300">
          {error}
        </div>
      ) : null}

      <div className="mb-6 rounded-xl border border-border-subtle bg-surface-2/50 p-6 space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-text-secondary">
            Pankkitili
          </label>
          <button
            type="button"
            onClick={openAccountPicker}
            className="flex w-full items-center gap-2 rounded-lg border border-border-subtle bg-surface-0/60 px-3 py-2 text-left text-sm transition hover:border-border-medium hover:bg-surface-0/80"
          >
            {bankAccountNumber ? (
              <>
                <span className="inline-flex rounded-full border border-accent/15 bg-accent/10 px-2 py-0.5 font-mono text-[11px] text-accent-light">
                  {bankAccountNumber}
                </span>
                <span className="text-text-secondary">{bankAccountName}</span>
              </>
            ) : (
              <span className="text-text-muted">Valitse pankkitili</span>
            )}
          </button>
        </div>

        <div>
          <label htmlFor="bs-iban" className="mb-2 block text-sm font-medium text-text-secondary">
            IBAN
          </label>
          <input
            id="bs-iban"
            type="text"
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            placeholder="FI00 0000 0000 0000 00"
            className="w-full rounded-lg border border-border-subtle bg-surface-0/60 px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="bs-period-start" className="mb-2 block text-sm font-medium text-text-secondary">
              Kausi alkaa
            </label>
            <input
              id="bs-period-start"
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="w-full rounded-lg border border-border-subtle bg-surface-0/60 px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
            />
          </div>
          <div>
            <label htmlFor="bs-period-end" className="mb-2 block text-sm font-medium text-text-secondary">
              Period ends
            </label>
            <input
              id="bs-period-end"
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="w-full rounded-lg border border-border-subtle bg-surface-0/60 px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="bs-opening-balance" className="mb-2 block text-sm font-medium text-text-secondary">
              Alkusaldo
            </label>
            <input
              id="bs-opening-balance"
              type="text"
              inputMode="decimal"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              placeholder="0,00"
              className="w-full rounded-lg border border-border-subtle bg-surface-0/60 px-3 py-2 text-right font-mono text-sm text-text-primary outline-none transition focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
            />
          </div>
          <div>
            <label htmlFor="bs-closing-balance" className="mb-2 block text-sm font-medium text-text-secondary">
              Loppusaldo
            </label>
            <input
              id="bs-closing-balance"
              type="text"
              inputMode="decimal"
              value={closingBalance}
              onChange={(e) => setClosingBalance(e.target.value)}
              placeholder="0,00"
              className="w-full rounded-lg border border-border-subtle bg-surface-0/60 px-3 py-2 text-right font-mono text-sm text-text-primary outline-none transition focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
            />
          </div>
        </div>
      </div>

      <div className="mb-6 overflow-hidden rounded-xl border border-border-subtle bg-surface-2/50">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                Pvm
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                Vastapuoli
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                Viesti
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-text-secondary w-24">
                Suunta
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-text-secondary">
                Summa
              </th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="table-divide">
            {rows.map((row, index) => (
              <tr key={index}>
                <td className="px-4 py-2">
                  <input
                    type="date"
                    value={row.date}
                    onChange={(e) => updateRow(index, 'date', e.target.value)}
                    aria-label="Transaction date"
                    className="rounded border border-border-subtle bg-surface-0/60 px-2.5 py-1.5 text-sm text-text-primary outline-none transition focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={row.counterparty}
                    onChange={(e) =>
                      updateRow(index, 'counterparty', e.target.value)
                    }
                    placeholder="Vastapuoli"
                    className="w-full rounded border border-border-subtle bg-surface-0/60 px-2.5 py-1.5 text-sm text-text-primary outline-none transition focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={row.message}
                    onChange={(e) =>
                      updateRow(index, 'message', e.target.value)
                    }
                    placeholder="Viesti / viite"
                    className="w-full rounded border border-border-subtle bg-surface-0/60 px-2.5 py-1.5 text-sm text-text-primary outline-none transition focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  <button
                    type="button"
                    onClick={() =>
                      updateRow(index, 'isDeposit', !row.isDeposit)
                    }
                    className={`inline-flex items-center rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      row.isDeposit
                        ? 'bg-green-400/10 text-emerald-400 hover:bg-green-400/20'
                        : 'bg-red-400/10 text-rose-400 hover:bg-red-400/20'
                    }`}
                  >
                    {row.isDeposit ? 'Pano' : 'Otto'}
                  </button>
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.amount}
                    onChange={(e) =>
                      updateRow(index, 'amount', e.target.value)
                    }
                    placeholder="0,00"
                    className="w-full rounded-md border border-border-subtle bg-surface-0/60 px-2.5 py-1.5 text-right font-mono text-sm text-text-primary outline-none transition focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                  />
                </td>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    className="rounded p-2 text-text-muted transition-colors hover:text-rose-400"
                    disabled={rows.length <= 1}
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
              <td colSpan={3} className="px-4 py-3">
                <button
                  type="button"
                  onClick={addRow}
                  className="flex min-h-[32px] items-center gap-1 text-sm text-accent transition-colors hover:text-accent-light"
                >
                  <Plus className="h-4 w-4" />
                  Add row
                </button>
              </td>
              <td className="px-4 py-3 text-center text-xs text-text-secondary">
                {validEntryCount} rows
              </td>
              <td className="px-4 py-3 text-right font-mono text-sm text-text-secondary">
                <span className="text-emerald-400">
                  +{formatNumber(totalDeposits)}
                </span>
                {' / '}
                <span className="text-rose-400">
                  -{formatNumber(totalWithdrawals)}
                </span>
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-text-secondary">
          {validEntryCount === 0
            ? 'Add rows to bank statement'
            : `${validEntryCount} row${validEntryCount === 1 ? '' : 's'}`}
        </div>
        <button
          type="submit"
          disabled={saving || !bankAccountId || validEntryCount === 0}
          className="rounded-lg bg-accent px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:bg-surface-3 disabled:text-text-muted"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {showAccountPicker && (
        <AccountPickerModal
          title="Valitse pankkitili"
          subtitle="Valitse tili, johon tiliote liittyy"
          searchValue={accountSearch}
          onSearchChange={setAccountSearch}
          onClearSearch={() => setAccountSearch('')}
          filteredAccounts={filteredAccounts}
          totalAccountCount={picker.sortedAccounts.length}
          selectedAccountId={picker.selectedAccountId}
          selectedAccount={picker.selectedAccount}
          currentAccountId={bankAccountId}
          onSelectAccount={picker.setSelectedAccountId}
          onClose={closeAccountPicker}
          onConfirm={picker.confirm}
          confirmLabel="Select account"
          confirmDisabled={
            picker.selectedAccountId == null ||
            picker.selectedAccountId === bankAccountId
          }
        />
      )}
    </form>
  );
}
