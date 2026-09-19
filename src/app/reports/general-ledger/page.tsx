import {
  getDocuments,
  getDocumentMetadataMap,
  getDocumentReceiptLinks,
  getPeriods,
  getAccounts,
  getAllEntriesWithDetails,
  getSettings,
  requireCurrentDataSource,
  runWithResolvedDb,
} from '@/lib/db';
import { getEntrySign, periodLabel } from '@/lib/accounting';
import { AccountType } from '@/lib/types';
import GeneralLedgerFilter from '@/components/GeneralLedgerFilter';
import {
  resolveDocumentReceiptsForSource,
  buildEntryDescriptionsByDocumentId,
} from '@/lib/receipt-resolution';
import { resolveDocumentLabels } from '@/lib/document-labels';
import { type PageSearchParams, resolvePeriodId } from '@/lib/page-params';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'General ledger – Tilittaja' };

export default async function GeneralLedgerPage({
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
  const { accounts, entries, documents, metadataMap, manualLinks } =
    await runWithResolvedDb(() => {
      const currentDocuments = getDocuments(period.id);
      return {
        accounts: getAccounts(),
        entries: getAllEntriesWithDetails(period.id),
        documents: currentDocuments,
        metadataMap: getDocumentMetadataMap(
          currentDocuments.map((doc) => doc.id),
        ),
        manualLinks: getDocumentReceiptLinks(
          currentDocuments.map((doc) => doc.id),
        ),
      };
    });
  const source = await requireCurrentDataSource();

  const accountMap = new Map(accounts.map((a) => [a.id, a]));
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

  const documentPreviewMap = new Map(
    documents.map((doc) => {
      const label = labelMap.get(doc.id);
      if (!label) {
        throw new Error(`Document label missing for document ${doc.id}`);
      }

      const receipt = receiptMap.get(doc.id);

      return [
        doc.id,
        {
          documentId: doc.id,
          documentNumber: doc.number,
          documentCode: label.code,
          documentDescription: label.description,
          receiptPath: receipt?.path ?? null,
          receiptSource: receipt?.source ?? null,
        },
      ] as const;
    }),
  );

  const grouped = new Map<
    number,
    {
      accountNumber: string;
      accountName: string;
      accountType: AccountType;
      entries: typeof entries;
    }
  >();

  for (const entry of entries) {
    if (!grouped.has(entry.account_id)) {
      const account = accountMap.get(entry.account_id);
      grouped.set(entry.account_id, {
        accountNumber: entry.account_number,
        accountName: entry.account_name,
        accountType: (account?.type as AccountType) ?? 0,
        entries: [],
      });
    }
    grouped.get(entry.account_id)!.entries.push(entry);
  }

  const sortedGroups = [...grouped.entries()]
    .sort((a, b) => a[1].accountNumber.localeCompare(b[1].accountNumber))
    .map(([accountId, group]) => {
      let runningBalance = 0;
      const rows = group.entries.map((entry) => {
        const sign = getEntrySign(group.accountType, !!entry.debit);
        runningBalance += entry.amount * sign;
        const documentPreview = documentPreviewMap.get(entry.document_id);
        return {
          ...entry,
          balance: runningBalance,
          documentCode:
            documentPreview?.documentCode ?? String(entry.document_number),
          documentDescription:
            documentPreview?.documentDescription ?? entry.description,
          receiptPath: documentPreview?.receiptPath ?? null,
          receiptSource: documentPreview?.receiptSource ?? null,
        };
      });
      return {
        accountId,
        accountNumber: group.accountNumber,
        accountName: group.accountName,
        finalBalance: runningBalance,
        rows,
      };
    });

  return (
    <div className="w-full max-w-[1600px] overflow-x-auto p-5">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted font-semibold mb-1">
            Reports
          </p>
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">
            General ledger
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {periodLabel(period.start_date, period.end_date)}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <GeneralLedgerFilter groups={sortedGroups} />
      </div>
    </div>
  );
}
