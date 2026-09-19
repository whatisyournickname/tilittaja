import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { Metadata } from 'next';
import RecurringRentPanel from '@/components/RecurringRentPanel';
import { periodLabel } from '@/lib/accounting';
import { getPeriods, getSettings, runWithResolvedDb } from '@/lib/db';
import { type PageSearchParams, resolvePeriodId } from '@/lib/page-params';
import { getRecurringRentPlan } from '@/lib/recurring-rent';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Kuukausivuokrat – Tilittaja',
};

export default async function RecurringRentPage({
  searchParams,
}: {
  searchParams: PageSearchParams;
}) {
  const params = await searchParams;
  const { settings, periods } = await runWithResolvedDb(() => ({
    settings: getSettings(),
    periods: getPeriods(),
  }));

  const periodId = resolvePeriodId(params, periods, settings.current_period_id);
  const period = periods.find((candidate) => candidate.id === periodId) ?? periods[0];

  if (!period) {
    return (
      <div className="p-5">
        <div className="mx-auto max-w-5xl rounded-2xl border border-border-subtle bg-surface-2/60 p-6 text-sm text-text-secondary">
          No fiscal years found.
        </div>
      </div>
    );
  }

  const plan = await runWithResolvedDb(() => getRecurringRentPlan(period.id));

  return (
    <div className="p-5">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
              System
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-text-primary">
              Kuukausivuokrat
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">
              Luo tammikuun vuokrasopimuksista puuttuvat kuukausitositteet
              valitulle kaudelle.
            </p>
          </div>

          <Link
            href="/settings"
            className="inline-flex items-center gap-2 self-start rounded-xl border border-border-subtle bg-surface-0/60 px-4 py-2.5 text-sm font-medium text-text-primary transition hover:border-accent/30 hover:text-accent-light"
          >
            Takaisin asetuksiin
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>

        <RecurringRentPanel
          periodId={period.id}
          periodLabel={periodLabel(period.start_date, period.end_date)}
          periodLocked={period.locked}
          plan={plan}
        />
      </div>
    </div>
  );
}
