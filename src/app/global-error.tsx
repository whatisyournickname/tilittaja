'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fi">
      <body className="min-h-screen bg-surface-0 text-text-primary antialiased">
        <div className="flex min-h-screen items-center justify-center p-8">
          <div className="max-w-lg rounded-2xl border border-border-subtle bg-surface-2/70 p-6 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
              Vakava virhe
            </p>
            <h2 className="mt-3 text-xl font-semibold text-text-primary">
              Sovellus kaatui odottamatta
            </h2>
            <p className="mt-3 text-sm leading-6 text-text-secondary">
              {error.message || 'Try reloading the page.'}
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-light hover:text-surface-0"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
