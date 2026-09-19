'use client';

import { useState, type KeyboardEvent } from 'react';
import {
  formatCurrency,
  formatDate,
  getEntrySign,
  isDetailReportRow,
} from '@/lib/accounting';
import type { AccountType, ReportRow } from '@/lib/types';

export interface BalanceSheetEntry {
  id: number;
  document_id: number;
  document_number: number;
  document_date: number;
  description: string;
  debit: boolean;
  amount: number;
  account_id: number;
}

interface DetailRow {
  accountId: number;
  accountNumber: string;
  accountName: string;
  amount: number;
}

interface BalanceSheetWorkspaceProps {
  rows: ReportRow[];
  detailRowsByIndex: Record<number, DetailRow[]>;
  entriesByAccount: Record<number, BalanceSheetEntry[]>;
  accountTypes: Record<number, AccountType>;
}

export default function BalanceSheetWorkspace({
  rows,
  detailRowsByIndex,
  entriesByAccount,
  accountTypes,
}: BalanceSheetWorkspaceProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(
    null,
  );

  const selectedEntries = selectedAccountId
    ? (entriesByAccount[selectedAccountId] ?? [])
    : [];

  const selectedAccountType = selectedAccountId
    ? (accountTypes[selectedAccountId] ?? (0 as AccountType))
    : (0 as AccountType);

  const entriesWithBalance = selectedEntries.reduce<
    Array<BalanceSheetEntry & { balance: number }>
  >((acc, entry) => {
    const previousBalance = acc.at(-1)?.balance ?? 0;
    const sign = getEntrySign(selectedAccountType, !!entry.debit);
    const balance = previousBalance + entry.amount * sign;
    acc.push({ ...entry, balance });
    return acc;
  }, []);
  const runningBalance = entriesWithBalance.at(-1)?.balance ?? 0;

  const selectedDetail = selectedAccountId
    ? Object.values(detailRowsByIndex)
        .flat()
        .find((d) => d.accountId === selectedAccountId)
    : null;

  const handleDetailKeyDown = (
    event: KeyboardEvent<HTMLTableRowElement>,
    accountId: number,
  ) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    setSelectedAccountId(accountId);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_540px] xl:items-start">
      <div className="bg-surface-2/50 border border-border-subtle rounded-xl overflow-hidden">
        <table className="w-full">
          <tbody>
            {rows.map((row, i) => {
              if (row.type === '-') {
                return (
                  <tr key={i}>
                    <td colSpan={2} className="py-2">
                      <div className="border-t border-border-subtle"></div>
                    </td>
                  </tr>
                );
              }

              const indent = row.level * 20;
              const isBold = row.style === 'B';
              const isItalic = row.style === 'I';
              const isTotal = row.type === 'S' || row.type === 'T';
              const isHeader = row.type === 'H' || row.type === 'G';

              if (isDetailReportRow(row)) {
                const details = detailRowsByIndex[i] ?? [];
                return details.map((detail, j) => {
                  const isSelected = detail.accountId === selectedAccountId;
                  return (
                    <tr
                      key={`${i}-${j}`}
                      tabIndex={0}
                      role="button"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedAccountId(detail.accountId)}
                      onKeyDown={(event) =>
                        handleDetailKeyDown(event, detail.accountId)
                      }
                      className={`cursor-pointer transition-colors outline-none ${
                        isSelected
                          ? 'bg-accent-muted/60 hover:bg-accent-muted/70'
                          : 'hover:bg-surface-3/40'
                      } focus-visible:bg-accent-muted/60`}
                    >
                      <td
                        className="px-6 py-1.5 text-sm text-text-secondary"
                        style={{ paddingLeft: `${24 + indent}px` }}
                      >
                        <span className="font-mono text-text-muted mr-3">
                          {detail.accountNumber}
                        </span>
                        {detail.accountName}
                      </td>
                      <td className="px-6 py-1.5 text-sm text-right font-mono text-text-secondary">
                        {formatCurrency(detail.amount)}
                      </td>
                    </tr>
                  );
                });
              }

              return (
                <tr
                  key={i}
                  className={`${isTotal ? 'border-t border-border-subtle/50' : ''}`}
                >
                  <td
                    className={`px-6 py-2 text-sm ${
                      isBold ? 'font-semibold' : ''
                    } ${isItalic ? 'italic' : ''} ${
                      isHeader ? 'text-text-primary' : 'text-text-secondary'
                    }`}
                    style={{ paddingLeft: `${24 + indent}px` }}
                  >
                    {row.label}
                  </td>
                  {!isHeader || isTotal ? (
                    <td
                      className={`px-6 py-2 text-sm text-right font-mono ${
                        isBold
                          ? 'font-semibold text-text-primary'
                          : 'text-text-primary'
                      }`}
                    >
                      {row.amount !== undefined
                        ? formatCurrency(row.amount)
                        : ''}
                    </td>
                  ) : (
                    <td></td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <aside className="min-w-0 xl:sticky xl:top-8">
        <div className="rounded-xl border border-border-subtle bg-surface-1/50 p-3">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-text-primary">
              Account transactions
            </h2>
            {selectedDetail ? (
              <p className="mt-1 text-xs text-text-secondary">
                <span className="font-mono">
                  {selectedDetail.accountNumber}
                </span>{' '}
                {selectedDetail.accountName}
              </p>
            ) : (
              <p className="mt-1 text-xs text-text-muted">
                Select an account on the left to see its transactions here.
              </p>
            )}
          </div>

          {selectedDetail && entriesWithBalance.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-border-subtle">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border-subtle bg-surface-2/60">
                    <th className="px-2 py-1.5 text-left font-medium text-text-muted w-8">
                      No.
                    </th>
                    <th className="px-2 py-1.5 text-left font-medium text-text-muted w-[72px]">
                      Date
                    </th>
                    <th className="px-2 py-1.5 text-left font-medium text-text-muted">
                      Description
                    </th>
                    <th className="px-2 py-1.5 text-right font-medium text-text-muted w-[80px]">
                      Amount
                    </th>
                    <th className="px-2 py-1.5 text-right font-medium text-text-muted w-[80px]">
                      Balance
                    </th>
                  </tr>
                </thead>
                <tbody className="table-divide-subtle">
                  {entriesWithBalance.map((entry) => (
                    <tr
                      key={entry.id}
                      className="hover:bg-surface-3/40 transition-colors"
                    >
                      <td className="px-2.5 py-1.5 font-mono text-text-secondary">
                        {entry.document_number}
                      </td>
                      <td className="px-2.5 py-1.5 text-text-secondary tabular-nums whitespace-nowrap">
                        {formatDate(entry.document_date)}
                      </td>
                      <td className="px-2.5 py-1.5 text-text-secondary truncate max-w-[200px]">
                        {entry.description}
                      </td>
                      <td className="px-2.5 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                        {(() => {
                          const sign = getEntrySign(
                            selectedAccountType,
                            !!entry.debit,
                          );
                          const signed = entry.amount * sign;
                          return (
                            <span
                              className={
                                signed < 0
                                  ? 'text-rose-400'
                                  : 'text-text-secondary'
                              }
                            >
                              {signed > 0 ? '+' : ''}
                              {formatCurrency(signed)}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-2.5 py-1.5 text-right font-mono text-text-primary tabular-nums whitespace-nowrap">
                        {formatCurrency(entry.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border-subtle bg-surface-2/40">
                    <td
                      colSpan={4}
                      className="px-2 py-1.5 font-medium text-text-secondary"
                    >
                      Total
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono font-medium text-text-primary tabular-nums whitespace-nowrap">
                      {formatCurrency(runningBalance)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : selectedDetail && entriesWithBalance.length === 0 ? (
            <div className="flex items-center justify-center rounded-lg border border-dashed border-border-subtle bg-surface-2/30 p-8 text-center">
              <div>
                <div className="text-sm font-medium text-text-secondary">
                  No transactions this period
                </div>
                <div className="mt-2 text-xs text-text-muted">
                  Account balance may come from prior periods.
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-lg border border-dashed border-border-subtle bg-surface-2/30 p-8 text-center">
              <div>
                <div className="text-sm font-medium text-text-secondary">
                  No account selected
                </div>
                <div className="mt-2 text-xs text-text-muted">
                  Click account rows in the balance sheet to see account transactions.
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
