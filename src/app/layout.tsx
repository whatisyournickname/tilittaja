import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';
import AppShell from '@/components/AppShell';
import SetupWizard from '@/components/SetupWizard';
import {
  getDataSources,
  getPeriods,
  getSettings,
  hasAnyDataSource,
  requireCurrentDataSource,
  runWithResolvedDb,
} from '@/lib/db';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-body',
});

export const metadata: Metadata = {
  title: 'Ledgerly – Bookkeeping',
  description: 'Modern bookkeeping app',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const dbAvailable = hasAnyDataSource();

  if (!dbAvailable) {
    return (
      <html lang="fi" className={`${manrope.variable} h-full`}>
        <body
          className="h-full bg-surface-0 text-text-primary antialiased"
          style={{ fontFamily: 'var(--font-body), system-ui, sans-serif' }}
        >
          <SetupWizard />
        </body>
      </html>
    );
  }

  const currentSource = await requireCurrentDataSource();
  const { dataSources, periods, settings } = await runWithResolvedDb(() => ({
    dataSources: getDataSources(),
    periods: getPeriods(),
    settings: getSettings(),
  }));

  return (
    <html lang="fi" className={`${manrope.variable} h-full`}>
      <body
        className="h-full bg-surface-0 text-text-primary antialiased"
        style={{ fontFamily: 'var(--font-body), system-ui, sans-serif' }}
      >
        <AppShell
          sidebar={{
            dataSources: dataSources.map(({ slug, name }) => ({ slug, name })),
            currentSource,
            periods: periods.map((period) => ({
              id: period.id,
              start_date: period.start_date,
              end_date: period.end_date,
              locked: period.locked,
            })),
            currentPeriodId: settings.current_period_id,
          }}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
