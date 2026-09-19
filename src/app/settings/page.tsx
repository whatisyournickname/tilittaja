import Link from 'next/link';
import {
  ArrowUpRight,
  CalendarRange,
  Database,
  FileText,
  Lock,
  LockOpen,
} from 'lucide-react';
import { getSettings, getPeriods, runWithResolvedDb } from '@/lib/db';
import { periodLabel } from '@/lib/accounting';
import CompanyInfoEditor from '@/components/CompanyInfoEditor';
import PeriodLockToggle from '@/components/PeriodLockToggle';
import { type PageSearchParams } from '@/lib/page-params';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Settings – Ledgely' };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: PageSearchParams;
}) {
  const params = await searchParams;
  const { settings, periods } = await runWithResolvedDb(() => ({
    settings: getSettings(),
    periods: getPeriods(),
  }));
  const rawPeriod = Array.isArray(params.period)
    ? params.period[0]
    : params.period;
  const requestedPeriodId = rawPeriod ? Number(rawPeriod) : NaN;
  const activePeriodId = periods.some(
    (period) => period.id === requestedPeriodId,
  )
    ? requestedPeriodId
    : settings.current_period_id;
  const activePeriod =
    periods.find((period) => period.id === activePeriodId) ??
    periods[0] ??
    null;
  const lockedPeriods = periods.filter((period) => period.locked).length;
  const openPeriods = periods.length - lockedPeriods;

  return (
    <div className="p-5">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
              System
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-text-primary">
              Company settings
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">
              Manage your company's basic information and periods from one place.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/settings/opening-balance-import"
              className="inline-flex items-center gap-2 self-start rounded-xl border border-border-subtle bg-surface-0/60 px-4 py-2.5 text-sm font-medium text-text-primary transition hover:border-accent/30 hover:text-accent-light"
            >
              Opening balance
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <Link
              href="/settings/export-import"
              className="inline-flex items-center gap-2 self-start rounded-xl border border-border-subtle bg-surface-0/60 px-4 py-2.5 text-sm font-medium text-text-primary transition hover:border-accent/30 hover:text-accent-light"
            >
              Export & import
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <Link
              href="/reports/financial-statement"
              className="inline-flex items-center gap-2 self-start rounded-xl border border-accent/20 bg-accent/10 px-4 py-2.5 text-sm font-medium text-accent-light transition hover:border-accent/40 hover:bg-accent/15"
            >
              Open financial statements
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-border-subtle bg-surface-2/70 p-5 shadow-[0_24px_80px_-44px_rgba(0,0,0,0.9)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                  Active period
                </p>
                <p className="mt-2 text-sm font-medium text-text-primary">
                  {activePeriod
                    ? periodLabel(
                        activePeriod.start_date,
                        activePeriod.end_date,
                      )
                    : 'No period selected'}
                </p>
              </div>
              <CalendarRange className="mt-0.5 h-4 w-4 text-accent" />
            </div>
            <p className="mt-3 text-xs leading-5 text-text-secondary">
              The period selected from the sidebar determines which period is highlighted on this page.
            </p>
          </div>

          <div className="rounded-2xl border border-border-subtle bg-surface-2/70 p-5 shadow-[0_24px_80px_-44px_rgba(0,0,0,0.9)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                  Period status
                </p>
                <p className="mt-2 text-sm font-medium text-text-primary">
                  {openPeriods} open, {lockedPeriods} locked
                </p>
              </div>
              {lockedPeriods > 0 ? (
                <Lock className="mt-0.5 h-4 w-4 text-amber-400" />
              ) : (
                <LockOpen className="mt-0.5 h-4 w-4 text-emerald-400" />
              )}
            </div>
            <p className="mt-3 text-xs leading-5 text-text-secondary">
              Lock closed periods to prevent accidental changes to their entries.
            </p>
          </div>

          <div className="rounded-2xl border border-border-subtle bg-surface-2/70 p-5 shadow-[0_24px_80px_-44px_rgba(0,0,0,0.9)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                  Database
                </p>
                <p className="mt-2 text-sm font-medium text-text-primary">
                  Version {settings.version}
                </p>
              </div>
              <Database className="mt-0.5 h-4 w-4 text-text-secondary" />
            </div>
            <p className="mt-3 text-xs leading-5 text-text-secondary">
              Technical version info. You usually don't need to change this.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <section className="rounded-2xl border border-border-subtle bg-surface-2/60 p-6 shadow-[0_28px_90px_-54px_rgba(0,0,0,0.95)] backdrop-blur-sm">
            <CompanyInfoEditor
              name={settings.name}
              businessId={settings.business_id}
            />
          </section>

          <section className="rounded-2xl border border-border-subtle bg-surface-2/60 p-6 shadow-[0_28px_90px_-54px_rgba(0,0,0,0.95)] backdrop-blur-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                  Periods
                </p>
                <h2 className="mt-2 text-lg font-semibold text-text-primary">
                  Manage periods
                </h2>
                <p className="mt-1 text-sm leading-6 text-text-secondary">
                  The period selected from the sidebar is highlighted. You can lock or unlock periods directly from the list.
                </p>
              </div>
              <div className="rounded-xl border border-border-subtle bg-surface-0/50 px-3 py-2 text-right">
                <div className="text-[11px] uppercase tracking-[0.16em] text-text-muted">
                  Periods
                </div>
                <div className="mt-1 text-lg font-semibold text-text-primary">
                  {periods.length}
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {periods.map((period) => {
                const isCurrent = period.id === activePeriodId;

                return (
                  <div
                    key={period.id}
                    className={`rounded-2xl border px-4 py-4 transition ${
                      isCurrent
                        ? 'border-accent/30 bg-accent/10 shadow-[0_18px_40px_-28px_rgba(217,119,6,0.65)]'
                        : 'border-border-subtle bg-surface-0/35'
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-text-primary">
                            {periodLabel(period.start_date, period.end_date)}
                          </p>
                          {isCurrent ? (
                            <span className="rounded-full border border-accent/30 bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent-light">
                              Active
                            </span>
                          ) : null}
                          {period.locked ? (
                            <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                              Locked
                            </span>
                          ) : (
                            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                              Open
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-xs leading-5 text-text-secondary">
                          {period.locked
                            ? 'This period is protected from changes.'
                            : 'This period is open for entries and corrections.'}
                        </p>
                      </div>

                      <PeriodLockToggle
                        periodId={period.id}
                        locked={period.locked}
                        label={periodLabel(period.start_date, period.end_date)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-border-subtle bg-surface-2/55 p-6 shadow-[0_28px_90px_-54px_rgba(0,0,0,0.95)] backdrop-blur-sm">
          <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-border-subtle bg-surface-0/35 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                Opening tools
              </p>
              <h2 className="mt-2 text-lg font-semibold text-text-primary">
                Opening balance from financial statement PDF
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">
                Import previous period's financial statement PDF materials and automatically form opening balances for the selected period as an opening document.
              </p>
            </div>
            <Link
              href="/settings/opening-balance-import"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border-subtle bg-surface-0/60 px-4 py-2.5 text-sm font-medium text-text-primary transition hover:border-accent/30 hover:text-accent-light"
            >
              Open tool
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-border-subtle bg-surface-0/35 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                Recurring rent
              </p>
              <h2 className="mt-2 text-lg font-semibold text-text-primary">
                Monthly rent document copies
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">
                Generate missing monthly copies from the January rent contract document for the whole period, so AI linking finds prepared documents from the bank statement.
              </p>
            </div>
            <Link
              href="/settings/recurring-rent"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border-subtle bg-surface-0/60 px-4 py-2.5 text-sm font-medium text-text-primary transition hover:border-accent/30 hover:text-accent-light"
            >
              Open rent tool
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-border-subtle bg-surface-0/35 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                Backup
              </p>
              <h2 className="mt-2 text-lg font-semibold text-text-primary">
                Export & import
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">
                Export the entire active data source as a restorable ZIP package, or restore a previous export back to the same data source.
              </p>
            </div>
            <Link
              href="/settings/export-import"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border-subtle bg-surface-0/60 px-4 py-2.5 text-sm font-medium text-text-primary transition hover:border-accent/30 hover:text-accent-light"
            >
              Open export & restore
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent-light">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  Financial statements & annual meeting
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">
                  Micro enterprise declaration, board proposal, signatures, and meeting details are edited on the financial statements report.
                </p>
              </div>
            </div>

            <Link
              href="/reports/financial-statement"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border-subtle bg-surface-0/60 px-4 py-2.5 text-sm font-medium text-text-primary transition hover:border-accent/30 hover:text-accent-light"
            >
              Go to edit
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
