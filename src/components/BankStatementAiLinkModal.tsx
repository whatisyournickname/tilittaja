'use client';

import Link from 'next/link';
import { Check, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { useModalA11y } from '@/hooks/useModalA11y';
import { formatCurrency, formatDate } from '@/lib/accounting';
import { buildDocumentListHref } from '@/lib/document-links';

export interface BankStatementAiLinkSuggestion {
  entryId: number;
  documentId: number | null;
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
  document: {
    id: number;
    number: number;
    date: number;
    category: string;
    name: string;
    totalDebit: number;
    totalCredit: number;
    descriptions: string[];
  } | null;
}

interface EntrySummary {
  id: number;
  entry_date: number;
  counterparty: string;
  reference: string | null;
  message: string | null;
  amount: number;
}

interface Props {
  entries: EntrySummary[];
  periodId: number;
  suggestions: BankStatementAiLinkSuggestion[];
  loading: boolean;
  loadError: string;
  applying: boolean;
  selectedEntryIds: Set<number>;
  onToggleEntry: (entryId: number) => void;
  onToggleAll: () => void;
  onRefresh: () => void;
  onApply: () => void;
  onClose: () => void;
}

function getConfidenceBadgeClasses(confidence: BankStatementAiLinkSuggestion['confidence']) {
  if (confidence === 'high') {
    return 'bg-emerald-500/10 text-emerald-300';
  }
  if (confidence === 'medium') {
    return 'bg-amber-500/10 text-amber-200';
  }
  return 'bg-surface-3/80 text-text-secondary';
}

function getConfidenceLabel(confidence: BankStatementAiLinkSuggestion['confidence']) {
  if (confidence === 'high') return 'Strong';
  if (confidence === 'medium') return 'Possible';
  return 'Weak';
}

export default function BankStatementAiLinkModal({
  entries,
  periodId,
  suggestions,
  loading,
  loadError,
  applying,
  selectedEntryIds,
  onToggleEntry,
  onToggleAll,
  onRefresh,
  onApply,
  onClose,
}: Props) {
  const { containerRef, handleKeyDown } = useModalA11y(onClose);
  const selectableSuggestionIds = suggestions
    .filter((suggestion) => suggestion.document != null)
    .map((suggestion) => suggestion.entryId);
  const selectedCount = selectableSuggestionIds.filter((entryId) =>
    selectedEntryIds.has(entryId),
  ).length;
  const allSelected =
    selectableSuggestionIds.length > 0 &&
    selectableSuggestionIds.every((entryId) => selectedEntryIds.has(entryId));

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black/70 p-4 md:p-8"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Link to documents with AI"
        className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-0"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-4 py-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
              <Sparkles className="h-4 w-4 text-accent-light" />
              Link to documents (AI)
            </div>
            <div className="mt-1 text-xs text-text-secondary">
              Review suggestions before accepting. Only selected suggestions will
              be linked to bank statement rows.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading || applying}
              className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-1/70 px-3 py-2 text-xs text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary disabled:cursor-not-allowed disabled:text-text-muted"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh suggestions
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-text-secondary hover:text-text-primary"
              aria-label="Sulje AI-linkitys"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-surface-1/20">
          {loading ? (
            <div className="flex h-full min-h-72 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-text-secondary">
              <Loader2 className="h-6 w-6 animate-spin text-accent-light" />
              AI searches for matching documents for the selected bank statement rows.
            </div>
          ) : loadError ? (
            <div className="p-4">
              <div className="rounded-lg border border-red-700/50 bg-red-900/20 px-4 py-3 text-sm text-rose-300">
                {loadError}
              </div>
            </div>
          ) : suggestions.length === 0 ? (
            <div className="flex h-full min-h-72 items-center justify-center px-6 text-center text-sm text-text-muted">
              No AI suggestions found for selected rows.
            </div>
          ) : (
            <div className="divide-y divide-border-subtle">
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <label className="inline-flex items-center gap-3 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={onToggleAll}
                    disabled={selectableSuggestionIds.length === 0}
                    className="h-4 w-4 rounded border-border-subtle bg-surface-0/60 text-accent focus:ring-accent/20"
                  />
                  Select all suggestions
                </label>
                <div className="text-xs text-text-muted">
                  {selectedCount} / {selectableSuggestionIds.length} selected
                  to accept
                </div>
              </div>

              {suggestions.map((suggestion) => {
                const entry = entries.find((candidate) => candidate.id === suggestion.entryId);
                if (!entry) return null;

                const description = [entry.message, entry.reference]
                  .filter(Boolean)
                  .join(' | ');

                return (
                  <div
                    key={suggestion.entryId}
                    className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedEntryIds.has(suggestion.entryId)}
                        onChange={() => onToggleEntry(suggestion.entryId)}
                        disabled={suggestion.document == null}
                        className="mt-1 h-4 w-4 rounded border-border-subtle bg-surface-0/60 text-accent focus:ring-accent/20 disabled:cursor-not-allowed"
                        aria-label={`Accept AI suggestion for row ${entry.id}`}
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                          <span>{formatDate(entry.entry_date)}</span>
                          <span
                            className={`font-mono ${
                              entry.amount > 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {entry.amount > 0 ? '+' : ''}
                            {formatCurrency(entry.amount)}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] ${getConfidenceBadgeClasses(
                              suggestion.confidence,
                            )}`}
                          >
                            {getConfidenceLabel(suggestion.confidence)}
                          </span>
                        </div>
                        <div className="mt-2 text-sm font-medium text-text-primary">
                          {entry.counterparty || 'Unnamed transaction'}
                        </div>
                        {description ? (
                          <div className="mt-1 text-xs text-text-muted">
                            {description}
                          </div>
                        ) : null}
                        <div className="mt-2 text-xs text-text-secondary">
                          {suggestion.rationale}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border-subtle bg-surface-1/60 p-3">
                      {suggestion.document ? (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-text-primary">
                                Tosite #{suggestion.document.number}
                              </div>
                              <div className="mt-1 text-xs text-text-secondary">
                                {formatDate(suggestion.document.date)}
                                {suggestion.document.category
                                  ? ` · ${suggestion.document.category}`
                                  : ''}
                              </div>
                              {suggestion.document.name ? (
                                <div className="mt-2 text-sm text-text-secondary">
                                  {suggestion.document.name}
                                </div>
                              ) : null}
                            </div>
                            <Link
                              href={buildDocumentListHref(
                                suggestion.document.id,
                                periodId,
                              )}
                              target="_blank"
                              className="inline-flex shrink-0 items-center gap-1 text-xs text-accent-light hover:text-accent-light"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Open document
                            </Link>
                          </div>

                          <div className="mt-3 text-xs text-text-secondary">
                            Summa {formatCurrency(suggestion.document.totalDebit)}
                          </div>
                          {suggestion.document.descriptions.length > 0 ? (
                            <div className="mt-2 text-xs text-text-muted">
                              {suggestion.document.descriptions.join(' · ')}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <div className="text-sm text-text-muted">
                          AI did not suggest a matching existing
                          document(s).
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-4 py-3">
          <div className="text-xs text-text-muted">
            Accept only suggestions that look correct.
          </div>
          <button
            type="button"
            onClick={onApply}
            disabled={loading || applying || selectedCount === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-text-muted"
          >
            {applying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Accept selected suggestions ({selectedCount})
          </button>
        </div>
      </div>
    </div>
  );
}
