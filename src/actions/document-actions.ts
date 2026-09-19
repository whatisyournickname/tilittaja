'use server';

import fs from 'fs';
import path from 'path';
import {
  clearDocumentReceiptLink,
  createDocument,
  createEntry,
  deleteDocument,
  deleteEntry,
  getAccounts,
  getDocumentMetadataMap,
  getDb,
  getDocument,
  getDocumentMetadata,
  getDocumentReceiptLink,
  getDocuments,
  getEntriesForDocument,
  getEntriesForPeriod,
  getPeriod,
  requireCurrentDataSource,
  setDocumentReceiptLink,
  updateDocumentDate,
  updateDocumentMetadata,
  updateEntryAccount,
  updateEntryAmount,
  updateEntryDescription,
  getAccount,
  getEntry,
} from '@/lib/db';
import { revalidateApp, runDbAction } from '@/actions/_helpers';
import {
  documentCreateSchema,
  documentBulkDeleteSchema,
  documentUpdateSchema,
  documentEntriesUpdateSchema,
  entryDescriptionSchema,
  entryAccountSchema,
  receiptLinkSchema,
} from '@/lib/validation';
import { ApiRouteError, isPdfFile, requireResource } from '@/lib/api-helpers';
import {
  requireUnlockedDocumentPeriod,
  requireUnlockedEntryPeriod,
  requireUnlockedTargetPeriod,
} from '@/lib/period-locks';
import { toCents } from '@/lib/amount-input';
import {
  resolveDocumentLabel,
  resolveDocumentLabels,
} from '@/lib/document-labels';
import {
  buildReceiptIndex,
  chooseDocumentReceipt,
  getAutomaticReceiptPaths,
  getPdfRoot,
  getReceiptsRoot,
  resolvePdfRelativePath,
} from '@/lib/receipt-pdfs';

function getExpectedPeriodFolder(startDate: number, endDate: number): string {
  const startYear = new Date(startDate).getFullYear();
  const endYear = new Date(endDate).getFullYear();
  return `${startYear}-${endYear}`;
}

function buildUploadedReceiptPath(
  documentCode: string,
  periodStartDate: number,
  periodEndDate: number,
): string {
  const folder = getExpectedPeriodFolder(periodStartDate, periodEndDate);
  return path.join('tositteet', folder, `${documentCode}.pdf`);
}

function resolveReceiptResponse(
  documentId: number,
  documentNumber: number,
  source: string,
) {
  const pdfRoot = getPdfRoot(source);
  const receiptsRoot = getReceiptsRoot(source);
  const entryDescriptions = getEntriesForDocument(documentId).map(
    (entry) => entry.description,
  );
  const resolved = chooseDocumentReceipt({
    manualPath: getDocumentReceiptLink(documentId),
    automaticPaths: getAutomaticReceiptPaths({
      documentNumber,
      entryDescriptions,
      receiptIndex: buildReceiptIndex(receiptsRoot),
    }),
    pdfRoot,
    receiptsRoot,
  });

  return {
    receiptPath: resolved.path,
    receiptSource: resolved.source,
  };
}

function removeReceiptFile(pdfRoot: string, receiptPath: string): boolean {
  const safePath = resolvePdfRelativePath(pdfRoot, receiptPath);
  if (!safePath) {
    return false;
  }

  fs.unlinkSync(path.resolve(pdfRoot, safePath));
  return true;
}

export async function createDocumentAction(input: unknown) {
  const parsed = documentCreateSchema.parse(input);

  return runDbAction(() => {
    const accounts = getAccounts();
    const accountByNumber = new Map(
      accounts.map((account) => [account.number, account]),
    );

    for (const entry of parsed.entries) {
      if (!accountByNumber.has(entry.accountNumber)) {
        throw new ApiRouteError(`Tiliä ${entry.accountNumber} ei löydy`);
      }
    }

    requireUnlockedTargetPeriod(parsed.periodId, parsed.date);
    const document = createDocument(parsed.periodId, parsed.date);

    for (const entry of parsed.entries) {
      const account = accountByNumber.get(entry.accountNumber)!;
      createEntry(
        document.id,
        account.id,
        entry.debit,
        entry.amount,
        entry.description || '',
        entry.rowNumber,
      );
    }

    revalidateApp();
    return { id: document.id, number: document.number };
  }, 'Failed to create document.');
}

