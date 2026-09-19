'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  FolderOpen,
  Loader2,
  Plus,
  Upload,
  X,
} from 'lucide-react';
import { useModalA11y } from '@/hooks/useModalA11y';
import type {
  BankStatementImportApiSuccess,
  SelectedPdfImportFile,
} from '@/lib/import-types';

interface BankAccountOption {
  id: number;
  number: string;
  name: string;
}

interface ImportOutcome {
  key: string;
  fileName: string;
  status: 'success' | 'error';
  statementId?: number;
  created?: number;
  skipped?: number;
  error?: string;
}

interface Props {
  bankAccounts: BankAccountOption[];
}

const folderInputProps = {
  directory: '',
  webkitdirectory: '',
} satisfies React.InputHTMLAttributes<HTMLInputElement>;

function isPdfFile(file: File): boolean {
  return (
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  );
}

function getFileLabel(file: File): string {
  return file.webkitRelativePath || file.name;
}

function createSelectedImportFile(file: File): SelectedPdfImportFile {
  const label = getFileLabel(file);
  return {
    key: `${label}:${file.size}:${file.lastModified}`,
    file,
    label,
  };
}

function mergeSelectedFiles(
  currentFiles: SelectedPdfImportFile[],
  nextFiles: File[],
): SelectedPdfImportFile[] {
  const merged = new Map(currentFiles.map((file) => [file.key, file]));

  nextFiles
    .filter(isPdfFile)
    .map(createSelectedImportFile)
    .forEach((file) => merged.set(file.key, file));

  return [...merged.values()].sort((a, b) =>
    a.label.localeCompare(b.label, 'fi'),
  );
}

