'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2 } from 'lucide-react';
import { formatCurrency, periodLabel } from '@/lib/accounting';
import { deleteBankStatementAction } from '@/actions/app-actions';
import type { BankStatementWithStats } from '@/lib/types';

interface Props {
  statements: BankStatementWithStats[];
}

function getStatus(statement: BankStatementWithStats) {
  const allProcessed =
    statement.entry_count > 0 &&
    statement.processed_count === statement.entry_count;
  const noneProcessed = statement.processed_count === 0;

  if (statement.entry_count === 0) {
    return <span className="text-xs text-text-muted">Empty</span>;
  }

  if (allProcessed) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 bg-green-400/10 px-2 py-0.5 rounded-full">
        Valmis
      </span>
    );
  }

  if (noneProcessed) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">
        Unprocessed
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-accent bg-blue-400/10 px-2 py-0.5 rounded-full">
      {statement.processed_count}/{statement.entry_count}
    </span>
  );
}

export default function BankStatementsList({ statements }: Props) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState('');

  const selectedStatements = useMemo(
    () => statements.filter((statement) => selectedIds.has(statement.id)),
    [selectedIds, statements],
  );

  const allSelected =
    statements.length > 0 &&
    statements.every((statement) => selectedIds.has(statement.id));
  const hasSelection = selectedStatements.length > 0;

  useEffect(() => {
    setSelectedIds((current) => {
      const validIds = new Set(statements.map((statement) => statement.id));
      const next = new Set([...current].filter((id) => validIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [statements]);

  const toggleSelection = (statementId: number) => {
    setActionError('');
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(statementId)) {
        next.delete(statementId);
      } else {
        next.add(statementId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    setActionError('');
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }

    setSelectedIds(new Set(statements.map((statement) => statement.id)));
  };

  const handleDeleteSelected = async () => {
    if (!hasSelection) {
      setActionError('Select at least one bank statement to delete.');
      return;
    }

    const confirmMessage = [
      `Remove ${selectedStatements.length} selected bank statement(s) from the list?`,
      '',
      'Selected bank statement rows are removed, but documents are not deleted.',
    ].join('\n');

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setIsDeleting(true);
    setActionError('');

    try {
      for (const statement of selectedStatements) {
        await deleteBankStatementAction(statement.id);
      }

      setSelectedIds(new Set());
      router.refresh();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Bank statement deletion failed.',
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div>
      {(hasSelection || actionError) && (
        <div className="mb-4 rounded-xl border border-border-subtle bg-surface-2/50 p-4">
          {actionError && (
            <div className="mb-3 rounded-lg border border-red-700/50 bg-red-900/20 px-4 py-3 text-sm text-rose-300">
              {actionError}
            </div>
          )}

          {hasSelection && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-text-primary">
                    {selectedStatements.length} tiliotetta valittu
                  </div>
                  <div className="text-xs text-text-secondary mt-1">
                    Poista valitut tiliotteet kerralla.
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    disabled={isDeleting}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-text-muted"
                  >
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Poista valitut
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-surface-2/50 border border-border-subtle rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className="w-10 px-3 py-2 text-center">
                <label className="inline-flex min-h-[32px] min-w-[32px] cursor-pointer items-center justify-center">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all bank statements"
                    className="h-4 w-4"
                  />
                </label>
              </th>
              <th className="text-left text-[10px] font-semibold text-text-muted uppercase tracking-[0.15em] px-3 py-2">
                Period
              </th>
              <th className="text-left text-[10px] font-semibold text-text-muted uppercase tracking-[0.15em] px-3 py-2">
                Bank account
              </th>
              <th className="text-right text-[10px] font-semibold text-text-muted uppercase tracking-[0.15em] px-3 py-2">
                Start balance
              </th>
              <th className="text-right text-[10px] font-semibold text-text-muted uppercase tracking-[0.15em] px-3 py-2">
                End balance
              </th>
              <th className="text-center text-[10px] font-semibold text-text-muted uppercase tracking-[0.15em] px-3 py-2">
                Rows
              </th>
              <th className="text-center text-[10px] font-semibold text-text-muted uppercase tracking-[0.15em] px-3 py-2">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="table-divide">
            {statements.map((statement) => {
              const statementPeriodLabel = periodLabel(
                statement.period_start,
                statement.period_end,
              );

              return (
                <tr
                  key={statement.id}
                  className="hover:bg-surface-3/40 transition-colors"
                >
                  <td className="px-3 py-1.5 text-center">
                    <label className="inline-flex min-h-[32px] min-w-[32px] cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(statement.id)}
                        onChange={() => toggleSelection(statement.id)}
                        aria-label={`Select bank statement ${statementPeriodLabel}`}
                        className="h-4 w-4"
                      />
                    </label>
                  </td>
                  <td className="px-3 py-1.5">
                    <Link
                      href={`/bank-statements/${statement.id}`}
                      className="text-accent hover:text-accent-light text-xs font-medium"
                    >
                      {statementPeriodLabel}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 text-xs text-text-secondary">
                    <span className="font-mono text-accent/80 text-[11px]">
                      {statement.account_number}
                    </span>{' '}
                    {statement.account_name}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-right font-mono text-text-secondary tabular-nums">
                    {formatCurrency(statement.opening_balance)}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-right font-mono text-text-secondary tabular-nums">
                    {formatCurrency(statement.closing_balance)}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-center text-text-secondary">
                    {statement.entry_count}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    {getStatus(statement)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {statements.length === 0 && (
          <div className="text-center py-12 text-text-muted text-sm">
            No bank statements. Add your first one.
          </div>
        )}
      </div>
    </div>
  );
}