export async function updateDocumentAction(documentId: number, input: unknown) {
  const parsed = documentUpdateSchema.parse(input);

  return runDbAction(() => {
    const document = requireResource(
      getDocument(documentId),
      'Document not found',
    );
    requireUnlockedDocumentPeriod(document);
    requireUnlockedTargetPeriod(document.period_id, parsed.date);

    updateDocumentDate(documentId, parsed.date);
    updateDocumentMetadata(documentId, parsed.category, parsed.name);

    const savedDocument = getDocument(documentId);
    const savedMetadata = getDocumentMetadata(documentId);

    revalidateApp();
    return {
      id: documentId,
      date: savedDocument?.date ?? parsed.date,
      category: savedMetadata?.category ?? parsed.category.trim().toUpperCase(),
      name: savedMetadata?.name ?? parsed.name.trim(),
    };
  }, 'Failed to update document.');
}

export async function saveDocumentEntriesAction(
  documentId: number,
  input: unknown,
) {
  const parsed = documentEntriesUpdateSchema.parse(input);

  return runDbAction(() => {
    const document = requireResource(
      getDocument(documentId),
      'Document not found',
    );
    requireUnlockedDocumentPeriod(document);

    const currentEntries = getEntriesForDocument(documentId);
    const currentEntryMap = new Map(
      currentEntries.map((entry) => [entry.id, entry]),
    );
    const updateMap = new Map(parsed.entries.map((entry) => [entry.id, entry]));
    const deletedEntryIdSet = new Set(parsed.deletedEntryIds);

    for (const deletedEntryId of deletedEntryIdSet) {
      if (!currentEntryMap.has(deletedEntryId)) {
        throw new ApiRouteError(
          'Poistettava vientirivi ei kuulu valittuun tositteeseen',
        );
      }
    }

    for (const entry of parsed.entries) {
      if (!currentEntryMap.has(entry.id)) {
        throw new ApiRouteError('Vientirivi ei kuulu valittuun tositteeseen');
      }

      if (deletedEntryIdSet.has(entry.id)) {
        throw new ApiRouteError(
          'Cannot both update and delete the same entry row',
        );
      }
    }

    const nextEntries = currentEntries
      .filter((entry) => !deletedEntryIdSet.has(entry.id))
      .map((entry) => ({
        ...entry,
        amount: updateMap.get(entry.id)?.amount ?? entry.amount,
      }));

    if (nextEntries.length < 2) {
      throw new ApiRouteError(
        'Document must have at least two entry rows.',
      );
    }

    const debitTotal = nextEntries
      .filter((entry) => entry.debit)
      .reduce((sum, entry) => sum + toCents(entry.amount), 0);
    const creditTotal = nextEntries
      .filter((entry) => !entry.debit)
      .reduce((sum, entry) => sum + toCents(entry.amount), 0);

    if (debitTotal !== creditTotal) {
      throw new ApiRouteError(
        'Debit and credit amounts must balance before saving.',
      );
    }

    const updateInTransaction = getDb().transaction(() => {
      for (const entry of parsed.entries) {
        updateEntryAmount(entry.id, entry.amount);
      }

      for (const deletedEntryId of deletedEntryIdSet) {
        deleteEntry(deletedEntryId);
      }
    });

    updateInTransaction();

    revalidateApp();
    return {
      entries: nextEntries.map((entry) => ({
        id: entry.id,
        amount: entry.amount,
      })),
      deletedEntryIds: [...deletedEntryIdSet],
      debitTotal: debitTotal / 100,
      creditTotal: creditTotal / 100,
    };
  }, 'Failed to update entry amounts.');
}

