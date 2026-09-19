import {
  getPeriods,
  getAccounts,
  getEntriesForPeriod,
  getReportStructure,
  getAllEntriesWithDetails,
  getSettings,
  runWithResolvedDb,
} from '@/lib/db';
import {
  calculateBalances,
  parseReportStructure,
  calculateReportAmounts,
  filterVisibleReportRows,
  getDetailRowsWithIds,
  isDetailReportRow,
  periodLabel,
} from '@/lib/accounting';
import { type PageSearchParams, resolvePeriodId } from '@/lib/page-params';
import IncomeStatementWorkspace from '@/components/IncomeStatementWorkspace';
import type { AccountType } from '@/lib/types';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Income Statement – Ledgely' };

export default async function IncomeStatementPage({
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
  const period = periods.find((p) => p.id === periodId) || periods[0];
  const { structure, accounts, entries, currentPeriodEntries } =
    await runWithResolvedDb(() => ({
      structure: getReportStructure('income-statement-detailed'),
      accounts: getAccounts(),
      entries: getEntriesForPeriod(period.id),
      currentPeriodEntries: getAllEntriesWithDetails(period.id),
    }));
  if (!structure) {
    return (
      <div className="p-5 text-rose-400">Income statement structure not found</div>
    );
  }
  const balances = calculateBalances(entries, accounts);
  const reportRows = parseReportStructure(structure.data);
  const calculatedRows = calculateReportAmounts(reportRows, accounts, balances);
  const visibleRows = filterVisibleReportRows(calculatedRows);
  const detailRowsByIndex: Record<
    number,
    {
      accountId: number;
      accountNumber: string;
      accountName: string;
      amount: number;
    }[]
  > = {};

  visibleRows.forEach((row, i) => {
    if (isDetailReportRow(row)) {
      detailRowsByIndex[i] = getDetailRowsWithIds(row, accounts, balances);
    }
  });

  const entriesByAccount: Record<
    number,
    {
      id: number;
      document_id: number;
      document_number: number;
      document_date: number;
      description: string;
      debit: boolean;
      amount: number;
      account_id: number;
    }[]
  > = {};

  for (const entry of currentPeriodEntries) {
    if (!entriesByAccount[entry.account_id]) {
      entriesByAccount[entry.account_id] = [];
    }
    entriesByAccount[entry.account_id].push({
      id: entry.id,
      document_id: entry.document_id,
      document_number: entry.document_number,
      document_date: entry.document_date,
      description: entry.description,
      debit: !!entry.debit,
      amount: entry.amount,
      account_id: entry.account_id,
    });
  }

  const accountTypes: Record<number, AccountType> = {};
  for (const account of accounts) {
    accountTypes[account.id] = account.type;
  }

  return (
    <div className="p-5">
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted font-semibold mb-1">
          Reports
        </p>
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">
          Income statement
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {periodLabel(period.start_date, period.end_date)}
        </p>
      </div>

      <IncomeStatementWorkspace
        rows={visibleRows}
        detailRowsByIndex={detailRowsByIndex}
        entriesByAccount={entriesByAccount}
        accountTypes={accountTypes}
      />
    </div>
  );
}
