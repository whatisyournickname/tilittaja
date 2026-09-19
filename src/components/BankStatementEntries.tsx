'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Sparkles, Unlink } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/accounting';
import {
  applyBankStatementDocumentSuggestionsAction,
  suggestBankStatementDocumentLinksAction,
  updateBankStatementEntryDocumentAction,
} from '@/actions/app-actions';
import { buildDocumentListHref } from '@/lib/document-links';
import { buildPdfPreviewSrc } from '@/lib/pdf-preview';
import DocumentPickerModal from '@/components/DocumentPickerModal';
import type { DocumentOption } from '@/components/DocumentPickerModal';
import BankStatementAiLinkModal, {
  type BankStatementAiLinkSuggestion,
} from '@/components/BankStatementAiLinkModal';

interface EntryData {
  id: number;
  entry_date: number;
  counterparty: string;
  reference: string | null;
  message: string | null;
  payment_type: string;
  amount: number;
  document_id: number | null;
  document_number: number | null;
  counterpart_account_id: number | null;
  counterpart_account_number: string | null;
  counterpart_account_name: string | null;
}

interface Props {
  statementId: number;
  periodId: number;
  periodLocked: boolean;
  entries: EntryData[];
  documents: DocumentOption[];
}

export default function BankStatementEntries({
  statementId,
  periodId,
  periodLocked,
  entries,
  documents,
}: Props) {
  const router = useRouter();
  const [selectedEntries, setSelectedEntries] = useState<Set<number>>(() => {
    return new Set(entries.filter((e) => !e.document_id).map((e) => e.id));
  });
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<
    Map<number, number | null>
  >(() => {
    const map = new Map<number, number | null>();
    entries.forEach((e) => {
      map.set(e.id, e.document_id);
    });
    return map;
  });
  const [linkingEntryId, setLinkingEntryId] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');
  const [documentPickerEntryId, setDocumentPickerEntryId] = useState<
    number | null
  >(null);
  const [documentSearch, setDocumentSearch] = useState('');
  const [modalSelectedDocumentId, setModalSelectedDocumentId] = useState<
    number | null
  >(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiApplying, setAiApplying] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState<
    BankStatementAiLinkSuggestion[]
  >([]);
  const [aiSelectedEntryIds, setAiSelectedEntryIds] = useState<Set<number>>(
    new Set(),
  );

  useEffect(() => {
    setSelectedDocumentIds(() => {
      const map = new Map<number, number | null>();
      entries.forEach((entry) => {
        map.set(entry.id, entry.document_id);
      });
      return map;
    });

    setSelectedEntries(
      new Set(
        entries
          .filter((entry) => entry.document_id == null)
          .map((entry) => entry.id),
      ),
    );
  }, [entries]);

  const getCurrentDocumentId = (
    entryId: number,
    fallbackDocumentId: number | null,
  ) => selectedDocumentIds.get(entryId) ?? fallbackDocumentId;

  const unprocessedEntryIds = entries
    .filter(
      (entry) => getCurrentDocumentId(entry.id, entry.document_id) == null,
    )
    .map((entry) => entry.id);

  const unprocessedCount = unprocessedEntryIds.length;

  const sortedDocuments = useMemo(() => {
    return [...documents].sort((a, b) => b.number - a.number);
  }, [documents]);

  const currentPickerDocumentId = useMemo(() => {
    if (documentPickerEntryId == null) return null;
    return selectedDocumentIds.get(documentPickerEntryId) ?? null;
  }, [documentPickerEntryId, selectedDocumentIds]);

  const availableDocuments = sortedDocuments;

  const filteredDocuments = useMemo(() => {
    const query = documentSearch.trim().toLowerCase();
    if (!query) return availableDocuments;

    return availableDocuments.filter((document) =>
      [
        String(document.number),
        formatDate(document.date),
        document.description,
        document.receiptPath ?? '',
        document.receiptSource === 'manual'
          ? 'kasin'
          : document.receiptSource === 'automatic'
            ? 'automaattinen'
            : 'ei liitetta',
      ]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [availableDocuments, documentSearch]);

  const documentPickerEntry = useMemo(() => {
    if (documentPickerEntryId == null) return null;
    return entries.find((entry) => entry.id === documentPickerEntryId) ?? null;
  }, [documentPickerEntryId, entries]);

  const selectedModalDocument = useMemo(() => {
    if (modalSelectedDocumentId == null) return null;
    return (
      filteredDocuments.find(
        (document) => document.id === modalSelectedDocumentId,
      ) ??
      sortedDocuments.find(
        (document) => document.id === modalSelectedDocumentId,
      ) ??
      null
    );
  }, [filteredDocuments, modalSelectedDocumentId, sortedDocuments]);

  const selectedModalPreviewSrc = selectedModalDocument?.receiptPath
    ? buildPdfPreviewSrc(
        `/api/receipts/pdf?documentId=${selectedModalDocument.id}`,
      )
    : null;

  useEffect(() => {
    if (documentPickerEntryId == null) return;

    if (
      modalSelectedDocumentId != null &&
      filteredDocuments.some(
        (document) => document.id === modalSelectedDocumentId,
      )
    ) {
      return;
    }

    const currentDocumentId = currentPickerDocumentId;
    if (
      currentDocumentId != null &&
      filteredDocuments.some((document) => document.id === currentDocumentId)
    ) {
      setModalSelectedDocumentId(currentDocumentId);
      return;
    }

    setModalSelectedDocumentId(filteredDocuments[0]?.id ?? null);
  }, [
    currentPickerDocumentId,
    documentPickerEntryId,
    filteredDocuments,
    modalSelectedDocumentId,
  ]);

  const handleDocumentChange = async (
    entryId: number,
    documentId: number | null,
  ): Promise<boolean> => {
    if (periodLocked) {
      return false;
    }

    const previousDocumentId = selectedDocumentIds.get(entryId) ?? null;
    const previousSelectedEntries = new Set(selectedEntries);
    setActionError('');
    setSelectedDocumentIds((prev) => new Map(prev).set(entryId, documentId));
    setSelectedEntries((prev) => {
      const next = new Set(prev);
      if (documentId == null) next.add(entryId);
      else next.delete(entryId);
      return next;
    });
    setLinkingEntryId(entryId);

    try {
      await updateBankStatementEntryDocumentAction(statementId, {
        entryId,
        documentId,
      });
      return true;
    } catch (error) {
      setSelectedDocumentIds((prev) =>
        new Map(prev).set(entryId, previousDocumentId),
      );
      setSelectedEntries(previousSelectedEntries);
      setActionError(
        error instanceof Error
          ? error.message
          : 'Document linking failed.',
      );
      return false;
    } finally {
      setLinkingEntryId(null);
    }
  };

  const openDocumentPicker = (entryId: number) => {
    setActionError('');
    setDocumentSearch('');
    const currentDocumentId = selectedDocumentIds.get(entryId) ?? null;
    const reservedDocumentIds = new Set<number>();

    selectedDocumentIds.forEach((selectedId, selectedEntryId) => {
      if (selectedId == null) return;
      if (selectedEntryId === entryId) return;
      reservedDocumentIds.add(selectedId);
    });

    const firstAvailableDocumentId =
      sortedDocuments.find(
        (document) =>
          !reservedDocumentIds.has(document.id) ||
          document.id === currentDocumentId,
      )?.id ?? null;

    setModalSelectedDocumentId(currentDocumentId ?? firstAvailableDocumentId);
    setDocumentPickerEntryId(entryId);
  };

  const closeDocumentPicker = () => {
    setDocumentPickerEntryId(null);
    setDocumentSearch('');
    setModalSelectedDocumentId(null);
  };

  const handleLinkSelectedDocument = async () => {
    if (documentPickerEntryId == null || modalSelectedDocumentId == null)
      return;

    const success = await handleDocumentChange(
      documentPickerEntryId,
      modalSelectedDocumentId,
    );
    if (success) {
      closeDocumentPicker();
    }
  };

  const handleMarkUnprocessed = async (entryId: number) => {
    await handleDocumentChange(entryId, null);
  };

  const toggleEntry = (id: number) => {
    setSelectedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const allSelected = unprocessedEntryIds.every((id) =>
      selectedEntries.has(id),
    );
    if (allSelected) {
      setSelectedEntries(new Set());
    } else {
      setSelectedEntries(new Set(unprocessedEntryIds));
    }
  };

  const selectedUnprocessedEntryIds = unprocessedEntryIds.filter((id) =>
    selectedEntries.has(id),
  );

  const closeAiModal = (force = false) => {
    if (aiApplying && !force) return;
    setAiModalOpen(false);
    setAiError('');
    setAiSuggestions([]);
    setAiSelectedEntryIds(new Set());
    setAiLoading(false);
  };

  const loadAiSuggestions = async () => {
    if (selectedUnprocessedEntryIds.length === 0) {
      setAiError('Select at least one unprocessed row to link.');
      setAiSuggestions([]);
      setAiSelectedEntryIds(new Set());
      return;
    }

    setAiLoading(true);
    setAiError('');
    setAiSuggestions([]);

    try {
      const result = await suggestBankStatementDocumentLinksAction({
        statementId,
        entryIds: selectedUnprocessedEntryIds,
      });
      setAiSuggestions(result.suggestions);
      setAiSelectedEntryIds(
        new Set(
          result.suggestions
            .filter((suggestion) => suggestion.document != null)
            .map((suggestion) => suggestion.entryId),
        ),
      );
    } catch (error) {
      setAiError(
        error instanceof Error
          ? error.message
          : 'AI suggestions search failed.',
      );
    } finally {
      setAiLoading(false);
    }
  };

  const openAiModal = () => {
    if (periodLocked) return;
    if (selectedUnprocessedEntryIds.length === 0) {
      setActionError('Select at least one unprocessed row to link.');
      return;
    }

    setActionError('');
    setAiModalOpen(true);
    void loadAiSuggestions();
  };

  const toggleAiSuggestion = (entryId: number) => {
    setAiSelectedEntryIds((current) => {
      const next = new Set(current);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  };

  const toggleAllAiSuggestions = () => {
    const suggestionIds = aiSuggestions
      .filter((suggestion) => suggestion.document != null)
      .map((suggestion) => suggestion.entryId);
    const allSelected =
      suggestionIds.length > 0 &&
      suggestionIds.every((entryId) => aiSelectedEntryIds.has(entryId));

    setAiSelectedEntryIds(allSelected ? new Set() : new Set(suggestionIds));
  };

  const handleApplyAiSuggestions = async () => {
    const links = aiSuggestions
      .filter(
        (suggestion) =>
          suggestion.document != null &&
          aiSelectedEntryIds.has(suggestion.entryId),
      )
      .map((suggestion) => ({
        entryId: suggestion.entryId,
        documentId: suggestion.document!.id,
      }));

    if (links.length === 0) {
      setAiError('Select at least one AI suggestion to accept.');
      return;
    }

    setAiApplying(true);
    setAiError('');

    try {
      await applyBankStatementDocumentSuggestionsAction({
        statementId,
        links,
      });
      setSelectedEntries((current) => {
        const next = new Set(current);
        links.forEach((link) => next.delete(link.entryId));
        return next;
      });
      closeAiModal(true);
      router.refresh();
    } catch (error) {
      setAiError(
        error instanceof Error
          ? error.message
          : 'AI suggestion acceptance failed.',
      );
    } finally {
      setAiApplying(false);
    }
  };

  return (
    <div>
      {actionError && (
        <div className="mb-4 rounded-lg border border-red-700/50 bg-red-900/20 px-4 py-3 text-sm text-rose-300">
          {actionError}
        </div>
      )}

      {periodLocked ? (
        <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
          Period is locked. Bank statement row linking and document creation
          are read-only.
        </div>
      ) : null}

      {unprocessedCount > 0 && (
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-text-secondary">
            {selectedUnprocessedEntryIds.length} / {unprocessedCount} selected
            to link
          </div>
          <button
            type="button"
            onClick={openAiModal}
            disabled={periodLocked || selectedUnprocessedEntryIds.length === 0}
            className="flex items-center gap-2 bg-accent hover:bg-amber-700 disabled:bg-surface-3 disabled:text-text-muted text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Link to documents (AI)
          </button>
        </div>
      )}

      <div className="bg-surface-2/50 border border-border-subtle rounded-xl overflow-x-auto">
        <table className="w-full table-fixed">
          <thead>
            <tr className="border-b border-border-subtle">
              {unprocessedCount > 0 && (
                <th className="w-10 px-3 py-2">
                  <label className="inline-flex min-h-[32px] min-w-[32px] cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      checked={
                        unprocessedEntryIds.length > 0 &&
                        unprocessedEntryIds.every((id) => selectedEntries.has(id))
                      }
                      onChange={toggleAll}
                      className="rounded border-border-subtle bg-surface-0/60 text-accent focus:ring-accent/20"
                      aria-label="Valitse kaikki rowt"
                    />
                  </label>
                </th>
              )}
              <th className="text-left text-[10px] font-semibold text-text-muted uppercase tracking-[0.15em] px-3 py-2 w-24">
                Pvm
              </th>
              <th className="text-left text-[10px] font-semibold text-text-muted uppercase tracking-[0.15em] px-3 py-2">
                Vastapuoli / Viesti
              </th>
              <th className="text-right text-[10px] font-semibold text-text-muted uppercase tracking-[0.15em] px-3 py-2 w-28">
                Summa
              </th>
              <th className="text-right text-[10px] font-semibold text-text-muted uppercase tracking-[0.15em] px-3 py-2">
                Tosite
              </th>
            </tr>
          </thead>
          <tbody className="table-divide">
            {entries.map((entry) => {
              const currentDocumentId = getCurrentDocumentId(
                entry.id,
                entry.document_id,
              );
              const isProcessed = currentDocumentId != null;
              const description = [entry.message, entry.reference]
                .filter(Boolean)
                .join(' | ');

              return (
                <tr
                  key={entry.id}
                  className={`transition-colors ${isProcessed ? 'opacity-60' : 'hover:bg-surface-3/40'}`}
                >
                  {unprocessedCount > 0 && (
                    <td className="px-3 py-1.5">
                      {!isProcessed && (
                        <label className="inline-flex min-h-[32px] min-w-[32px] cursor-pointer items-center justify-center">
                          <input
                            type="checkbox"
                            checked={selectedEntries.has(entry.id)}
                            onChange={() => toggleEntry(entry.id)}
                            className="rounded border-border-subtle bg-surface-0/60 text-accent focus:ring-accent/20"
                            aria-label={`Valitse row: ${entry.counterparty || 'tiliotevienti'}`}
                          />
                        </label>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-1.5 text-xs text-text-secondary tabular-nums whitespace-nowrap">
                    {formatDate(entry.entry_date)}
                  </td>
                  <td className="px-3 py-1.5 min-w-0">
                    <div className="truncate text-xs text-text-primary">
                      {entry.counterparty}
                    </div>
                    {description && (
                      <div className="truncate text-[11px] text-text-muted">
                        {description}
                      </div>
                    )}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-xs text-right font-mono tabular-nums ${
                      entry.amount > 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {entry.amount > 0 ? '+' : ''}
                    {formatCurrency(entry.amount)}
                  </td>
                  <td className="px-3 py-1.5">
                    {isProcessed ? (
                      <div className="flex items-center gap-2 justify-end">
                        <Link
                          href={buildDocumentListHref(
                            currentDocumentId,
                            periodId,
                          )}
                          className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
                        >
                          <Check className="w-3 h-3" />#
                          {entry.document_number ?? currentDocumentId}
                        </Link>
                        <button
                          type="button"
                          onClick={() => void handleMarkUnprocessed(entry.id)}
                          disabled={periodLocked || linkingEntryId === entry.id}
                          className="inline-flex items-center gap-1 rounded border border-border-subtle bg-transparent px-2 py-1 text-xs text-text-secondary hover:bg-surface-3 hover:text-text-primary disabled:cursor-not-allowed disabled:text-text-muted"
                          aria-label="Remove receipt link"
                        >
                          {linkingEntryId === entry.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Unlink className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className="relative flex justify-end">
                        <button
                          type="button"
                          onClick={() => openDocumentPicker(entry.id)}
                          disabled={periodLocked}
                          className="inline-flex min-w-[110px] items-center justify-center rounded-md border border-border-subtle bg-surface-0/60 px-3 py-1 text-xs text-text-primary hover:bg-surface-0/80"
                        >
                          {currentDocumentId
                            ? `#${entry.document_number ?? currentDocumentId}`
                            : 'Attach document'}
                        </button>
                        {linkingEntryId === entry.id && (
                          <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-accent animate-spin" />
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {entries.length === 0 && (
          <div className="text-center py-8 text-text-muted text-sm">
            No transactions
          </div>
        )}
      </div>

      {documentPickerEntry && (
        <DocumentPickerModal
          entry={documentPickerEntry}
          periodId={periodId}
          documentSearch={documentSearch}
          onDocumentSearchChange={setDocumentSearch}
          filteredDocuments={filteredDocuments}
          documentCount={availableDocuments.length}
          modalSelectedDocumentId={modalSelectedDocumentId}
          onSelectDocument={setModalSelectedDocumentId}
          selectedDocument={selectedModalDocument}
          previewSrc={selectedModalPreviewSrc}
          linking={linkingEntryId === documentPickerEntry.id}
          onLink={handleLinkSelectedDocument}
          onClose={closeDocumentPicker}
        />
      )}

      {aiModalOpen && (
        <BankStatementAiLinkModal
          entries={entries}
          periodId={periodId}
          suggestions={aiSuggestions}
          loading={aiLoading}
          loadError={aiError}
          applying={aiApplying}
          selectedEntryIds={aiSelectedEntryIds}
          onToggleEntry={toggleAiSuggestion}
          onToggleAll={toggleAllAiSuggestions}
          onRefresh={() => void loadAiSuggestions()}
          onApply={() => void handleApplyAiSuggestions()}
          onClose={closeAiModal}
        />
      )}
    </div>
  );
}
