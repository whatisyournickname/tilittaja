'use client';

import { useRef, useState } from 'react';
import {
  Database,
  FolderOpen,
  ArrowRight,
  Loader2,
  AlertCircle,
  Archive,
} from 'lucide-react';
import {
  setupCreateNewDatabaseAction,
  setupImportArchiveAction,
  setupLinkExternalDatabaseAction,
} from '@/actions/app-actions';

type Mode = 'choose' | 'new' | 'external' | 'import';

export default function SetupWizard() {
  const [mode, setMode] = useState<Mode>('choose');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState('');
  const [businessId, setBusinessId] = useState('');
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear());

  const [filePath, setFilePath] = useState('');
  const [externalName, setExternalName] = useState('');

  const [zipFile, setZipFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleCreateNew(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await setupCreateNewDatabaseAction({
        companyName,
        businessId: businessId || undefined,
        periodYear,
      });
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLoading(false);
    }
  }

  async function handleLinkExternal(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await setupLinkExternalDatabaseAction({
        filePath,
        name: externalName || undefined,
      });
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLoading(false);
    }
  }

  async function handleImportZip(e: React.FormEvent) {
    e.preventDefault();
    if (!zipFile) return;
    setError(null);
    setLoading(true);

    try {
      await setupImportArchiveAction(zipFile);
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLoading(false);
    }
  }

  function goBack() {
    setMode('choose');
    setError(null);
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-lg">
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Ledgely
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Welcome! Start by choosing a database.
          </p>
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {mode === 'choose' && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setMode('new')}
              className="card-panel group flex w-full items-center gap-4 p-5 text-left transition-all hover:border-accent/40 hover:shadow-lg hover:shadow-amber-900/10"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent transition-colors group-hover:bg-accent/25">
                <Database className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-text-primary">
                  Create new database
                </div>
                <div className="mt-0.5 text-xs text-text-muted">
                  Start with empty bookkeeping using ready-made chart of accounts
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-text-muted transition-colors group-hover:text-accent" />
            </button>

            <button
              type="button"
              onClick={() => setMode('import')}
              className="card-panel group flex w-full items-center gap-4 p-5 text-left transition-all hover:border-accent/40 hover:shadow-lg hover:shadow-amber-900/10"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-text-secondary transition-colors group-hover:text-accent">
                <Archive className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-text-primary">
                  Import archive
                </div>
                <div className="mt-0.5 text-xs text-text-muted">
                  Restore bookkeeping from previously exported ZIP package
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-text-muted transition-colors group-hover:text-accent" />
            </button>

            <button
              type="button"
              onClick={() => setMode('external')}
              className="card-panel group flex w-full items-center gap-4 p-5 text-left transition-all hover:border-accent/40 hover:shadow-lg hover:shadow-amber-900/10"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-text-secondary transition-colors group-hover:text-accent">
                <FolderOpen className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-text-primary">
                  Use existing database
                </div>
                <div className="mt-0.5 text-xs text-text-muted">
                  Provide SQLite file path
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-text-muted transition-colors group-hover:text-accent" />
            </button>
          </div>
        )}

        {mode === 'new' && (
          <form onSubmit={handleCreateNew} className="card-panel p-6">
            <h2 className="mb-5 text-base font-semibold text-text-primary">
              New bookkeeping
            </h2>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="companyName"
                  className="mb-1.5 block text-xs font-medium text-text-secondary"
                >
                  Company name
                </label>
                <input
                  id="companyName"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Acme Ltd"
                  className="input-field"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label
                  htmlFor="businessId"
                  className="mb-1.5 block text-xs font-medium text-text-secondary"
                >
                  Business ID
                  <span className="ml-1 text-text-muted">(optional)</span>
                </label>
                <input
                  id="businessId"
                  type="text"
                  value={businessId}
                  onChange={(e) => setBusinessId(e.target.value)}
                  placeholder="1234567-8"
                  className="input-field"
                />
              </div>

              <div>
                <label
                  htmlFor="periodYear"
                  className="mb-1.5 block text-xs font-medium text-text-secondary"
                >
                  First fiscal year
                </label>
                <input
                  id="periodYear"
                  type="number"
                  value={periodYear}
                  onChange={(e) => setPeriodYear(Number(e.target.value))}
                  min={2000}
                  max={2099}
                  className="input-field"
                  required
                />
                <p className="mt-1 text-[11px] text-text-muted">
                  Period 1 Jan–31 Dec {periodYear}
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={goBack}
                className="text-xs font-medium text-text-muted transition-colors hover:text-text-secondary"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading || !companyName.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-surface-0 shadow-md shadow-amber-900/20 transition-all hover:bg-accent-light disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                Create database
              </button>
            </div>
          </form>
        )}

        {mode === 'import' && (
          <form onSubmit={handleImportZip} className="card-panel p-6">
            <h2 className="mb-5 text-base font-semibold text-text-primary">
              Import archive
            </h2>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-text-secondary">
                  ZIP file
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,application/zip"
                  onChange={(e) => setZipFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="input-field flex items-center gap-2 text-left"
                >
                  <Archive className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                  <span
                    className={
                      zipFile ? 'text-text-primary' : 'text-text-muted'
                    }
                  >
                    {zipFile ? zipFile.name : 'Select file…'}
                  </span>
                </button>
                <p className="mt-1 text-[11px] text-text-muted">
                  Package created with Settings → Export & import → Export
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={goBack}
                className="text-xs font-medium text-text-muted transition-colors hover:text-text-secondary"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading || !zipFile}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-surface-0 shadow-md shadow-amber-900/20 transition-all hover:bg-accent-light disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                Restore
              </button>
            </div>
          </form>
        )}

        {mode === 'external' && (
          <form onSubmit={handleLinkExternal} className="card-panel p-6">
            <h2 className="mb-5 text-base font-semibold text-text-primary">
              Existing database
            </h2>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="filePath"
                  className="mb-1.5 block text-xs font-medium text-text-secondary"
                >
                  File path
                </label>
                <input
                  id="filePath"
                  type="text"
                  value={filePath}
                  onChange={(e) => setFilePath(e.target.value)}
                  placeholder="/path/to/bookkeeping.sqlite"
                  className="input-field font-mono"
                  required
                  autoFocus
                />
                <p className="mt-1 text-[11px] text-text-muted">
                  The file is copied to the app data folder
                </p>
              </div>

              <div>
                <label
                  htmlFor="externalName"
                  className="mb-1.5 block text-xs font-medium text-text-secondary"
                >
                  Name
                  <span className="ml-1 text-text-muted">(optional)</span>
                </label>
                <input
                  id="externalName"
                  type="text"
                  value={externalName}
                  onChange={(e) => setExternalName(e.target.value)}
                  placeholder="e.g. Acme Ltd"
                  className="input-field"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={goBack}
                className="text-xs font-medium text-text-muted transition-colors hover:text-text-secondary"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading || !filePath.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-surface-0 shadow-md shadow-amber-900/20 transition-all hover:bg-accent-light disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                Import database
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