export async function duplicateDocumentAction(documentId: number) {
  return runDbAction(() => {
    const accounts = getAccounts();
    const vatAccountIds = new Set(
      accounts.flatMap((account) =>
        [account.vat_account1_id, account.vat_account2_id].filter(
          (vatAccountId): vatAccountId is number => vatAccountId != null,
        ),
      ),
    );

    const document = requireResource(
      getDocument(documentId),
      'Document not found',
    );
    requireUnlockedDocumentPeriod(document);

    const sourceEntries = getEntriesForDocument(documentId);
    if (sourceEntries.length === 0) {
      throw new ApiRouteError('Document has no entry rows to copy');
    }

    const sourceMetadata = getDocumentMetadata(documentId);
    const sourceLabel = resolveDocumentLabel({
      number: document.number,
      storedCategory: sourceMetadata?.category ?? '',
      storedName: sourceMetadata?.name ?? '',
      fallbackDescription: sourceEntries[0]?.description ?? '',
    });

    const duplicateInTransaction = getDb().transaction(() => {
      const nextDocument = createDocument(document.period_id, document.date);

      for (const entry of sourceEntries) {
        createEntry(
          nextDocument.id,
          entry.account_id,
          entry.debit,
          entry.amount,
          entry.description,
          entry.row_number,
        );
      }

      if (sourceLabel.category || sourceLabel.name) {
        updateDocumentMetadata(
          nextDocument.id,
          sourceLabel.category,
          sourceLabel.name,
        );
      }

      setDocumentReceiptLink(nextDocument.id, '');
      return nextDocument;
    });

    const duplicatedDocument = duplicateInTransaction();
    const duplicatedEntries = getEntriesForDocument(duplicatedDocument.id);
    const duplicatedLabel = resolveDocumentLabel({
      number: duplicatedDocument.number,
      storedCategory: sourceLabel.category,
      storedName: sourceLabel.name,
      fallbackDescription: duplicatedEntries[0]?.description ?? '',
    });

    const debitTotal = duplicatedEntries
      .filter((entry) => entry.debit)
      .reduce((sum, entry) => sum + entry.amount, 0);
    const vatDebitTotal = duplicatedEntries
      .filter((entry) => vatAccountIds.has(entry.account_id) && entry.debit)
      .reduce((sum, entry) => sum + entry.amount, 0);
    const vatCreditTotal = duplicatedEntries
      .filter((entry) => vatAccountIds.has(entry.account_id) && !entry.debit)
      .reduce((sum, entry) => sum + entry.amount, 0);
    const reverseChargeVat = vatDebitTotal > 0 && vatCreditTotal > 0;
    const vatTotal = reverseChargeVat
      ? Math.min(vatDebitTotal, vatCreditTotal)
      : Math.max(vatDebitTotal, vatCreditTotal);
    const netTotal = Math.round((debitTotal - vatTotal) * 100) / 100;

    revalidateApp();
    return {
      document: {
        id: duplicatedDocument.id,
        number: duplicatedDocument.number,
        date: duplicatedDocument.date,
        category: duplicatedLabel.category,
        name: duplicatedLabel.name,
        code: duplicatedLabel.code,
        debitTotal,
        netTotal,
        description: duplicatedLabel.description,
        entryCount: duplicatedEntries.length,
        accountNames: [
          ...new Set(
            duplicatedEntries.map(
              (entry) => `${entry.account_number} ${entry.account_name}`,
            ),
          ),
        ].slice(0, 3),
        entries: duplicatedEntries.map((entry) => ({
          id: entry.id,
          account_id: entry.account_id,
          account_number: entry.account_number,
          account_name: entry.account_name,
          description: entry.description,
          debit: entry.debit,
          amount: entry.amount,
          row_number: entry.row_number,
          isVatEntry: vatAccountIds.has(entry.account_id),
        })),
        hasReceiptPdf: false,
        receiptPath: null,
        receiptSource: null,
        bankStatementLinks: [],
      },
    };
  }, 'Failed to copy document.');
}

export async function deleteDocumentAction(documentId: number) {
  return runDbAction(() => {
    const document = requireResource(
      getDocument(documentId),
      'Document not found',
    );
    requireUnlockedDocumentPeriod(document);
    deleteDocument(documentId);
    revalidateApp();
    return { ok: true };
  }, 'Failed to delete document.');
}

export async function deleteDocumentsAction(input: unknown) {
  const parsed = documentBulkDeleteSchema.parse(input);

  return runDbAction(() => {
    for (const documentId of parsed.documentIds) {
      const document = requireResource(
        getDocument(documentId),
        'Document not found',
      );
      requireUnlockedDocumentPeriod(document);
      deleteDocument(documentId);
    }

    revalidateApp();
    return { ok: true, deletedCount: parsed.documentIds.length };
  }, 'Failed to delete documents.');
}

export async function updateEntryDescriptionAction(
  entryId: number,
  input: unknown,
) {
  const parsed = entryDescriptionSchema.parse(input);

  return runDbAction(() => {
    const entry = requireResource(getEntry(entryId), 'Entry row not found');
    requireUnlockedEntryPeriod(entry);
    updateEntryDescription(entryId, parsed.description);
    revalidateApp();
    return { id: entryId, description: parsed.description };
  }, 'Failed to update entry row.');
}

