'use client';

import Link from 'next/link';
import {
  CalendarDays,
  CheckCircle2,
  Copy,
  ReceiptText,
  Save,
  Trash2,
} from 'lucide-react';
import { formatCurrency } from '@/lib/accounting';
import { formatAmountInputValue } from '@/lib/amount-input';
import { buildDocumentListHref } from '@/lib/document-links';
import type { EntryDetail, DocumentSummary } from '@/lib/documents-table';
import DeleteDocumentButton from './DeleteDocumentButton';

const mutedPanelClass =
  'rounded-xl border border-border-subtle bg-surface-1/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-white shadow-[0_12px_30px_-16px_rgba(217,119,6,0.6)] transition hover:bg-accent-light hover:text-surface-0 disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-text-muted disabled:shadow-none';
const secondaryButtonClass =
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap self-start rounded-md border border-border-subtle bg-surface-2/60 px-2.5 py-1.5 text-[11px] font-medium text-text-secondary transition hover:border-border-medium hover:bg-surface-3/60 hover:text-text-primary disabled:cursor-not-allowed disabled:text-text-muted';

interface DocumentExpandedRowProps {
  doc: DocumentSummary;
  periodId: number;
  periodLocked: boolean;

  draftDateValue: string;
  onDateChange: (value: string) => void;
  dateMessage: { tone: 'error' | 'success'; text: string } | null;

  draftCategoryValue: string;
  onCategoryChange: (value: string) => void;
  draftNameValue: string;
  onNameChange: (value: string) => void;
  draftLabel: {
    code: string;
    name: string;
    category: string;
    description: string;
  };
  metadataMessage: { tone: 'error' | 'success'; text: string } | null;
  isSavingDocument: boolean;
  documentDirty: boolean;
  onDocumentSave: () => void;

  isDuplicating: boolean;
  duplicateMessage: { tone: 'error' | 'success'; text: string } | null;
  onDuplicate: () => void;

  deleteMessage: { tone: 'error' | 'success'; text: string } | null;
  onDocumentDeleted: () => void;
  onDeleteError: (message: string) => void;

  visibleEntries: EntryDetail[];
  amountValues: Record<number, string>;
  onAmountChange: (entryId: number, value: string) => void;
  onEntryDelete: (entryId: number) => void;
  amountMessage: { tone: 'error' | 'success'; text: string } | null;
  draftDebitTotal: number;
  draftCreditTotal: number;
  amountsBalanced: boolean;
  amountsDirty: boolean;
  isSavingAmounts: boolean;
  pendingDeletionCount: number;
  onClearPendingDeletions: () => void;
  onAmountsSave: () => void;

  onOpenAccountPicker: (entryId: number, currentAccountId: number) => void;
}

