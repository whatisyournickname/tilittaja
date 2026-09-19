import Link from 'next/link';
import {
  getPeriods,
  getDocuments,
  getDocumentMetadataMap,
  getDocumentBankStatementLinks,
  getEntriesForPeriod,
  getAccounts,
  getDocumentReceiptLinks,
  getSettings,
  requireCurrentDataSource,
  runWithResolvedDb,
} from '@/lib/db';
import { periodLabel } from '@/lib/accounting';
import DocumentsFilter from '@/components/DocumentsFilter';
import DocumentImportButton from '@/components/DocumentImportButton';
import { Plus } from 'lucide-react';
import {
  resolveDocumentReceiptsForSource,
  buildEntryDescriptionsByDocumentId,
} from '@/lib/receipt-resolution';
import { resolveDocumentLabels } from '@/lib/document-labels';
import { type PageSearchParams, resolvePeriodId } from '@/lib/page-params';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Documents – Ledgely' };

export default async function DocumentsPage({
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
  const {
    documents,
    entries,
    accounts,
    manualLinks,
    metadataMap,
    bankStatementLinksMap,
  } = await runWithResolvedDb(() => {
    const currentDocuments = getDocuments(period.id);
    return {
      documents: currentDocuments,
      entries: getEntriesForPeriod(period.id),
      accounts: getAccounts(),
      manualLinks: getDocumentReceiptLinks(
        currentDocuments.map((doc) => doc.id),
      ),
      metadataMap: getDocumentMetadataMap(currentDocuments.map((doc) => doc.id)),
      bankStatementLinksMap: getDocumentBankStatementLinks(
        currentDocuments.map((doc) => doc.id),
      ),
    };
  });
  const vatAccountIds = new Set(
    accounts.flatMap((account) =>
      [account.vat_account1_id, account.vat_account2_id].filter(
        (vatAccountId): vatAccountId is number => vatAccountId != null,
      ),
    ),
  );
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
  const labelMap = resolveDocumentLabels(
    documents.map((doc) => ({
      id: doc.id,
      number: doc.number,
      storedCategory: metadataMap.get(doc.id)?.category ?? '',
      storedName: metadataMap.get(doc.id)?.name ?? '',
      fallbackDescription:
        entries.find(
          (entry) => entry.document_id === doc.id && entry.row_number === 1,
        )?.description ?? '',
    })),
  );

  const documentsWithSummary = documents.map((doc) => {
    const docEntries = entries.filter((e) => e.document_id === doc.id);
    const debitTotal = docEntries
      .filter((e) => e.debit)
      .reduce((sum, e) => sum + e.amount, 0);
    const label = labelMap.get(doc.id);
    if (!label) {
      throw new Error(`Document label missing for document ${doc.id}`);
    }
    const entryCount = docEntries.length;

    const accountNames = [
      ...new Set(
        docEntries.map((e) => {
          const acc = accountMap.get(e.account_id);
          return acc ? `${acc.number} ${acc.name}` : '';
        }),
      ),
    ]
      .filter(Boolean)
      .slice(0, 3);

    const entryDetails = docEntries.map((e) => {
      const acc = accountMap.get(e.account_id);
      return {
        id: e.id,
        account_id: e.account_id,
        account_number: acc?.number || '',
        account_name: acc?.name || '',
        description: e.description,
        debit: e.debit,
        amount: e.amount,
        row_number: e.row_number,
        isVatEntry: vatAccountIds.has(e.account_id),
      };
    });
    const vatDebitTotal = entryDetails
      .filter((entry) => entry.isVatEntry && entry.debit)
      .reduce((sum, entry) => sum + entry.amount, 0);
    const vatCreditTotal = entryDetails
      .filter((entry) => entry.isVatEntry && !entry.debit)
      .reduce((sum, entry) => sum + entry.amount, 0);
    const reverseChargeVat = vatDebitTotal > 0 && vatCreditTotal > 0;
    const vatTotal = reverseChargeVat
      ? Math.min(vatDebitTotal, vatCreditTotal)
      : Math.max(vatDebitTotal, vatCreditTotal);
    const netTotal = Math.round((debitTotal - vatTotal) * 100) / 100;

    const receipt = receiptMap.get(doc.id);

    return {
      ...doc,
      category: label.category,
      name: label.name,
      code: label.code,
      debitTotal,
      netTotal,
      description: label.description,
      entryCount,
      accountNames,
      entries: entryDetails,
      hasReceiptPdf: receipt?.path != null,
      receiptPath: receipt?.path ?? null,
      receiptSource: receipt?.source ?? null,
      bankStatementLinks: bankStatementLinksMap.get(doc.id) ?? [],
    };
  });

  return (
    <div className="w-full max-w-[1600px] p-5">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted font-semibold mb-1">
            Bookkeeping
          </p>
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">
            Documents
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {periodLabel(period.start_date, period.end_date)} ·{' '}
            {documents.length} document(s)
          </p>
        </div>
        <div className="flex items-center gap-4">
          <DocumentImportButton
            periodId={period.id}
            periodLocked={period.locked}
          />
          {period.locked ? (
            <span className="flex items-center gap-1.5 rounded-lg bg-surface-3 px-3 py-2 text-xs font-medium text-text-muted">
              <Plus className="w-3.5 h-3.5" />
              New document
            </span>
          ) : (
            <Link
              href={`/documents/new?period=${periodId}`}
              className="flex items-center gap-1.5 bg-accent hover:bg-amber-700 text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New document
            </Link>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <DocumentsFilter
          documents={documentsWithSummary}
          periodId={period.id}
          periodLocked={period.locked}
          accounts={accounts.map((account) => ({
            id: account.id,
            number: account.number,
            name: account.name,
            type: account.type,
            vat_percentage: account.vat_percentage,
          }))}
        />
      </div>
    </div>
  );
}
