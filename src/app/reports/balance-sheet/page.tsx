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
  withImplicitCurrentPeriodProfit,
} from '@/lib/accounting';
import { type PageSearchParams, resolvePeriodId } from '@/lib/page-params';
import BalanceSheetWorkspace from '@/components/BalanceSheetWorkspace';
import type { BalanceSheetEntry } from '@/components/BalanceSheetWorkspace';
import type { AccountType } from '@/lib/types';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Balance sheet – Ledgely' };

export default async function BalanceSheetPage({
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
  const { structure, accounts, currentPeriodEntries } = await runWithResolvedDb(
    () => ({
      structure: getReportStructure('balance-sheet-detailed'),
      accounts: getAccounts(),
      currentPeriodEntries: getAllEntriesWithDetails(period.id),
    }),
  );
  if (!structure) {
    return <div className="p-5 text-rose-400">Balance sheet structure not found</div>;
  }

  const allEntries: { account_id: number; debit: boolean; amount: number }[] =
    [];
  for (const p of periods) {
    if (p.end_date <= period.end_date) {
      const entries = await runWithResolvedDb(() => getEntriesForPeriod(p.id));
      allEntries.push(...entries);
    }
  }

  const balances = calculateBalances(allEntries, accounts);
  const currentIncomeBalances = calculateBalances(currentPeriodEntries, accounts);
  const balanceSheetData = withImplicitCurrentPeriodProfit(
    balances,
    currentIncomeBalances,
    accounts,
  );
  const reportRows = parseReportStructure(structure.data);
  const calculatedRows = calculateReportAmounts(
    reportRows,
    balanceSheetData.accounts,
    balanceSheetData.balances,
  );
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
      detailRowsByIndex[i] = getDetailRowsWithIds(
        row,
        balanceSheetData.accounts,
        balanceSheetData.balances,
      );
    }
  });

  const entriesByAccount: Record<number, BalanceSheetEntry[]> = {};
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
  for (const account of balanceSheetData.accounts) {
    accountTypes[account.id] = account.type;
  }

  return (
    <div className="p-5">
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted font-semibold mb-1">
          Reports
        </p>
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">
          Balance sheet
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {periodLabel(period.start_date, period.end_date)}
        </p>
      </div>

      <BalanceSheetWorkspace
        rows={visibleRows}
        detailRowsByIndex={detailRowsByIndex}
        entriesByAccount={entriesByAccount}
        accountTypes={accountTypes}
      />
    </div>
  );
}
