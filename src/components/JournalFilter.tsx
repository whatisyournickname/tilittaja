'use client';

import { useMemo, useState } from 'react';
import { formatCurrency, formatDate } from '@/lib/accounting';
import type { ReceiptSource } from '@/lib/receipt-pdfs';
import ReceiptAttachmentPanel from '@/components/ReceiptAttachmentPanel';
import SearchInput from '@/components/SearchInput';

interface JournalEntryRow {
  id: number;
  rowNumber: number;
  accountNumber: string;
  accountName: string;
  description: string;
  debit: boolean;
  amount: number;
}

interface JournalDocumentGroup {
  documentId: number;
  documentNumber: number;
  documentDate: number;
  documentCode: string;
  documentDescription: string;
  receiptPath: string | null;
  receiptSource: ReceiptSource;
  debitTotal: number;
  creditTotal: number;
  rows: JournalEntryRow[];
}

function matchesGroup(group: JournalDocumentGroup, query: string): boolean {
  if (!query) return true;

  const normalizedQuery = query.toLowerCase();
  if (String(group.documentNumber).includes(normalizedQuery)) return true;
  if (formatDate(group.documentDate).toLowerCase().includes(normalizedQuery))
    return true;

  return group.rows.some((row) => {
    return (
      row.accountNumber.toLowerCase().includes(normalizedQuery) ||
      row.accountName.toLowerCase().includes(normalizedQuery) ||
      row.description.toLowerCase().includes(normalizedQuery)
    );
  });
}

export default function JournalFilter({
  groups,
}: {
  groups: JournalDocumentGroup[];
}) {
  const [search, setSearch] = useState('');
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(
    () => groups[0]?.documentId ?? null,
  );
  const [documentReceiptOverrides, setDocumentReceiptOverrides] = useState<
    Record<number, { receiptPath: string | null; receiptSource: ReceiptSource }>
  >({});

  const filteredGroups = useMemo(
    () => groups.filter((group) => matchesGroup(group, search)),
    [groups, search],
  );
  const effectiveSelectedDocumentId =
    selectedDocumentId != null &&
    filteredGroups.some((group) => group.documentId === selectedDocumentId)
      ? selectedDocumentId
      : (filteredGroups[0]?.documentId ?? null);
  const activeGroup =
    filteredGroups.find(
      (group) => group.documentId === effectiveSelectedDocumentId,
    ) ?? null;
  const activeDocument = activeGroup
    ? {
        documentId: activeGroup.documentId,
        documentNumber: activeGroup.documentNumber,
        documentCode: activeGroup.documentCode,
        documentDescription: activeGroup.documentDescription,
        receiptPath:
          documentReceiptOverrides[activeGroup.documentId]?.receiptPath ??
          activeGroup.receiptPath,
        receiptSource:
          documentReceiptOverrides[activeGroup.documentId]?.receiptSource ??
          activeGroup.receiptSource,
      }
    : null;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div className="min-w-0 space-y-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search document, account, or description..."
        />

        <div className="space-y-3">
          {filteredGroups.map((group) => {
            const isSelected = group.documentId === effectiveSelectedDocumentId;

            return (
              <section
                key={group.documentId}
                className={`overflow-x-auto overflow-y-hidden rounded-xl border bg-surface-2/50 transition-colors ${
                  isSelected
                    ? 'border-accent/35 shadow-[0_0_0_1px_rgba(245,158,11,0.18)]'
                    : 'border-border-subtle'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedDocumentId(group.documentId)}
                  className={`flex w-full flex-wrap items-center justify-between gap-3 border-b px-4 py-3 text-left transition-colors ${
                    isSelected
                      ? 'border-accent/20 bg-accent-muted/35'
                      : 'border-border-subtle bg-surface-2/80 hover:bg-surface-3/35'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-accent-muted px-2.5 py-1 text-xs font-semibold text-accent-light">
                        {group.documentCode}
                      </span>
                      <span className="text-sm text-text-secondary">
                        {formatDate(group.documentDate)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-text-primary">
                      {group.documentDescription ||
                        `Document ${group.documentNumber}`}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      {group.rows.length} row
                      {group.rows.length === 1 ? '' : 's'}
                    </p>
                  </div>

                  <div className="flex gap-6 text-xs">
                    <div className="text-right">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted">
                        Debit
                      </div>
                      <div className="font-mono text-text-primary">
                        {formatCurrency(group.debitTotal)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted">
                        Credit
                      </div>
                      <div className="font-mono text-text-primary">
                        {formatCurrency(group.creditTotal)}
                      </div>
                    </div>
                  </div>
                </button>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px]">
                    <thead>
                      <tr className="border-b border-border-subtle/50">
                        <th className="w-14 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted">
                          Row
                        </th>
                        <th className="w-20 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted">
                          Account
                        </th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted">
                          Account name
                        </th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted">
                          Description
                        </th>
                        <th className="w-24 px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted">
                          Debit
                        </th>
                        <th className="w-24 px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted">
                          Credit
                        </th>
                      </tr>
                    </thead>
                    <tbody className="table-divide-subtle">
                      {group.rows.map((row) => (
                        <tr
                          key={row.id}
                          onClick={() =>
                            setSelectedDocumentId(group.documentId)
                          }
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-accent-muted/20 hover:bg-accent-muted/30'
                              : 'hover:bg-surface-3/40'
                          }`}
                        >
                          <td className="px-3 py-1.5 text-xs font-mono text-text-secondary">
                            {row.rowNumber}
                          </td>
                          <td className="px-3 py-1.5 text-xs font-mono text-accent-light">
                            {row.accountNumber}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-text-secondary">
                            {row.accountName}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-text-secondary">
                            {row.description}
                          </td>
                          <td className="px-3 py-1.5 text-right text-xs font-mono text-text-primary">
                            {row.debit ? formatCurrency(row.amount) : ''}
                          </td>
                          <td className="px-3 py-1.5 text-right text-xs font-mono text-text-primary">
                            {row.debit ? '' : formatCurrency(row.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}

          {filteredGroups.length === 0 ? (
            <div className="py-8 text-center text-sm text-text-muted">
              {search ? 'No search results' : 'No entries in this fiscal year'}
            </div>
          ) : null}
        </div>

        {search && filteredGroups.length !== groups.length ? (
          <p className="text-xs text-text-muted">
            {filteredGroups.length} / {groups.length} document(s)
          </p>
        ) : null}
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
                Select a document on the left to see its attached PDF here.
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
                  Ei valittua document(s)
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
