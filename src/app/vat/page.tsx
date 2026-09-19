import VatWorkspace from '@/components/VatWorkspace';
import { periodLabel } from '@/lib/accounting';
import {
  buildVatSettlementPreview,
  calculateVatReport,
} from '@/lib/vat-report';
import {
  getAccounts,
  getDocuments,
  getDocumentMetadataMap,
  getDocumentReceiptLinks,
  getEntriesForPeriod,
  getPeriods,
  getSettings,
  requireCurrentDataSource,
  runWithResolvedDb,
} from '@/lib/db';
import { resolveDocumentLabels } from '@/lib/document-labels';
import { type PageSearchParams, resolvePeriodId } from '@/lib/page-params';
import {
  buildEntryDescriptionsByDocumentId,
  resolveDocumentReceiptsForSource,
} from '@/lib/receipt-resolution';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'VAT – Tilittaja' };

function resolveTimestamp(
  raw: string | string[] | undefined,
  fallback: number,
): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default async function VatPage({
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

  const reportStartDate = resolveTimestamp(params.startDate, period.start_date);
  const reportEndDate = resolveTimestamp(params.endDate, period.end_date);

  const { accounts, documents, allEntries, manualLinks, metadataMap } =
    await runWithResolvedDb(() => {
      const currentDocuments = getDocuments(period.id);
      return {
        accounts: getAccounts(),
        documents: currentDocuments,
        allEntries: getEntriesForPeriod(period.id),
        manualLinks: getDocumentReceiptLinks(
          currentDocuments.map((doc) => doc.id),
        ),
        metadataMap: getDocumentMetadataMap(
          currentDocuments.map((document) => document.id),
        ),
      };
    });
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const entries = allEntries.filter(
    (e) =>
      e.document_date >= reportStartDate && e.document_date <= reportEndDate,
  );
  const vatReport = calculateVatReport(entries, accounts);
  const vatSettlement = buildVatSettlementPreview(allEntries, accounts);
  const source = await requireCurrentDataSource();
  const entryDescriptionsByDocumentId =
    buildEntryDescriptionsByDocumentId(allEntries);
  const receiptMap = resolveDocumentReceiptsForSource({
    source,
    documents,
    entryDescriptionsByDocumentId,
    manualReceiptLinks: manualLinks,
  });
  const labelMap = resolveDocumentLabels(
    documents.map((document) => ({
      id: document.id,
      number: document.number,
      storedCategory: metadataMap.get(document.id)?.category ?? '',
      storedName: metadataMap.get(document.id)?.name ?? '',
      fallbackDescription:
        allEntries.find(
          (entry) =>
            entry.document_id === document.id && entry.row_number === 1,
        )?.description ?? '',
    })),
  );
  const vatDocuments = documents
    .map((document) => {
      const metadata = metadataMap.get(document.id);
      const label = labelMap.get(document.id);
      const receipt = receiptMap.get(document.id);
      return {
        id: document.id,
        number: document.number,
        date: document.date,
        category: metadata?.category ?? label?.category ?? '',
        name: metadata?.name ?? label?.name ?? '',
        code: label?.code ?? String(document.number),
        receiptPath: receipt?.path ?? null,
        receiptSource: receipt?.source ?? null,
        entries: allEntries
          .filter((entry) => entry.document_id === document.id)
          .sort((a, b) => a.row_number - b.row_number)
          .map((entry) => ({
            id: entry.id,
            rowNumber: entry.row_number,
            description: entry.description,
            debit: entry.debit,
            amount: entry.amount,
            accountNumber: accountMap.get(entry.account_id)?.number ?? '',
            accountName: accountMap.get(entry.account_id)?.name ?? '',
          })),
      };
    })
    .filter((document) => document.category.toUpperCase() === 'ALV')
    .sort((a, b) => b.date - a.date || b.number - a.number);

  return (
    <VatWorkspace
      periodId={period.id}
      periodLabel={periodLabel(period.start_date, period.end_date)}
      periodStart={period.start_date}
      periodEnd={period.end_date}
      reportStartDate={reportStartDate}
      reportEndDate={reportEndDate}
      vatReport={vatReport}
      vatSettlement={vatSettlement}
      vatDocuments={vatDocuments}
    />
  );
}
