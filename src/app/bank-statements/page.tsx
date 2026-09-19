import {
  getAccounts,
  getBankStatements,
  getPeriods,
  getSettings,
  runWithResolvedDb,
} from '@/lib/db';
import BankStatementsList from '@/components/BankStatementsList';
import BankStatementImportButton from '@/components/BankStatementImportButton';
import { periodLabel } from '@/lib/accounting';
import { type PageSearchParams, resolvePeriodId } from '@/lib/page-params';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Bank Statements – Ledgerly' };

export default async function BankStatementsPage({
  searchParams,
}: {
  searchParams: PageSearchParams;
}) {
  const params = await searchParams;
  const { settings, periods, bankAccounts } = await runWithResolvedDb(() => ({
    settings: getSettings(),
    periods: getPeriods(),
    bankAccounts: getAccounts()
      .filter((account) => {
        const accountNumber = Number.parseInt(account.number, 10);
        return accountNumber >= 1910 && accountNumber <= 1950;
      })
      .map((account) => ({
        id: account.id,
        number: account.number,
        name: account.name,
      })),
  }));
  const periodId = resolvePeriodId(params, periods, settings.current_period_id);
  const period =
    periods.find((candidate) => candidate.id === periodId) || periods[0];
  const statements = await runWithResolvedDb(() =>
    getBankStatements({
      periodStart: period.start_date,
      periodEnd: period.end_date,
    }),
  );

  return (
    <div className="p-5 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted font-semibold mb-1">
            Bookkeeping
          </p>
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">
            Bank statements
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {periodLabel(period.start_date, period.end_date)} ·{' '}
            {statements.length} bank statement(s)
          </p>
        </div>
        <BankStatementImportButton bankAccounts={bankAccounts} />
      </div>

      <BankStatementsList statements={statements} />
    </div>
  );
}
