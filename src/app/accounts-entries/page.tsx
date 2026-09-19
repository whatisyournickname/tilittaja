import AccountsEntriesWorkspace from '@/components/AccountsEntriesWorkspace';
import { calculateBalances, periodLabel } from '@/lib/accounting';
import {
  getAccounts,
  getAllEntriesWithDetails,
  getPeriods,
  getSettings,
  runWithResolvedDb,
} from '@/lib/db';
import { type PageSearchParams, resolvePeriodId } from '@/lib/page-params';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Tilit ja viennit – Ledgely' };

export default async function AccountsEntriesPage({
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
  const period =
    periods.find((currentPeriod) => currentPeriod.id === periodId) ||
    periods[0];

  const { accounts, entries } = await runWithResolvedDb(() => ({
    accounts: getAccounts(),
    entries: getAllEntriesWithDetails(period.id),
  }));
  const balances = calculateBalances(entries, accounts);
  const accountStats = new Map<
    number,
    { entryCount: number; debitTotal: number; creditTotal: number }
  >();

  for (const entry of entries) {
    const currentStats = accountStats.get(entry.account_id) ?? {
      entryCount: 0,
      debitTotal: 0,
      creditTotal: 0,
    };

    currentStats.entryCount += 1;
    if (entry.debit) {
      currentStats.debitTotal += entry.amount;
    } else {
      currentStats.creditTotal += entry.amount;
    }

    accountStats.set(entry.account_id, currentStats);
  }

  const accountSummaries = accounts.map((account) => {
    const stats = accountStats.get(account.id);
    return {
      id: account.id,
      number: account.number,
      name: account.name,
      type: account.type,
      balance: balances.get(account.id) ?? 0,
      entryCount: stats?.entryCount ?? 0,
      debitTotal: stats?.debitTotal ?? 0,
      creditTotal: stats?.creditTotal ?? 0,
    };
  });

  return (
    <AccountsEntriesWorkspace
      periodLabel={periodLabel(period.start_date, period.end_date)}
      periodStart={period.start_date}
      periodEnd={period.end_date}
      accounts={accountSummaries}
      entries={entries.map((entry) => ({
        id: entry.id,
        account_id: entry.account_id,
        account_number: entry.account_number,
        account_name: entry.account_name,
        document_number: entry.document_number,
        document_date: entry.document_date,
        description: entry.description,
        debit: entry.debit,
        amount: entry.amount,
        row_number: entry.row_number,
      }))}
    />
  );
}
