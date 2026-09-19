import JournalFilter from '@/components/JournalFilter';
import { periodLabel } from '@/lib/accounting';
import {
  getDocumentMetadataMap,
  getDocumentReceiptLinks,
  getDocuments,
  getAccounts,
  getEntriesForPeriod,
  getPeriods,
  getSettings,
  requireCurrentDataSource,
  runWithResolvedDb,
} from '@/lib/db';
import {
  buildEntryDescriptionsByDocumentId,
  resolveDocumentReceiptsForSource,
} from '@/lib/receipt-resolution';
import { resolveDocumentLabels } from '@/lib/document-labels';
import { type PageSearchParams, resolvePeriodId } from '@/lib/page-params';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Journal – Ledgely' };

export default async function JournalPage({
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
    periods.find((candidate) => candidate.id === periodId) || periods[0];

  const { accounts, entries, documents, metadataMap, manualLinks } =
    await runWithResolvedDb(() => {
      const currentDocuments = getDocuments(period.id);
      return {
        accounts: getAccounts(),
        entries: getEntriesForPeriod(period.id),
        documents: currentDocuments,
        metadataMap: getDocumentMetadataMap(
          currentDocuments.map((doc) => doc.id),
        ),
        manualLinks: getDocumentReceiptLinks(
          currentDocuments.map((doc) => doc.id),
        ),
      };
    });
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const source = await requireCurrentDataSource();

  const entryDescriptionsByDocumentId =
    buildEntryDescriptionsByDocumentId(entries);
  const receiptMap = resolveDocumentReceiptsForSource({
    source,
    documents,
    entryDescriptionsByDocumentId,
    manualReceiptLinks: manualLinks,
  });

  const firstEntryDescriptionByDocument = new Map<number, string>();
  for (const entry of entries) {
    if (
      entry.row_number === 1 &&
      !firstEntryDescriptionByDocument.has(entry.document_id)
    ) {
      firstEntryDescriptionByDocument.set(entry.document_id, entry.description);
    }
  }

  const labelMap = resolveDocumentLabels(
    documents.map((doc) => ({
      id: doc.id,
      number: doc.number,
      storedCategory: metadataMap.get(doc.id)?.category ?? '',
      storedName: metadataMap.get(doc.id)?.name ?? '',
      fallbackDescription: firstEntryDescriptionByDocument.get(doc.id) ?? '',
    })),
  );

  const grouped = new Map<
    number,
    {
      documentId: number;
      documentNumber: number;
      documentDate: number;
      documentCode: string;
      documentDescription: string;
      receiptPath: string | null;
      receiptSource: 'manual' | 'automatic' | null;
      debitTotal: number;
      creditTotal: number;
      rows: {
        id: number;
        rowNumber: number;
        accountNumber: string;
        accountName: string;
        description: string;
        debit: boolean;
        amount: number;
      }[];
    }
  >();

  for (const entry of entries) {
    const account = accountById.get(entry.account_id);
    const existing = grouped.get(entry.document_number);
    if (existing) {
      existing.rows.push({
        id: entry.id,
        rowNumber: entry.row_number,
        accountNumber: account?.number || '',
        accountName: account?.name || '',
        description: entry.description || '',
        debit: Boolean(entry.debit),
        amount: entry.amount,
      });
      if (entry.debit) existing.debitTotal += entry.amount;
      else existing.creditTotal += entry.amount;
      continue;
    }

    const label = labelMap.get(entry.document_id);
    const receipt = receiptMap.get(entry.document_id);

    grouped.set(entry.document_number, {
      documentId: entry.document_id,
      documentNumber: entry.document_number,
      documentDate: entry.document_date,
      documentCode: label?.code ?? String(entry.document_number),
      documentDescription: label?.description ?? entry.description ?? '',
      receiptPath: receipt?.path ?? null,
      receiptSource: receipt?.source ?? null,
      debitTotal: entry.debit ? entry.amount : 0,
      creditTotal: entry.debit ? 0 : entry.amount,
      rows: [
        {
          id: entry.id,
          rowNumber: entry.row_number,
          accountNumber: account?.number || '',
          accountName: account?.name || '',
          description: entry.description || '',
          debit: Boolean(entry.debit),
          amount: entry.amount,
        },
      ],
    });
  }

  const groups = [...grouped.values()]
    .map((group) => ({
      ...group,
      rows: [...group.rows].sort(
        (left, right) => left.rowNumber - right.rowNumber,
      ),
    }))
    .sort((left, right) => {
      if (left.documentDate !== right.documentDate) {
        return left.documentDate - right.documentDate;
      }
      return left.documentNumber - right.documentNumber;
    });

  return (
    <div className="max-w-6xl overflow-x-auto p-5">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
            Reports
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">
            Journal
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {periodLabel(period.start_date, period.end_date)}
          </p>
        </div>

        <a
          href={`/api/reports/materials/pdf?period=${period.id}&kind=journal`}
          className="inline-flex min-h-[32px] items-center text-sm text-accent underline hover:text-accent-light"
        >
          Download PDF
        </a>
      </div>

      <div className="space-y-3">
        <JournalFilter groups={groups} />
      </div>
    </div>
  );
}