export default function DocumentExpandedRow({
  doc,
  periodId,
  periodLocked,
  draftDateValue,
  onDateChange,
  dateMessage,
  draftCategoryValue,
  onCategoryChange,
  draftNameValue,
  onNameChange,
  draftLabel,
  metadataMessage,
  isSavingDocument,
  documentDirty,
  onDocumentSave,
  isDuplicating,
  duplicateMessage,
  onDuplicate,
  deleteMessage,
  onDocumentDeleted,
  onDeleteError,
  visibleEntries,
  amountValues,
  onAmountChange,
  onEntryDelete,
  amountMessage,
  draftDebitTotal,
  draftCreditTotal,
  amountsBalanced,
  amountsDirty,
  isSavingAmounts,
  pendingDeletionCount,
  onClearPendingDeletions,
  onAmountsSave,
  onOpenAccountPicker,
}: DocumentExpandedRowProps) {
  return (
    <div className="border-t border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.14),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.64),rgba(2,6,23,0.64))] px-3 py-2.5 pl-9">
      <div className="space-y-2.5">
        {periodLocked ? (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-100">
            Period is locked. Document details, entries, and attachments are
            read-only.
          </div>
        ) : null}
        <div className="grid gap-2.5 xl:grid-cols-2">
          <form
            className={`${mutedPanelClass} flex h-full flex-col justify-between gap-3 p-3`}
            onSubmit={(e) => {
              e.preventDefault();
              onDocumentSave();
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted">
                  <CalendarDays className="h-3 w-3" />
                  Tosite
                </div>
              </div>
              {metadataMessage?.tone === 'success' && (
                <span className="inline-flex items-center gap-1 rounded-full border border-green-400/20 bg-green-500/10 px-2 py-0.5 text-[10px] text-green-300">
                  <CheckCircle2 className="h-3 w-3" />
                  Saved
                </span>
              )}
            </div>

            <div className="space-y-2.5">
              <div className="grid gap-2 sm:grid-cols-[110px_minmax(0,1fr)]">
                <div>
                  <label
                    htmlFor={`document-category-${doc.id}`}
                    className="mb-1 block text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted"
                  >
                    Kategoria
                  </label>
                  <input
                    id={`document-category-${doc.id}`}
                    type="text"
                    value={draftCategoryValue}
                    onChange={(e) => onCategoryChange(e.target.value)}
                    aria-label="Receipt kategoria"
                    className="input-field font-mono uppercase"
                    placeholder="MU"
                    disabled={periodLocked}
                  />
                </div>
                <div>
                  <label
                    htmlFor={`document-name-${doc.id}`}
                    className="mb-1 block text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted"
                  >
                    Viennin nimi
                  </label>
                  <input
                    id={`document-name-${doc.id}`}
                    type="text"
                    value={draftNameValue}
                    onChange={(e) => onNameChange(e.target.value)}
                    aria-label="Viennin nimi"
                    className="input-field"
                    placeholder="Perustamismenot"
                    disabled={periodLocked}
                  />
                </div>
              </div>
              <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_152px]">
                <div className="rounded-lg border border-border-subtle bg-surface-2/40 px-2.5 py-1.5 text-[11px] text-text-secondary">
                  Koodi:{' '}
                  <span className="font-mono text-text-primary">
                    {draftLabel.code}
                  </span>
                </div>
                <input
                  id={`document-date-${doc.id}`}
                  type="date"
                  value={draftDateValue}
                  onChange={(e) => onDateChange(e.target.value)}
                  aria-label="Document date"
                  className="input-field"
                  disabled={periodLocked}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="min-h-4 text-[11px]">
                {dateMessage?.tone === 'error' && (
                  <p className="text-red-300">{dateMessage.text}</p>
                )}
                {metadataMessage && (
                  <p
                    className={
                      metadataMessage.tone === 'error'
                        ? 'text-red-300'
                        : 'text-green-300'
                    }
                  >
                    {metadataMessage.text}
                  </p>
                )}
                {duplicateMessage && (
                  <p
                    className={
                      duplicateMessage.tone === 'error'
                        ? 'text-red-300'
                        : 'text-green-300'
                    }
                  >
                    {duplicateMessage.text}
                  </p>
                )}
                {deleteMessage && (
                  <p className="text-red-300">{deleteMessage.text}</p>
                )}
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
                <button
                  type="submit"
                  disabled={
                    periodLocked ||
                    isSavingDocument ||
                    !documentDirty ||
                    !draftDateValue
                  }
                  className={`${primaryButtonClass} w-full`}
                >
                  <Save className="h-3 w-3" />
                  {isSavingDocument ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={onDuplicate}
                  disabled={periodLocked || isDuplicating}
                  className={`${secondaryButtonClass} w-full justify-center`}
                >
                  <Copy className="h-3 w-3" />
                  {isDuplicating ? 'Kopioidaan...' : 'Kopioi uudeksi'}
                </button>
                <DeleteDocumentButton
                  documentId={doc.id}
                  documentCode={doc.code}
                  onDeleted={onDocumentDeleted}
                  onError={onDeleteError}
                  disabled={periodLocked}
                  className="inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-rose-400/15 bg-rose-500/8 px-2.5 py-1.5 text-xs font-medium text-rose-300 transition hover:border-rose-400/25 hover:bg-rose-500/12 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/4 disabled:text-text-muted"
                >
                  Delete document
                </DeleteDocumentButton>
                <Link
                  href={buildDocumentListHref(doc.id, periodId)}
                  className={`${secondaryButtonClass} w-full justify-center`}
                >
                  Permanent link
                </Link>
              </div>
            </div>
          </form>

          <div
            className={`${mutedPanelClass} flex h-full flex-col justify-between gap-3 p-3`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted">
                  <ReceiptText className="h-3 w-3" />
                  Accounting entries
                </div>
                <p className="mt-1 text-xs text-text-secondary">
                  Entry totals must match before saving.
                </p>
              </div>
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                  amountsBalanced
                    ? 'border-green-400/20 bg-green-500/10 text-green-300'
                    : 'border-amber-400/20 bg-amber-500/10 text-amber-200'
                }`}
              >
                {amountsBalanced ? 'Tasapainossa' : 'Vaatii tarkistuksen'}
              </span>
            </div>

            <div className="flex flex-1 flex-col justify-between gap-3">
              <div className="grid gap-1.5 sm:grid-cols-3">
                <span className="rounded-lg border border-border-subtle bg-surface-2/40 px-2.5 py-2 text-[11px] text-text-secondary">
                  Debit{' '}
                  <span className="ml-0.5 font-mono text-text-primary">
                    {formatCurrency(draftDebitTotal / 100)}
                  </span>
                </span>
                <span className="rounded-lg border border-border-subtle bg-surface-2/40 px-2.5 py-2 text-[11px] text-text-secondary">
                  Credit{' '}
                  <span className="ml-0.5 font-mono text-text-primary">
                    {formatCurrency(draftCreditTotal / 100)}
                  </span>
                </span>
                <span
                  className={`rounded-lg border px-2.5 py-2 text-[11px] ${
                    amountsBalanced
                      ? 'border-green-400/20 bg-green-500/10 text-green-300'
                      : 'border-amber-400/20 bg-amber-500/10 text-amber-200'
                  }`}
                >
                  Erotus{' '}
                  <span className="ml-0.5 font-mono">
                    {formatCurrency(
                      Math.abs(draftDebitTotal - draftCreditTotal) / 100,
                    )}
                  </span>
                </span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-h-4 text-[11px]">
                  {amountMessage && (
                    <p
                      className={
                        amountMessage.tone === 'error'
                          ? 'text-red-300'
                          : 'text-green-300'
                      }
                    >
                      {amountMessage.text}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {pendingDeletionCount > 0 && (
                    <button
                      type="button"
                      onClick={onClearPendingDeletions}
                      disabled={periodLocked || isSavingAmounts}
                      className={secondaryButtonClass}
                    >
                      Peru poistot
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onAmountsSave}
                    disabled={
                      periodLocked ||
                      isSavingAmounts ||
                      !amountsDirty ||
                      !amountsBalanced ||
                      visibleEntries.length < 2
                    }
                    className={primaryButtonClass}
                  >
                    <Save className="h-3 w-3" />
                    {isSavingAmounts
                      ? 'Saving amounts...'
                      : 'Save amounts'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={`${mutedPanelClass} min-w-0 overflow-hidden`}>
          <table className="w-full table-fixed">
            <thead>
              <tr className="border-b border-white/8 bg-black/20">
                <th className="w-[148px] py-1.5 pl-3 pr-2 text-left text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted">
                  Account
                </th>
                <th className="px-2 py-1.5 text-left text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted">
                  Description
                </th>
                <th className="w-[88px] px-2 py-1.5 text-right text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted">
                  Debit
                </th>
                <th className="w-[88px] px-2 py-1.5 text-right text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted">
                  Credit
                </th>
                <th className="w-24 px-2 py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {visibleEntries.map((entry) => {
                const entryDescription = draftLabel.name
                  ? `${draftLabel.code} ${draftLabel.name}`
                  : draftLabel.code;

                return (
                  <tr key={entry.id} className="align-top hover:bg-white/3">
                    <td className="w-[148px] py-1.5 pl-3 pr-2 text-xs">
                      <button
                        type="button"
                        onClick={() =>
                          onOpenAccountPicker(entry.id, entry.account_id)
                        }
                        disabled={periodLocked}
                        className="flex w-full items-center gap-1.5 overflow-hidden rounded-md border border-transparent px-1.5 py-1 text-left transition hover:border-border-subtle hover:bg-surface-0/40"
                      >
                        <span className="inline-flex rounded-full border border-accent/15 bg-accent-muted px-2 py-0.5 font-mono text-[11px] text-accent-light">
                          {entry.account_number}
                        </span>
                        <div className="truncate text-[11px] text-text-secondary">
                          {entry.account_name}
                        </div>
                      </button>
                    </td>
                    <td className="px-2 py-1.5 text-xs text-text-muted">
                      <div className="rounded-md border border-border-subtle bg-surface-0/35 px-2.5 py-1.5 text-[11px] text-text-secondary">
                        {entryDescription}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right text-xs">
                      {entry.debit ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          value={
                            amountValues[entry.id] ??
                            formatAmountInputValue(entry.amount)
                          }
                          onChange={(e) =>
                            onAmountChange(entry.id, e.target.value)
                          }
                          className="input-field w-[88px] px-2 text-right font-mono"
                          placeholder="0,00"
                          disabled={periodLocked}
                        />
                      ) : (
                        <span className="inline-flex w-[88px] items-center justify-center px-2 py-1.5 font-mono text-text-muted">
                          -
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right text-xs">
                      {!entry.debit ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          value={
                            amountValues[entry.id] ??
                            formatAmountInputValue(entry.amount)
                          }
                          onChange={(e) =>
                            onAmountChange(entry.id, e.target.value)
                          }
                          className="input-field w-[88px] px-2 text-right font-mono"
                          placeholder="0,00"
                          disabled={periodLocked}
                        />
                      ) : (
                        <span className="inline-flex w-[88px] items-center justify-center px-2 py-1.5 font-mono text-text-muted">
                          -
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right text-xs">
                      <button
                        type="button"
                        onClick={() => onEntryDelete(entry.id)}
                        disabled={
                          periodLocked ||
                          isSavingAmounts ||
                          visibleEntries.length <= 2
                        }
                        data-skip-description-autosave="true"
                        className="inline-flex shrink-0 items-center justify-center gap-1 rounded-md border border-rose-400/15 bg-rose-500/8 px-2.5 py-1.5 text-[11px] font-medium text-rose-300 transition hover:border-rose-400/25 hover:bg-rose-500/12 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/4 disabled:text-text-muted"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
