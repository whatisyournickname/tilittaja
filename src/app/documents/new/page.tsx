import NewDocumentForm from '@/components/NewDocumentForm';
import {
  getAccounts,
  getPeriods,
  getSettings,
  runWithResolvedDb,
} from '@/lib/db';
import { type PageSearchParams, resolvePeriodId } from '@/lib/page-params';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'New Document – Ledgerly' };

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: PageSearchParams;
}) {
  const params = await searchParams;
  const { settings, periods, accounts } = await runWithResolvedDb(() => ({
    settings: getSettings(),
    periods: getPeriods(),
    accounts: getAccounts().map((account) => ({
      id: account.id,
      number: account.number,
      name: account.name,
      type: account.type,
      vat_percentage: account.vat_percentage,
    })),
  }));
  const periodId = resolvePeriodId(params, periods, settings.current_period_id);
  const period = periods.find((item) => item.id === periodId) ?? periods[0];

  return (
    <NewDocumentForm
      periodId={periodId}
      periodLocked={period?.locked ?? false}
      accounts={accounts}
    />
  );
}
