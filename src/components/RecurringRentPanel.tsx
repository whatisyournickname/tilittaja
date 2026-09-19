'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, FileText, Home, Loader2 } from 'lucide-react';
import { generateRecurringRentDocumentsAction } from '@/actions/app-actions';
import { formatCurrency, formatDate } from '@/lib/accounting';
import type {
  RecurringRentCreationResult,
  RecurringRentPlan,
} from '@/lib/recurring-rent';

interface RecurringRentPanelProps {
  periodId: number;
  periodLabel: string;
  periodLocked: boolean;
  plan: RecurringRentPlan;
}

export default function RecurringRentPanel({
  periodId,
  periodLabel,
  periodLocked,
  plan,
}: RecurringRentPanelProps) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<RecurringRentCreationResult | null>(null);

  async function handleCreate() {
    if (periodLocked) {
      setError('Period is locked. Unlock the period before creating rent documents.');
      return;
    }

    setIsCreating(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await generateRecurringRentDocumentsAction({ periodId });
      setSuccess(result);
      router.refresh();
    } catch (creationError) {
      setError(
        creationError instanceof Error
          ? creationError.message
          : 'Monthly rent document creation failed.',
      );
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[28px] border border-border-subtle bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_40%),linear-gradient(135deg,rgba(23,23,23,0.96),rgba(12,12,12,0.96))] p-6 shadow-[0_34px_120px_-58px_rgba(0,0,0,0.95)] md:p-8">
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200/70">
              Kuukausivuokrat
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">
              Kopioi tammikuun vuokrasopimustositteet koko vuodelle
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
              Tool finds entries linked to {plan.sourceMonthLabel} bank statement rows
              vuokrasopimus-tositteet, kopioi niiden viennit jokaiselle puuttuvalle
              for month and uses same PDF attachment as source document.
            </p>
          </div>

          <div className="grid gap-3 rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm sm:grid-cols-2">
            <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">
                Kohdekausi
              </div>
              <div className="mt-2 text-sm font-medium text-white">
                {periodLabel}
              </div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">
                Puuttuvat tositteet
              </div>
              <div className="mt-2 text-sm font-medium text-white">
                {plan.totalMissingDocuments}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <section className="rounded-[24px] border border-border-subtle bg-surface-2/70 p-6 shadow-[0_24px_90px_-54px_rgba(0,0,0,0.95)]">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent-light">
              <Home className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                Source documents
              </p>
              <h2 className="mt-2 text-xl font-semibold text-text-primary">
                Tunnistetut aktiiviset vuokrat
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                Jokainen row perustuu tammikuun pankkitapahtumaan, joka on jo
                liitetty vuokrasopimus-tositteeseen.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {plan.templates.length > 0 ? (
              plan.templates.map((template) => (
                <div
                  key={template.sourceDocumentId}
                  className="rounded-2xl border border-border-subtle bg-surface-0/35 p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-sm font-medium text-text-primary">
                        {template.name}
                      </div>
                      <div className="mt-1 text-xs text-text-secondary">
                        Source document #{template.sourceDocumentNumber} ·{' '}
                        {formatDate(template.sourceDocumentDate)}
                      </div>
                      <div className="mt-2 text-xs text-text-secondary">
                        Tammikuun maksut:{' '}
                        {template.januaryAmounts
                          .map((amount) => formatCurrency(amount))
                          .join(', ')}
                      </div>
                      {template.januaryCounterparties.length > 0 ? (
                        <div className="mt-1 text-xs text-text-secondary">
                          Maksajat: {template.januaryCounterparties.join(', ')}
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-xl border border-border-subtle bg-surface-0/45 px-3 py-2 text-right">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-text-muted">
                        Luodaan
                      </div>
                      <div className="mt-1 text-lg font-semibold text-text-primary">
                        {template.missingMonths.length}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {template.missingMonths.length > 0 ? (
                      template.missingMonths.map((month) => (
                        <span
                          key={`${template.sourceDocumentId}-${month.key}`}
                          className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-xs text-accent-light"
                        >
                          {month.label}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
                        All months already exist
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-border-subtle bg-surface-0/35 px-4 py-3 text-sm text-text-secondary">
                {plan.sourceMonthLabel} rent agreement documents not found,
                with incoming rent rows attached.
              </div>
            )}

            {error ? (
              <p className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                {error}
              </p>
            ) : null}

            {success ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  Vuokratositteet luotu
                </div>
                <p className="mt-2 leading-6">
                  Created {success.createdCount} new document(s) {success.templateCount}
                  from the rent template. Existing months were skipped{' '}
                  {success.skippedExistingCount}.
                </p>
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-[24px] border border-border-subtle bg-surface-2/70 p-6 shadow-[0_24px_90px_-54px_rgba(0,0,0,0.95)]">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-300">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                What happens
              </p>
              <h2 className="mt-2 text-xl font-semibold text-text-primary">
                Creation rules
              </h2>
            </div>
          </div>

          <div className="mt-6 space-y-3 text-sm leading-6 text-text-secondary">
            <p>
              Uses January incoming bank statement rows of selected period as source,
              jotka on jo liitetty `vuokrasopimus`-nimiseen tositteeseen.
            </p>
            <p>
              Each new month document gets the same entries, category and name
              and same PDF link as source document.
            </p>
            <p>
              If document already exists for this rent from some month, not
              luoda uudelleen.
            </p>
            <p>
              If end date found in rent agreement PDF path, copies not
              be made after that.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={
                isCreating ||
                periodLocked ||
                plan.templates.length === 0 ||
                plan.totalMissingDocuments === 0
              }
              className="inline-flex items-center gap-2 rounded-2xl bg-accent px-4 py-3 text-sm font-medium text-white transition hover:bg-accent-light hover:text-surface-0 disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-text-muted"
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Luodaan tositteita
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" />
                  Luo puuttuvat vuokratositteet
                </>
              )}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
