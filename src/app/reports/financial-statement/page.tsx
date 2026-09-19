import {
  getPeriod,
  getPeriods,
  getSettings,
  requireCurrentDataSource,
  runWithResolvedDb,
} from '@/lib/db';
import {
  buildReadinessSummary,
  buildFinancialStatementPackage,
  getBalanceSheetSummary,
  getIncomeStatementSummary,
  formatSignatureDate,
  formatFinnishDate,
} from '@/lib/financial-statement';
import FinancialStatementMaterialsPanel from '@/components/FinancialStatementMaterialsPanel';
import FinancialStatementMetadataEditor from '@/components/FinancialStatementMetadataEditor';
import ReadinessSummaryPanel from '@/components/ReadinessSummaryPanel';
import { CollapsibleStatementCard } from '@/components/StatementTable';
import CollapsibleSection from '@/components/CollapsibleSection';
import { type PageSearchParams, resolvePeriodId } from '@/lib/page-params';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Financial statement – Ledgely' };

const MATERIAL_BUTTONS = [
  { label: 'Download general ledger PDF', kind: 'general-ledger' },
  { label: 'Download journal PDF', kind: 'journal' },
  { label: 'Download detailed balance sheet PDF', kind: 'balance-sheet-detailed' },
  { label: 'Download balance sheet (broad) PDF', kind: 'balance-sheet-broad' },
  { label: 'Download income statement (broad) PDF', kind: 'income-statement-broad' },
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
  const { financialStatement, period } = await runWithResolvedDb(() => ({
    financialStatement: buildFinancialStatementPackage(periodId),
    period: getPeriod(periodId),
  }));
  const balanceSheetSummary = getBalanceSheetSummary(financialStatement.balanceSheetRows);
  const incomeStatementSummary = getIncomeStatementSummary(
    financialStatement.incomeStatementRows,
  );
  const source = await requireCurrentDataSource();
  const readiness = await runWithResolvedDb(() =>
    buildReadinessSummary(periodId, source),
  );

  return (
    <div className="p-5 space-y-4">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted font-semibold mb-1">
          Reports
        </p>
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">
          Financial statements
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {financialStatement.companyName} ({financialStatement.businessId}) -{' '}
          {financialStatement.periodLabel}
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
            title="Balance sheet"
            rows={financialStatement.balanceSheetRows}
            comparisonLabel={financialStatement.comparisonPeriodLabel}
            summary={balanceSheetSummary}
          />
          <CollapsibleStatementCard
            title="Income statement"
            rows={financialStatement.incomeStatementRows}
            comparisonLabel={financialStatement.comparisonPeriodLabel}
            summary={incomeStatementSummary}
          />
          <CollapsibleSection
            title="Financial statement texts"
            summary={`${financialStatement.metadata.place || 'Place missing'} | ${
              formatSignatureDate(financialStatement.metadata) || 'Date missing'
            }`}
          >
            <FinancialStatementMetadataEditor initialMetadata={financialStatement.metadata} />
          </CollapsibleSection>
          <CollapsibleSection
            title="Annual meeting"
            summary={`${
              financialStatement.metadata.attendees.trim()
                ? 'Attendees provided'
                : 'Attendees missing'
            } | ${formatFinnishDate(financialStatement.metadata.meetingDate) || 'Meeting date missing'}`}
          >
            <FinancialStatementMetadataEditor
              initialMetadata={financialStatement.metadata}
              section="meeting"
            />
          </CollapsibleSection>
        </div>

        <div className="space-y-4">
          <div className="bg-surface-2/50 border border-border-subtle rounded-xl p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">
              Materials
            </h2>
            <FinancialStatementMaterialsPanel
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
