import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import {
  getDataSources,
  requireCurrentDataSource,
  runWithResolvedDb,
} from '@/lib/db';
import StateTransferPanel from '@/components/StateTransferPanel';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Tuonti ja vienti – Ledgerly' };

export default async function ExportImportPage() {
  const sourceSlug = await requireCurrentDataSource();
  const dataSources = await runWithResolvedDb(() => getDataSources());
  const activeSource = dataSources.find((source) => source.slug === sourceSlug);

  return (
    <div className="p-5">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
              System
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-text-primary">
              Tuonti ja vienti
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">
              Export active data source as restorable ZIP or
              restore a previously exported state.
            </p>
          </div>

          <Link
            href="/settings"
            className="inline-flex items-center gap-2 self-start rounded-xl border border-border-subtle bg-surface-0/60 px-4 py-2.5 text-sm font-medium text-text-primary transition hover:border-accent/30 hover:text-accent-light"
          >
            Back to settings
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>

        <StateTransferPanel
          sourceSlug={sourceSlug}
          sourceName={activeSource?.name ?? sourceSlug}
        />
      </div>
    </div>
  );
}
