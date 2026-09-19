'use client';

import { useMemo, useState, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/accounting';
import { getDebitAmount, getCreditAmount } from '@/lib/entry-amounts';
import type { ReceiptSource } from '@/lib/receipt-pdfs';
import { SortableHeader, SortState, toggleSort } from './SortableHeader';
import ReceiptAttachmentPanel from './ReceiptAttachmentPanel';
import SearchInput from '@/components/SearchInput';

interface LedgerEntry {
  id: number;
  document_id: number;
  document_number: number;
  document_date: number;
  description: string;
  debit: boolean;
  amount: number;
  balance: number;
  documentCode: string;
  documentDescription: string;
  receiptPath: string | null;
  receiptSource: ReceiptSource;
}

interface LedgerGroup {
  accountId: number;
  accountNumber: string;
  accountName: string;
  finalBalance: number;
  rows: LedgerEntry[];
}

type SortKey =
  | 'document_number'
  | 'document_date'
  | 'description'
  | 'debit'
  | 'credit'
  | 'balance';

export default function GeneralLedgerFilter({
  groups,
}: {
  groups: LedgerGroup[];
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState<SortKey> | null>(null);
  const [collapsedAccountIds, setCollapsedAccountIds] = useState<Set<number>>(
    () => new Set(),
  );

  const filtered = groups.filter((g) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      g.accountNumber.includes(q) ||
      g.accountName.toLowerCase().includes(q) ||
      g.rows.some((r) => r.description.toLowerCase().includes(q))
    );
  });

  const sortedGroups = useMemo(() => {
    if (!sort) return filtered;
    const { key, direction } = sort;
    const mult = direction === 'asc' ? 1 : -1;
    return filtered.map((group) => ({
      ...group,
      rows: [...group.rows].sort((a, b) => {
        switch (key) {
          case 'document_number':
            return (a.document_number - b.document_number) * mult;
          case 'document_date':
            return (a.document_date - b.document_date) * mult;
          case 'description':
            return a.description.localeCompare(b.description, 'fi') * mult;
          case 'debit':
            return (
              (getDebitAmount(a.amount, a.debit) -
                getDebitAmount(b.amount, b.debit)) *
              mult
            );
          case 'credit':
            return (
              (getCreditAmount(a.amount, a.debit) -
                getCreditAmount(b.amount, b.debit)) *
              mult
            );
          case 'balance':
            return (a.balance - b.balance) * mult;
          default:
            return 0;
        }
      }),
    }));
  }, [filtered, sort]);

  const visibleRows = useMemo(
    () => sortedGroups.flatMap((group) => group.rows),
    [sortedGroups],
  );
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(
    () => groups[0]?.rows[0]?.id ?? null,
  );
  const [documentReceiptOverrides, setDocumentReceiptOverrides] = useState<
    Record<number, { receiptPath: string | null; receiptSource: ReceiptSource }>
  >({});
  const effectiveSelectedEntryId =
    selectedEntryId != null &&
    visibleRows.some((entry) => entry.id === selectedEntryId)
      ? selectedEntryId
      : (visibleRows[0]?.id ?? null);

  const handleSort = (key: SortKey) => setSort(toggleSort(sort, key));
  const toggleGroup = (accountId: number) => {
    setCollapsedAccountIds((current) => {
      const next = new Set(current);
      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      return next;
    });
  };
  const expandAllGroups = () => {
    setCollapsedAccountIds((current) => {
      const next = new Set(current);
      for (const group of sortedGroups) {
        next.delete(group.accountId);
      }
      return next;
    });
  };
  const collapseAllGroups = () => {
    setCollapsedAccountIds((current) => {
      const next = new Set(current);
      for (const group of sortedGroups) {
        next.add(group.accountId);
      }
      return next;
    });
  };
  const activeEntry =
    visibleRows.find((entry) => entry.id === effectiveSelectedEntryId) ?? null;
  const activeDocument = activeEntry
    ? {
        documentId: activeEntry.document_id,
        documentNumber: activeEntry.document_number,
        documentCode: activeEntry.documentCode,
        documentDescription: activeEntry.documentDescription,
        receiptPath:
          documentReceiptOverrides[activeEntry.document_id]?.receiptPath ??
          activeEntry.receiptPath,
        receiptSource:
          documentReceiptOverrides[activeEntry.document_id]?.receiptSource ??
          activeEntry.receiptSource,
      }
    : null;
  const handleEntryKeyDown = (
    event: KeyboardEvent<HTMLTableRowElement>,
    entryId: number,
  ) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    setSelectedEntryId(entryId);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search account or description..."
            className="min-w-[280px] flex-1"
          />

          <button
            type="button"
            onClick={collapseAllGroups}
            disabled={sortedGroups.length === 0 || Boolean(search)}
            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-border-subtle bg-surface-2/60 px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-3/50 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Laita kaikki kiinni
          </button>
          <button
            type="button"
            onClick={expandAllGroups}
            disabled={sortedGroups.length === 0}
            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-border-subtle bg-surface-2/60 px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-3/50 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Laajenna kaikki
          </button>
        </div>

        <div className="space-y-3">
          {sortedGroups.map((group) => {
            const isCollapsed =
              !search && collapsedAccountIds.has(group.accountId);
            const ToggleIcon = isCollapsed ? ChevronRight : ChevronDown;

            return (
              <div
                key={group.accountId}
                className="bg-surface-2/50 border border-border-subtle rounded-xl overflow-hidden overflow-x-auto"
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group.accountId)}
                  aria-expanded={!isCollapsed}
                  className={`w-full px-4 py-2.5 bg-surface-2/80 flex items-center justify-between text-left transition-colors hover:bg-surface-3/40 ${
                    isCollapsed ? '' : 'border-b border-border-subtle'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <ToggleIcon className="w-4 h-4 shrink-0 text-text-muted" />
                    <div className="text-xs min-w-0">
                      <span className="font-mono text-accent mr-2">
                        {group.accountNumber}
                      </span>
                      <span className="text-text-primary font-medium">
                        {group.accountName}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-text-secondary shrink-0 pl-4">
                    {formatCurrency(group.finalBalance)}
                  </span>
                </button>

                {!isCollapsed && (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border-subtle/50">
                        <SortableHeader
                          label="Nro"
                          sortKey="document_number"
                          current={sort}
                          onSort={handleSort}
                          className="w-14 py-1.5"
                        />
                        <SortableHeader
                          label="Date"
                          sortKey="document_date"
                          current={sort}
                          onSort={handleSort}
                          className="w-24 py-1.5"
                        />
                        <SortableHeader
                          label="Description"
                          sortKey="description"
                          current={sort}
                          onSort={handleSort}
                          className="py-1.5"
                        />
                        <SortableHeader
                          label="Debit"
                          sortKey="debit"
                          current={sort}
                          onSort={handleSort}
                          align="right"
                          className="w-20 py-1.5"
                        />
                        <SortableHeader
                          label="Credit"
                          sortKey="credit"
                          current={sort}
                          onSort={handleSort}
                          align="right"
                          className="w-20 py-1.5"
                        />
                        <SortableHeader
                          label="Saldo"
                          sortKey="balance"
                          current={sort}
                          onSort={handleSort}
                          align="right"
                          className="w-24 py-1.5"
                        />
                      </tr>
                    </thead>
                    <tbody className="table-divide-subtle">
                      {group.rows.map((entry) => {
                        const isSelected =
                          entry.id === effectiveSelectedEntryId;

                        return (
                          <tr
                            key={entry.id}
                            tabIndex={0}
                            role="button"
                            aria-pressed={isSelected}
                            onClick={() => setSelectedEntryId(entry.id)}
                            onKeyDown={(event) =>
                              handleEntryKeyDown(event, entry.id)
                            }
                            className={`cursor-pointer transition-colors outline-none ${
                              isSelected
                                ? 'bg-accent-muted/60 hover:bg-accent-muted/70'
                                : 'hover:bg-surface-3/40'
                            } focus-visible:bg-accent-muted/60`}
                          >
                            <td className="px-3 py-2 text-xs font-mono text-text-secondary">
                              {entry.document_number}
                            </td>
                            <td className="px-3 py-2 text-xs text-text-secondary tabular-nums">
                              {formatDate(entry.document_date)}
                            </td>
                            <td className="px-3 py-2 text-xs text-text-secondary truncate max-w-0">
                              {entry.description}
                            </td>
                            <td className="px-3 py-2 text-xs text-right font-mono text-text-secondary tabular-nums">
                              {entry.debit ? formatCurrency(entry.amount) : ''}
                            </td>
                            <td className="px-3 py-2 text-xs text-right font-mono text-text-secondary tabular-nums">
                              {!entry.debit ? formatCurrency(entry.amount) : ''}
                            </td>
                            <td className="px-3 py-2 text-xs text-right font-mono text-text-primary tabular-nums">
                              {formatCurrency(entry.balance)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}

          {sortedGroups.length === 0 && (
            <div className="text-center py-8 text-text-muted text-sm">
              {search ? 'No search results' : 'No entries in this fiscal year'}
            </div>
          )}
        </div>

        {search && filtered.length !== groups.length && (
          <p className="text-xs text-text-muted">
            {filtered.length} / {groups.length} accounts
          </p>
        )}
      </div>

      <aside className="min-w-0 xl:sticky xl:top-8">
        <div className="rounded-xl border border-border-subtle bg-surface-1/50 p-4">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-text-primary">
              Preview
            </h2>
            {activeDocument ? (
              <p className="mt-1 text-xs text-text-secondary">
                {activeDocument.documentCode} -{' '}
                {activeDocument.documentDescription || 'No description'}
              </p>
            ) : (
              <p className="mt-1 text-xs text-text-muted">
                Select a booking row from the left to see the linked document here.
              </p>
            )}
          </div>

          {activeDocument ? (
            <ReceiptAttachmentPanel
              key={`${activeDocument.documentId}:${activeDocument.receiptPath ?? 'none'}`}
              documentId={activeDocument.documentId}
              documentNumber={activeDocument.documentNumber}
              documentCode={activeDocument.documentCode}
              initialReceiptPath={activeDocument.receiptPath}
              initialReceiptSource={activeDocument.receiptSource}
              onReceiptChange={(nextPath, nextSource) => {
                setDocumentReceiptOverrides((current) => ({
                  ...current,
                  [activeDocument.documentId]: {
                    receiptPath: nextPath,
                    receiptSource: nextSource,
                  },
                }));
              }}
            />
          ) : (
            <div className="flex aspect-210/297 items-center justify-center rounded-lg border border-dashed border-border-subtle bg-surface-2/30 p-6 text-center">
              <div>
                <div className="text-sm font-medium text-text-secondary">
                  Ei valittua kirjausta
                </div>
                <div className="mt-2 text-xs text-text-muted">
                  Preview-alue on varattu valitun tositteen PDF:lle.
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
