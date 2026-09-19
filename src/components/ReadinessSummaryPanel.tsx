'use client';

import { useEffect, useState } from 'react';
import type { ReadinessSummary } from '@/lib/financial-statement';
import { setPeriodLockAction } from '@/actions/app-actions';

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 mt-[5px] ${
        ok ? 'bg-emerald-400' : 'bg-amber-400'
      }`}
    />
  );
}

function CountBadge({ count, total }: { count: number; total?: number }) {
  if (total !== undefined) {
    return (
      <span className="shrink-0 whitespace-nowrap text-right text-xs font-mono text-text-secondary tabular-nums">
        {count}/{total}
      </span>
    );
  }
  return (
    <span className="shrink-0 whitespace-nowrap text-right text-xs font-mono text-text-secondary tabular-nums">
      {count}
    </span>
  );
}

function SummaryText({
  periodLocked,
  allOk,
  blockerCount,
}: {
  periodLocked: boolean;
  allOk: boolean;
  blockerCount: number;
}) {
  if (periodLocked) {
    return <span className="text-yellow-400">Period is locked</span>;
  }
  if (allOk) {
    return (
      <span className="text-emerald-300">All checks passed</span>
    );
  }
  return (
    <span className="text-text-secondary">{blockerCount} issues</span>
  );
}

export default function ReadinessSummaryPanel({
  summary,
  periodId,
  periodLocked,
}: {
  summary: ReadinessSummary;
  periodId: number;
  periodLocked: boolean;
}) {
  const [locking, setLocking] = useState(false);
  const [isLocked, setIsLocked] = useState(periodLocked);

  useEffect(() => {
    setIsLocked(periodLocked);
  }, [periodLocked]);

  async function handleLock() {
    if (
      !confirm(
        'Do you want to lock the fiscal year? A locked fiscal year is read-only. You can unlock it later from settings.',
      )
    ) {
      return;
    }
    setLocking(true);
    try {
      await setPeriodLockAction(periodId, true);
      setIsLocked(true);
    } finally {
      setLocking(false);
    }
  }

  const allOk = summary.sections.every((s) => s.allOk);

  return (
    <details className="group bg-surface-2/50 border border-border-subtle rounded-xl overflow-hidden">
      <summary className="list-none cursor-pointer select-none px-6 py-4 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Kirjanpidon valmius
            </h2>
            <p className="mt-1 text-sm">
              <SummaryText
                periodLocked={isLocked}
                allOk={allOk}
                blockerCount={summary.blockerCount}
              />
            </p>
          </div>
          <span className="text-xs font-medium text-text-secondary group-open:hidden">
            Avaa
          </span>
          <span className="hidden text-xs font-medium text-text-secondary group-open:inline">
            Sulje
          </span>
        </div>
      </summary>

      <div className="border-t border-border-subtle">
        <div className="px-6 py-4 flex items-center justify-between border-b border-border-subtle/50">
          {isLocked ? (
            <span className="flex items-center gap-2 text-sm text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-3 py-1.5 rounded-lg">
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                  clipRule="evenodd"
                />
              </svg>
              Period is locked — unlock in settings
            </span>
          ) : (
            <>
              <p className="text-sm text-text-secondary">
                {summary.canLock
                  ? 'Period can be locked.'
                  : 'Unbalanced documents — fiscal year cannot be locked yet.'}
              </p>
              <button
                onClick={handleLock}
                disabled={locking || !summary.canLock}
                className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-accent/90 hover:bg-accent text-white shrink-0"
                title={
                  !summary.canLock
                    ? 'Unbalanced documents — cannot lock'
                    : 'Lock period'
                }
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                    clipRule="evenodd"
                  />
                </svg>
                {locking ? 'Locking...' : 'Lock period'}
              </button>
            </>
          )}
        </div>

        <div className="divide-y divide-border-subtle/50">
          {summary.sections.map((section) => (
            <div key={section.title} className="px-6 py-4">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold text-text-primary">
                  {section.title}
                </h3>
                {section.allOk && (
                  <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                    OK
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {section.items.map((item) => (
                  <div key={item.label} className="flex items-start gap-2">
                    <StatusDot ok={item.ok} />
                    <div className="flex-1 min-w-0">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                        <span className="text-sm text-text-primary truncate">
                          {item.label}
                        </span>
                        {item.count !== undefined && (
                          <CountBadge count={item.count} total={item.total} />
                        )}
                      </div>
                      <p className="text-xs text-text-secondary mt-0.5">
                        {item.details}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