export async function updateEntryAccountAction(
  entryId: number,
  input: unknown,
) {
  const parsed = entryAccountSchema.parse(input);

  return runDbAction(() => {
    const account = requireResource(
      getAccount(parsed.accountId),
      'Account not found',
    );
    const entry = requireResource(getEntry(entryId), 'Entry row not found');
    requireUnlockedEntryPeriod(entry);
    updateEntryAccount(entryId, account.id);
    revalidateApp();
    return {
      id: entryId,
      accountId: account.id,
      accountNumber: account.number,
      accountName: account.name,
    };
  }, 'Failed to update entry row.');
}

export async function updateDocumentReceiptAction(
  documentId: number,
  input: unknown,
) {
  const parsed = receiptLinkSchema.parse(input);

  return runDbAction(async () => {
    const document = requireResource(
      getDocument(documentId),
      'Document not found',
    );
    requireUnlockedDocumentPeriod(document);

    const source = await requireCurrentDataSource();
    const pdfRoot = getPdfRoot(source);

    if (parsed.receiptPath === null) {
      setDocumentReceiptLink(documentId, '');
    } else {
      const safePath = resolvePdfRelativePath(pdfRoot, parsed.receiptPath);
      if (!safePath) {
        throw new ApiRouteError('Valittu PDF-tiedosto ei ole kelvollinen');
      }
      setDocumentReceiptLink(documentId, safePath);
    }

    revalidateApp();
    return resolveReceiptResponse(documentId, document.number, source);
  }, 'Failed to save PDF link.');
}

export async function uploadDocumentReceiptAction(
  documentId: number,
  file: File,
) {
  return runDbAction(async () => {
    const document = requireResource(
      getDocument(documentId),
      'Document not found',
    );
    requireUnlockedDocumentPeriod(document);
    const period = requireResource(
      getPeriod(document.period_id),
      'Document period not found',
    );

    if (!(file instanceof File)) {
      throw new ApiRouteError('Send one PDF file in the .file. field');
    }

    if (!isPdfFile(file)) {
      throw new ApiRouteError('Vain PDF-tiedostot ovat sallittuja');
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length === 0) {
      throw new ApiRouteError('Uploaded file is empty');
    }

    const source = await requireCurrentDataSource();
    const pdfRoot = getPdfRoot(source);
    const periodDocuments = getDocuments(document.period_id);
    const periodMetadataMap = getDocumentMetadataMap(
      periodDocuments.map((doc) => doc.id),
    );
    const firstEntryDescriptionByDocumentId = new Map<number, string>();
    for (const entry of getEntriesForPeriod(document.period_id)) {
      if (
        entry.row_number !== 1 ||
        firstEntryDescriptionByDocumentId.has(entry.document_id)
      ) {
        continue;
      }
      firstEntryDescriptionByDocumentId.set(entry.document_id, entry.description);
    }

    const documentLabel = resolveDocumentLabels(
      periodDocuments.map((currentDocument) => ({
        id: currentDocument.id,
        number: currentDocument.number,
        storedCategory:
          periodMetadataMap.get(currentDocument.id)?.category ?? '',
        storedName: periodMetadataMap.get(currentDocument.id)?.name ?? '',
        fallbackDescription:
          firstEntryDescriptionByDocumentId.get(currentDocument.id) ?? '',
      })),
    ).get(document.id);

    if (!documentLabel) {
      throw new ApiRouteError('Tositteen koodia ei voitu muodostaa', 500);
    }

    const relativePath = buildUploadedReceiptPath(
      documentLabel.code,
      period.start_date,
      period.end_date,
    );
    const absolutePath = path.resolve(pdfRoot, relativePath);

    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, bytes);
    setDocumentReceiptLink(documentId, relativePath);

    revalidateApp();
    return resolveReceiptResponse(documentId, document.number, source);
  }, 'PDF upload failed.');
}

export async function deleteDocumentReceiptAction(documentId: number) {
  return runDbAction(async () => {
    const document = requireResource(
      getDocument(documentId),
      'Document not found',
    );
    requireUnlockedDocumentPeriod(document);

    const source = await requireCurrentDataSource();
    const pdfRoot = getPdfRoot(source);
    const currentReceipt = resolveReceiptResponse(
      documentId,
      document.number,
      source,
    );

    if (!currentReceipt.receiptPath) {
      throw new ApiRouteError(
        'Document has no PDF attachment to remove',
        404,
      );
    }

    const removed = removeReceiptFile(pdfRoot, currentReceipt.receiptPath);
    if (!removed) {
      throw new ApiRouteError('PDF file not found for deletion', 404);
    }

    clearDocumentReceiptLink(documentId);
    revalidateApp();
    return resolveReceiptResponse(documentId, document.number, source);
  }, 'Failed to remove PDF attachment.');
}