function BankStatementImportModal({
  bankAccounts,
  onClose,
}: Props & { onClose: () => void }) {
  const router = useRouter();
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(
    bankAccounts[0]?.id ?? null,
  );
  const [selectedFiles, setSelectedFiles] = useState<SelectedPdfImportFile[]>([]);
  const [results, setResults] = useState<ImportOutcome[]>([]);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState('');
  const { containerRef, handleKeyDown } = useModalA11y(() => {
    if (!isImporting) onClose();
  });

  const selectedAccount = useMemo(
    () =>
      bankAccounts.find((account) => account.id === selectedAccountId) ?? null,
    [bankAccounts, selectedAccountId],
  );

  const successCount = results.filter(
    (result) => result.status === 'success',
  ).length;
  const errorCount = results.filter(
    (result) => result.status === 'error',
  ).length;

  const handleFileSelection = (files: FileList | null) => {
    if (!files) return;
    const nextFiles = [...files];
    const pdfFiles = nextFiles.filter(isPdfFile);

    setSelectedFiles((current) => mergeSelectedFiles(current, pdfFiles));
    setResults([]);
    setError(
      pdfFiles.length === 0
        ? 'No PDFs found in selected files.'
        : '',
    );
  };

  const removeSelectedFile = (key: string) => {
    setSelectedFiles((current) => current.filter((file) => file.key !== key));
    setResults((current) => current.filter((result) => result.key !== key));
  };

  const handleImport = async () => {
    if (selectedFiles.length === 0) {
      setError('Select PDFs or folder to import.');
      return;
    }

    if (selectedAccountId == null) {
      setError('Select a bank account.');
      return;
    }

    setIsImporting(true);
    setError('');
    setResults([]);
    setProgress({ completed: 0, total: selectedFiles.length });

    try {
      const nextResults: ImportOutcome[] = [];

      for (let index = 0; index < selectedFiles.length; index++) {
        const selectedFile = selectedFiles[index];
        const formData = new FormData();
        formData.append('file', selectedFile.file);
        formData.append('accountId', String(selectedAccountId));

        try {
          const response = await fetch('/api/bank-statements/import-pdf', {
            method: 'POST',
            body: formData,
          });
          const payload = (await response.json().catch(() => null)) as
            | ({ error?: string } & Partial<BankStatementImportApiSuccess>)
            | null;

          if (!response.ok || !payload?.id) {
            throw new Error(
              payload?.error || 'Bank statement PDF import failed.',
            );
          }

          nextResults.push({
            key: selectedFile.key,
            fileName: selectedFile.label,
            status: 'success',
            statementId: payload.id,
            created: payload.created,
            skipped: payload.skipped,
          });
        } catch (importError) {
          nextResults.push({
            key: selectedFile.key,
            fileName: selectedFile.label,
            status: 'error',
            error:
              importError instanceof Error
                ? importError.message
                : 'Bank statement PDF import failed.',
          });
        }

        setResults([...nextResults]);
        setProgress({ completed: index + 1, total: selectedFiles.length });
      }

      router.refresh();
      const successfulImports = nextResults.filter(
        (result) => result.status === 'success' && result.statementId,
      );
      const failedImports = nextResults.filter(
        (result) => result.status === 'error',
      );

      if (selectedFiles.length === 1 && successfulImports.length === 1) {
        router.push(`/bank-statements/${successfulImports[0].statementId}`);
        return;
      }

      if (failedImports.length > 0) {
        setError(
          `${failedImports.length} / ${selectedFiles.length} bank statement imports failed.`,
        );
      }
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : 'Bank statement PDF import failed.',
      );
      setIsImporting(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black/70 p-4 md:p-8"
      onClick={() => {
        if (!isImporting) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Import bank statement from PDF"
        className="mx-auto flex h-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-0"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-4 py-3">
          <div>
            <div className="text-sm font-medium text-text-primary">
              Import bank statement from PDF
            </div>
            <div className="mt-1 text-xs text-text-secondary">
              PDF is sent to GPT 5.4 mini with low reasoning and
              automatically converted into a bank statement.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isImporting}
            className="text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close bank statement import"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          <div className="rounded-xl border border-border-subtle bg-surface-2/40 p-4">
            <div className="mb-2 text-sm font-medium text-text-primary">
              Target bank account
            </div>
            <select
              value={selectedAccountId ?? ''}
              onChange={(event) =>
                setSelectedAccountId(Number(event.target.value))
              }
              className="w-full rounded-lg border border-border-subtle bg-surface-0/60 px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
              disabled={isImporting || bankAccounts.length === 0}
            >
              {bankAccounts.length === 0 ? (
                <option value="">No bank accounts</option>
              ) : null}
              {bankAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.number} {account.name}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-text-muted">
              Select the bookkeeping bank account to import the statement to.
            </p>
          </div>

          <div className="rounded-xl border border-dashed border-border-subtle bg-surface-2/20 p-5">
            <div className="mb-3 block text-sm font-medium text-text-primary">
              PDF files
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="rounded-lg border border-border-subtle bg-surface-0/50 px-4 py-3 text-sm text-text-secondary transition-colors hover:bg-surface-0/80">
                <div className="mb-2 flex items-center gap-2 font-medium text-text-primary">
                  <Upload className="h-4 w-4 text-accent-light" />
                  Select PDFs
                </div>
                <div className="text-xs text-text-muted">
                  You can select one or more PDFs at once.
                </div>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  disabled={isImporting}
                  onChange={(event) => handleFileSelection(event.target.files)}
                  className="sr-only"
                />
              </label>

              <label className="rounded-lg border border-border-subtle bg-surface-0/50 px-4 py-3 text-sm text-text-secondary transition-colors hover:bg-surface-0/80">
                <div className="mb-2 flex items-center gap-2 font-medium text-text-primary">
                  <FolderOpen className="h-4 w-4 text-accent-light" />
                  Select folder
                </div>
                <div className="text-xs text-text-muted">
                  All PDFs in folder will be queued for import.
                </div>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  disabled={isImporting}
                  onChange={(event) => handleFileSelection(event.target.files)}
                  className="sr-only"
                  {...folderInputProps}
                />
              </label>
            </div>
            <div className="mt-4 rounded-lg border border-border-subtle bg-surface-0/40 px-4 py-3">
              {selectedFiles.length > 0 ? (
                <div className="space-y-3">
                  <div className="text-sm text-text-primary">
                    {selectedFiles.length} PDF file(s) selected for import
                  </div>
                  <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                    {selectedFiles.map((selectedFile) => (
                      <div
                        key={selectedFile.key}
                        className="flex items-start justify-between gap-3 rounded-lg border border-border-subtle/70 bg-surface-2/30 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm text-text-primary">
                            <FileText className="h-4 w-4 shrink-0 text-accent-light" />
                            <span className="truncate">
                              {selectedFile.label}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-text-muted">
                            {(selectedFile.file.size / 1024).toFixed(1)} kB
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeSelectedFile(selectedFile.key)}
                          disabled={isImporting}
                          className="rounded p-1 text-text-muted transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={`Remove file ${selectedFile.label}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-text-muted">
                  Select bank statement PDFs or a folder to import.
                </div>
              )}
            </div>
          </div>

          {selectedAccount ? (
            <div className="rounded-xl border border-border-subtle bg-surface-2/30 p-4 text-sm text-text-secondary">
              A statement will be created for account{' '}
              <span className="font-medium text-text-primary">
                {selectedAccount.number} {selectedAccount.name}
              </span>
              . After import, one file opens directly, multiple files just refresh the list.
            </div>
          ) : null}

          {isImporting || progress.total > 0 ? (
            <div className="rounded-xl border border-border-subtle bg-surface-2/30 p-4">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-text-primary">Import progress</span>
                <span className="text-text-secondary">
                  {progress.completed} / {progress.total}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{
                    width:
                      progress.total > 0
                        ? `${(progress.completed / progress.total) * 100}%`
                        : '0%',
                  }}
                />
              </div>
            </div>
          ) : null}

          {results.length > 0 ? (
            <div className="rounded-xl border border-border-subtle bg-surface-2/30 p-4">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-medium text-text-primary">
                  Import results
                </span>
                <span className="text-emerald-300">
                  {successCount} succeeded
                </span>
                <span className="text-rose-300">{errorCount} failed</span>
              </div>
              <div className="mt-3 max-h-60 space-y-2 overflow-y-auto pr-1">
                {results.map((result) => (
                  <div
                    key={result.key}
                    className="rounded-lg border border-border-subtle/70 bg-surface-0/40 px-3 py-2"
                  >
                    <div className="flex items-start gap-2 text-sm">
                      {result.status === 'success' ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                      ) : (
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-text-primary">
                          {result.fileName}
                        </div>
                        {result.status === 'success' ? (
                          <div className="mt-1 text-xs text-text-secondary">
                            Statement #{result.statementId} created ·{' '}
                            {result.created ?? 0} rows imported
                            {(result.skipped ?? 0) > 0
                              ? ` · ${result.skipped} rows skipped`
                              : ''}
                          </div>
                        ) : (
                          <div className="mt-1 text-xs text-rose-300">
                            {result.error}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-red-700 bg-red-900/30 px-4 py-3 text-sm text-rose-300">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isImporting}
            className="rounded-lg border border-border-subtle px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleImport()}
            disabled={
              isImporting ||
              selectedFiles.length === 0 ||
              selectedAccountId == null
            }
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-text-muted"
          >
            {isImporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {isImporting ? 'Importing...' : 'Import statements'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BankStatementImportButton({ bankAccounts }: Props) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-amber-700"
      >
        <Plus className="h-3.5 w-3.5" />
        Add bank statement
      </button>

      {showModal ? (
        <BankStatementImportModal
          bankAccounts={bankAccounts}
          onClose={() => setShowModal(false)}
        />
      ) : null}
    </>
  );
}
