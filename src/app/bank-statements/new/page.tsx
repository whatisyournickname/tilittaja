import NewBankStatementForm from '@/components/NewBankStatementForm';
import { getAccounts, runWithResolvedDb } from '@/lib/db';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Add bank statement – Tilittaja' };

export default async function NewBankStatementPage() {
  const { accounts } = await runWithResolvedDb(() => ({
    accounts: getAccounts().map((account) => ({
      id: account.id,
      number: account.number,
      name: account.name,
      type: account.type,
      vat_percentage: account.vat_percentage,
    })),
  }));

  return <NewBankStatementForm accounts={accounts} />;
}
