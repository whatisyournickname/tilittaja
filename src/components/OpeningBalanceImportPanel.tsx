'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Sparkles,
  Upload,
} from 'lucide-react';
import type { OpeningBalanceImportApiSuccess } from '@/lib/import-types';

interface OpeningBalanceImportPanelProps {
  periodId: number;
  periodLabel: string;
  periodLocked: boolean;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

export default function OpeningBalanceImportPanel({
  periodId,
  periodLabel,
  periodLocked,
}: OpeningBalanceImportPanelProps) {
  const router = useRouter();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<OpeningBalanceImportApiSuccess | null>(
    null,
  );

  const selectedSummary = useMemo(() => {
    if (selectedFiles.length === 0) return null;
    const totalBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    return `${selectedFiles.length}  PDFs, total  ${formatBytes(totalBytes)}`;
  }, [selectedFiles]);

  async function handleImport() {
    if (periodLocked) {
      setError('Period is locked. Unlock period before importing opening balances.');
      return;
    }

    if (selectedFiles.length === 0) {
      setError('Select at least one PDF file.');
      return;
    }

    if (selectedFiles.length > 10) {
      setError('You can upload max 10 PDF files.');
      return;
    }

    setIsImporting(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append('periodId', String(periodId));
      selectedFiles.forEach((file) => formData.append('files', file));

      const response = await fetch('/api/opening-balance/import-pdf', {
        method: 'POST',
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as
        | ({ error?: string } & Partial<OpeningBalanceImportApiSuccess>)
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Opening balance import failed.');
      }

      setSuccess(payload as OpeningBalanceImportApiSuccess);
      setSelectedFiles([]);
      router.refresh();
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : 'Opening balance import failed.',
      );
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[28px] border border-border-subtle bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_40%),linear-gradient(135deg,rgba(23,23,23,0.96),rgba(12,12,12,0.96))] p-6 shadow-[0_34px_120px_-58px_rgba(0,0,0,0.95)] md:p-8">
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200/70">
              Opening balance
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">
              Create opening balances from financial statement materials
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
              The tool reads 1-10 PDF files from previous period financial statements, extracts ending balance sheet account balances using GPT, and creates a single opening document at the start of the selected period.
            </p>
          </div>

          <div className="grid gap-3 rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm sm:grid-cols-2">
            <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">
                Target period
              </div>
              <div className="mt-2 text-sm font-medium text-white">
                {periodLabel}
              </div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">
                Status
              </div>
              <div className="mt-2 text-sm font-medium text-white">
                {periodLocked ? 'Locked' : 'Open'}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <section className="rounded-[24px] border border-border-subtle bg-surface-2/70 p-6 shadow-[0_24px_90px_-54px_rgba(0,0,0,0.95)]">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent-light">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                Materials
              </p>
              <h2 className="mt-2 text-xl font-semibold text-text-primary">
                Select financial statement PDFs
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                Recommended files include balance sheet, detailed balance sheet, general ledger, journal, and other financial statement materials. The more complete the materials, the more reliable the opening balance will be.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <label className="block text-xs font-medium uppercase tracking-[0.16em] text-text-muted">
              <span className="mb-2 block">PDF files (1-10)</span>
              <input
                type="file"
                multiple
                accept="application/pdf,.pdf"
                disabled={isImporting || periodLocked}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []).slice(0, 10);
                  setSelectedFiles(files);
                  setError(null);
                  setSuccess(null);
                }}
                className="block w-full rounded-2xl border border-border-subtle bg-surface-0/50 px-4 py-3 text-sm text-text-secondary file:mr-4 file:rounded-xl file:border-0 file:bg-accent/12 file:px-3 file:py-2 file:text-sm file:font-medium file:text-accent-light"
              />
            </label>

            <div className="rounded-2xl border border-border-subtle bg-surface-0/35 px-4 py-3 text-sm text-text-secondary">
              {selectedSummary ?? 'No files selected.'}
            </div>

            {selectedFiles.length > 0 ? (
              <div className="rounded-2xl border border-border-subtle bg-surface-0/35 p-4">
                <div className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-text-muted">
                  Selected files
                </div>
                <div className="space-y-2">
                  {selectedFiles.map((file) => (
                    <div
                      key={`${file.name}-${file.size}`}
                      className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-0/45 px-3 py-2 text-sm text-text-primary"
                    >
                      <FileText className="h-4 w-4 text-accent-light" />
                      <span className="truncate">{file.name}</span>
                      <span className="ml-auto shrink-0 text-xs text-text-muted">
                        {formatBytes(file.size)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {error ? (
              <p className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                {error}
              </p>
            ) : null}

            {success ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  Opening balance import successful
                </div>
                <p className="mt-2 leading-6">
                  Document #{success.documentNumber} created for period {periodLabel}.
                  Accounts imported: {success.importedAccounts}, entries:{' '}
                  {success.createdEntries}, new accounts: {success.createdAccounts}.
                  Source period end date: {success.previousPeriodEnd}.
                </p>
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={isImporting || selectedFiles.length === 0 || periodLocked}
              className="inline-flex items-center gap-2 rounded-2xl bg-accent px-4 py-3 text-sm font-medium text-white transition hover:bg-accent-light hover:text-surface-0 disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-text-muted"
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating opening balance
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Create opening balance
                </>
              )}
            </button>
          </div>
        </section>

        <section className="rounded-[24px] border border-border-subtle bg-surface-2/70 p-6 shadow-[0_24px_90px_-54px_rgba(0,0,0,0.95)]">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-300">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                Note
              </p>
              <h2 className="mt-2 text-xl font-semibold text-text-primary">
                What the tool does
              </h2>
            </div>
          </div>

          <div className="mt-6 space-y-3 text-sm leading-6 text-text-secondary">
            <p>
              PDF materials are sent to the OpenAI API, which extracts per-account ending balances.
            </p>
            <p>
              The import automatically creates missing balance sheet accounts if the materials contain accounts not yet in the current chart of accounts.
            </p>
            <p>
              If the balances extracted from materials do not match at the debit/credit level, the import is aborted and no opening document is created.
            </p>
            <p>
              The tool won't run a second opening balance import for a period that already has a document with the `OPENING_BALANCE` category.
            </p>
          </div>

          {periodLocked ? (
            <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/8 p-4 text-sm leading-6 text-amber-100/90">
              Selected period is locked. Unlock period in settings before importing.
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
