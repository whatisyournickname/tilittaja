import { getAccounts, getCOAHeadings, runWithResolvedDb } from '@/lib/db';
import AccountsFilter from '@/components/AccountsFilter';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Chart of Accounts – Ledgerly' };

export default async function AccountsPage() {
  const { accounts, headings } = await runWithResolvedDb(() => ({
    accounts: getAccounts(),
    headings: getCOAHeadings(),
  }));

  const topLevelHeadings = headings.filter((h) => h.level === 0);

  const sections = topLevelHeadings.map((topHeading) => {
    const nextTopHeading = topLevelHeadings.find(
      (h) => h.number > topHeading.number,
    );
    const sectionAccounts = accounts.filter((a) => {
      if (nextTopHeading) {
        return (
          a.number >= topHeading.number && a.number < nextTopHeading.number
        );
      }
      return a.number >= topHeading.number;
    });

    const sectionHeadings = headings.filter((h) => {
      if (nextTopHeading) {
        return (
          h.number >= topHeading.number &&
          h.number < nextTopHeading.number &&
          h.level > 0
        );
      }
      return h.number >= topHeading.number && h.level > 0;
    });

    return {
      heading: topHeading,
      accounts: sectionAccounts,
      subHeadings: sectionHeadings,
    };
  });

  return (
    <div className="p-5 max-w-4xl overflow-x-auto">
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted font-semibold mb-1">
          System
        </p>
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">
          Chart of Accounts
        </h1>
        <p className="text-sm text-text-secondary mt-1">{accounts.length} accounts</p>
      </div>

      <div className="space-y-4">
        <AccountsFilter sections={sections} totalCount={accounts.length} />
      </div>
    </div>
  );
}
