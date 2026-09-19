import {
  getPeriod,
  getPeriods,
  getSettings,
  requireCurrentDataSource,
  runWithResolvedDb,
} from '@/lib/db';
import {
  buildReadinessSummary,
  buildTilinpaatosPackage,
  getBalanceSheetSummary,
  getIncomeStatementSummary,
  signatureDateAsFi,
} from '@/lib/tilinpaatos';
import TilinpaatosMaterialsPanel from '@/components/TilinpaatosMaterialsPanel';
import TilinpaatosMetadataEditor from '@/components/TilinpaatosMetadataEditor';
import ReadinessSummaryPanel from '@/components/ReadinessSummaryPanel';
import { CollapsibleStatementCard } from '@/components/StatementTable';
import CollapsibleSection from '@/components/CollapsibleSection';
import { type PageSearchParams, resolvePeriodId } from '@/lib/page-params';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Tilinpäätös – Tilittaja' };

const MATERIAL_BUTTONS = [
  { label: 'Lataa pääkirja PDF', kind: 'paakirja' },
  { label: 'Lataa päiväkirja PDF', kind: 'paivakirja' },
  { label: 'Lataa tase-erittely PDF', kind: 'tase-erittely' },
  { label: 'Lataa tase (laaja) PDF', kind: 'tase-laaja' },
  { label: 'Lataa tuloslaskelma (laaja) PDF', kind: 'tulos-laaja' },
];

export default async function TilinpaatosPage({
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
  const { tilinpaatos, period } = await runWithResolvedDb(() => ({
    tilinpaatos: buildTilinpaatosPackage(periodId),
    period: getPeriod(periodId),
  }));
  const balanceSheetSummary = getBalanceSheetSummary(tilinpaatos.balanceSheetRows);
  const incomeStatementSummary = getIncomeStatementSummary(
    tilinpaatos.incomeStatementRows,
  );
  const source = await requireCurrentDataSource();
  const readiness = await runWithResolvedDb(() =>
    buildReadinessSummary(periodId, source),
  );

  return (
    <div className="p-5 space-y-4">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted font-semibold mb-1">
          Raportit
        </p>
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">
          Tilinpäätös
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {tilinpaatos.companyName} ({tilinpaatos.businessId}) -{' '}
          {tilinpaatos.periodLabel}
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-4">
          <ReadinessSummaryPanel
            summary={readiness}
            periodId={periodId}
            periodLocked={period?.locked ?? false}
          />
          <CollapsibleStatementCard
            title="Tase"
            rows={tilinpaatos.balanceSheetRows}
            comparisonLabel={tilinpaatos.comparisonPeriodLabel}
            summary={balanceSheetSummary}
          />
          <CollapsibleStatementCard
            title="Tuloslaskelma"
            rows={tilinpaatos.incomeStatementRows}
            comparisonLabel={tilinpaatos.comparisonPeriodLabel}
            summary={incomeStatementSummary}
          />
          <CollapsibleSection
            title="Tilinpäätöksen tekstit"
            summary={`${tilinpaatos.metadata.place || 'Paikka puuttuu'} | ${
              signatureDateAsFi(tilinpaatos.metadata) || 'Päiväys puuttuu'
            }`}
          >
            <TilinpaatosMetadataEditor initialMetadata={tilinpaatos.metadata} />
          </CollapsibleSection>
          <CollapsibleSection
            title="Yhtiökokous"
            summary={`${tilinpaatos.metadata.meetingDate || 'Kokouspäivä puuttuu'} | ${
              tilinpaatos.metadata.attendees.trim()
                ? 'Läsnäolot annettu'
                : 'Läsnäolot puuttuvat'
            }`}
          >
            <TilinpaatosMetadataEditor
              initialMetadata={tilinpaatos.metadata}
              section="meeting"
            />
          </CollapsibleSection>
        </div>

        <div className="space-y-4">
          <div className="bg-surface-2/50 border border-border-subtle rounded-xl p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">
              Materiaalit
            </h2>
            <TilinpaatosMaterialsPanel
              key={periodId}
              periodId={periodId}
              materialItems={MATERIAL_BUTTONS}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
