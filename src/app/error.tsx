'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-8">
      <div className="max-w-lg rounded-2xl border border-border-subtle bg-surface-2/70 p-6 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
          Virhetilanne
        </p>
        <h2 className="mt-3 text-xl font-semibold text-text-primary">
          Failed to load page
        </h2>
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          {error.message ||
            'Something went wrong. Try reloading the view.'}
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
  );
}
