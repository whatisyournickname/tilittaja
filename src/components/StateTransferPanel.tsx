'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Database,
  Download,
  Loader2,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { importStateTransferAction } from '@/actions/app-actions';
import type { StateTransferImportSuccess } from '@/lib/import-types';

interface StateTransferPanelProps {
  sourceSlug: string;
  sourceName: string;
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

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('fi-FI');
}

export default function StateTransferPanel({
  sourceSlug,
  sourceName,
}: StateTransferPanelProps) {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<StateTransferImportSuccess | null>(null);

  const selectedFileLabel = useMemo(() => {
    if (!selectedFile) return null;
    return `${selectedFile.name} (${formatBytes(selectedFile.size)})`;
  }, [selectedFile]);

  async function handleImport() {
    if (!selectedFile) {
      setError('Select an export ZIP file first.');
      return;
    }

    const confirmed = window.confirm(
      `Restore data source ${sourceName} from ZIP? Current state will be completely overwritten.`,
    );
    if (!confirmed) return;

    setImporting(true);
    setError(null);
    setSuccess(null);

    try {
      const data = await importStateTransferAction(selectedFile);
      setSuccess(data);
      setSelectedFile(null);
      router.refresh();
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : 'Import failed',
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[28px] border border-border-subtle bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_40%),linear-gradient(135deg,rgba(23,23,23,0.96),rgba(12,12,12,0.96))] p-6 shadow-[0_34px_120px_-58px_rgba(0,0,0,0.95)] md:p-8">
        <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[linear-gradient(135deg,transparent,rgba(245,158,11,0.08))] lg:block" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200/70">
              Import & Export
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">
              Full accounting backup, fully restorable
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
              Export bundles the active data source into a single ZIP package:
              SQLite database, document PDFs, bank statements, and other materials.
              Import restores that same package back and replaces the current state
              entirely.
            </p>
          </div>

          <div className="grid gap-3 rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm sm:grid-cols-2">
            <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">
                Data source
              </div>
              <div className="mt-2 text-sm font-medium text-white">
                {sourceName}
              </div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">
                Slug
              </div>
              <div className="mt-2 text-sm font-medium text-white">
                {sourceSlug}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section className="rounded-[24px] border border-border-subtle bg-surface-2/70 p-6 shadow-[0_24px_90px_-54px_rgba(0,0,0,0.95)]">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
              <Download className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                Export state
              </p>
              <h2 className="mt-2 text-xl font-semibold text-text-primary">
                Download a restorable export
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
                The package includes a consistent database snapshot and the
                active data source files. Intended for transfer,
                backup, and full state restoration.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border-subtle bg-surface-0/40 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <Database className="h-4 w-4 text-accent" />
                SQL and application state
              </div>
              <p className="mt-2 text-xs leading-5 text-text-secondary">
                SQLite database exported as consistent snapshot, so restoration
                does not depend on an open WAL state.
              </p>
            </div>
            <div className="rounded-2xl border border-border-subtle bg-surface-0/40 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <RefreshCw className="h-4 w-4 text-accent" />
                Source materials included
              </div>
              <p className="mt-2 text-xs leading-5 text-text-secondary">
                Documents, bank statements, and other files from the active data
                source travel in the same ZIP.
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a
              href="/api/state-transfer/export"
              className="inline-flex items-center gap-2 rounded-2xl bg-accent px-4 py-3 text-sm font-medium text-white transition hover:bg-accent-light hover:text-surface-0"
            >
              <Download className="h-4 w-4" />
              Download export ZIP
            </a>
            <span className="text-xs leading-5 text-text-muted">
              Recommendation: take a fresh export before major changes or
              before testing import.
            </span>
          </div>
        </section>

        <section className="rounded-[24px] border border-border-subtle bg-surface-2/70 p-6 shadow-[0_24px_90px_-54px_rgba(0,0,0,0.95)]">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-300">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                Restore state
              </p>
              <h2 className="mt-2 text-xl font-semibold text-text-primary">
                Import a previous export
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
                Import overwrites the entire active data source. Use only a ZIP
                produced from this page that belongs to this data source.
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/8 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <p className="text-sm leading-6 text-amber-100/90">
                The current database and files will be replaced entirely.
                Take a fresh export first if you want a rollback point before restoring.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <label className="block text-xs font-medium uppercase tracking-[0.16em] text-text-muted">
              <span className="mb-2 block">
                Select ZIP package
              </span>
              <input
                type="file"
                accept=".zip,application/zip"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setSelectedFile(file);
                  setError(null);
                  setSuccess(null);
                }}
                className="block w-full rounded-2xl border border-border-subtle bg-surface-0/50 px-4 py-3 text-sm text-text-secondary file:mr-4 file:rounded-xl file:border-0 file:bg-accent/12 file:px-3 file:py-2 file:text-sm file:font-medium file:text-accent-light"
              />
            </label>

            <div className="rounded-2xl border border-border-subtle bg-surface-0/35 px-4 py-3 text-sm text-text-secondary">
              {selectedFileLabel ?? 'No file selected.'}
            </div>

            {error ? (
              <p className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                {error}
              </p>
            ) : null}

            {success ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  Restore successful
                </div>
                <p className="mt-2 leading-6">
                  {success.manifest.sourceName} was restored from a package created on
                  {formatDateTime(success.manifest.createdAt)}. Files in package: {success.fileCount}.
                </p>
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleImport}
              disabled={importing || !selectedFile}
              className="inline-flex items-center gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/12 px-4 py-3 text-sm font-medium text-amber-200 transition hover:bg-amber-500/18 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Restoring
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Restore from export
                </>
              )}
            </button>
            <a
              href="/settings"
              className="inline-flex items-center gap-2 rounded-2xl border border-border-subtle bg-surface-0/50 px-4 py-3 text-sm font-medium text-text-primary transition hover:border-accent/30 hover:text-accent-light"
            >
              Back to settings
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
