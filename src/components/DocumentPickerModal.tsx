'use client';

import Link from 'next/link';
import { FileText, Link2, Loader2, X } from 'lucide-react';
import { useModalA11y } from '@/hooks/useModalA11y';
import { formatCurrency, formatDate } from '@/lib/accounting';
import { buildDocumentListHref } from '@/lib/document-links';
import type { ReceiptSource } from '@/lib/receipt-pdfs';
import SearchInput from '@/components/SearchInput';

export interface DocumentOption {
  id: number;
  number: number;
  date: number;
  description: string;
  receiptPath: string | null;
  receiptSource: ReceiptSource;
}

interface PickerEntry {
  entry_date: number;
  counterparty: string;
  amount: number;
}

interface DocumentPickerModalProps {
  entry: PickerEntry;
  periodId: number;
  documentSearch: string;
  onDocumentSearchChange: (value: string) => void;
  filteredDocuments: DocumentOption[];
  documentCount: number;
  modalSelectedDocumentId: number | null;
  onSelectDocument: (id: number) => void;
  selectedDocument: DocumentOption | null;
  previewSrc: string | null;
  linking: boolean;
  onLink: () => void;
  onClose: () => void;
}

export default function DocumentPickerModal({
  entry,
  periodId,
  documentSearch,
  onDocumentSearchChange,
  filteredDocuments,
  documentCount,
  modalSelectedDocumentId,
  onSelectDocument,
  selectedDocument,
  previewSrc,
  linking,
  onLink,
  onClose,
}: DocumentPickerModalProps) {
  const { containerRef, handleKeyDown } = useModalA11y(onClose);

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
        aria-label="Link transaction to existing document"
        className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-0"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-4 py-3">
          <div>
            <div className="text-sm font-medium text-text-primary">
              Link transaction to existing document
            </div>
            <div className="mt-1 text-xs text-text-secondary">
              {formatDate(entry.entry_date)} · {entry.counterparty} ·{' '}
              {formatCurrency(entry.amount)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary"
            aria-label="Sulje tositteen valinta"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[26rem_minmax(0,1fr)]">
          <div className="border-b border-border-subtle p-4 xl:border-b-0 xl:border-r">
            <SearchInput
              value={documentSearch}
              onChange={onDocumentSearchChange}
              placeholder="Hae tositetta numerolla, paivalla tai kuvauksella..."
              className="mb-3"
            />

            <div className="h-96 overflow-y-auto rounded-lg border border-border-subtle/60 bg-surface-1/50">
              {filteredDocuments.length > 0 ? (
                <div className="divide-y divide-border-subtle">
                  {filteredDocuments.map((document) => {
                    const isSelected = document.id === modalSelectedDocumentId;
                    return (
                      <button
                        key={document.id}
                        type="button"
                        onClick={() => onSelectDocument(document.id)}
                        className={`block w-full px-3 py-2 text-left transition-colors ${
                          isSelected
                            ? 'bg-accent/15 text-blue-100'
                            : 'text-text-secondary hover:bg-surface-3/70'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              Tosite #{document.number}
                            </div>
                            <div className="truncate text-xs text-text-secondary">
                              {formatDate(document.date)}
                              {document.description
                                ? ` · ${document.description}`
                                : ''}
                            </div>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                              document.receiptSource === 'manual'
                                ? 'bg-accent-muted text-accent-light'
                                : document.receiptSource === 'automatic'
                                  ? 'bg-emerald-500/10 text-emerald-300'
                                  : 'bg-surface-3/80 text-text-secondary'
                            }`}
                          >
                            {document.receiptSource === 'manual'
                              ? 'Valittu kasin'
                              : document.receiptSource === 'automatic'
                                ? 'Automatic PDF'
                                : 'Ei PDF:aa'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center px-4 text-center text-sm text-text-muted">
                  Hakuehdolla ei loytynyt tositteita.
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="text-xs text-text-muted">
                {filteredDocuments.length} / {documentCount} tositetta
              </div>
              <button
                type="button"
                disabled={modalSelectedDocumentId == null || linking}
                onClick={() => void onLink()}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-text-muted"
              >
                {linking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                Link selected document
              </button>
            </div>
          </div>

          <div className="min-h-0 bg-surface-2/40 p-4">
            <div className="flex h-full min-h-0 flex-col">
              {selectedDocument ? (
                <>
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-medium text-text-primary">
                        Tosite #{selectedDocument.number}
                      </h3>
                      <div className="mt-1 text-xs text-text-secondary">
                        {formatDate(selectedDocument.date)}
                      </div>
                      {selectedDocument.description && (
                        <p className="mt-2 text-sm text-text-secondary">
                          {selectedDocument.description}
                        </p>
                      )}
                    </div>
                    <Link
                      href={buildDocumentListHref(
                        selectedDocument.id,
                        periodId,
                      )}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-xs text-accent-light hover:text-accent-light"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Avaa tosite
                    </Link>
                  </div>

                  {previewSrc ? (
                    <iframe
                      title={`Tosite ${selectedDocument.number} PDF`}
                      src={previewSrc}
                      className="h-full min-h-96 w-full rounded-lg border border-border-subtle bg-white"
                    />
                  ) : (
                    <div className="flex h-full min-h-96 items-center justify-center rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-6 text-center text-sm text-yellow-100">
                      Valitulle tositteelle ei loydy PDF-liitetta esikatseluun.
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-full min-h-96 items-center justify-center rounded-lg border border-border-subtle bg-surface-0 text-sm text-text-muted">
                  Valitse listasta tosite esikatseltavaksi.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
