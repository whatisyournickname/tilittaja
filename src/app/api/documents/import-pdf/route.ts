import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createDocument,
  createEntry,
  getAccounts,
  getDb,
  getDocumentMetadataMap,
  getDocumentReceiptLinks,
  getDocuments,
  getEntriesForDocument,
  requireCurrentDataSource,
  setDocumentReceiptLink,
  updateDocumentMetadata,
} from '@/lib/db';
import {
  isMultipartRequest,
  isPdfFile,
  jsonError,
  readRequestFormData,
  requireResource,
  withDb,
} from '@/lib/api-helpers';
import { getPdfRoot, resolvePdfRelativePath } from '@/lib/receipt-pdfs';
import {
  extractImportedDocumentFromPdf,
  isDuplicateImportedDocument,
  resolveImportedDocumentDate,
  sanitizeImportedDocumentPdfName,
} from '@/lib/document-import';
import type {
  DocumentImportApiSuccess,
  ImportedDocumentDateResolution,
} from '@/lib/import-types';
import { requireUnlockedExistingPeriod } from '@/lib/period-locks';

export const runtime = 'nodejs';

const uploadSchema = z.object({
  periodId: z.coerce
    .number({ error: 'Valitse tilikausi' })
    .int({ error: 'Valitse tilikausi' })
    .positive({ error: 'Valitse tilikausi' }),
});

function getPeriodFolder(periodStart: number, periodEnd: number): string {
  const startYear = new Date(periodStart).getUTCFullYear();
  const endYear = new Date(periodEnd).getUTCFullYear();
  return `${startYear}-${endYear}`;
}

function buildImportedReceiptRelativePath(
  fileName: string,
  periodStart: number,
  periodEnd: number,
): string {
  const folder = getPeriodFolder(periodStart, periodEnd);
  const safeName = sanitizeImportedDocumentPdfName(fileName);
  return path.join(
    'tositteet',
    folder,
    'imported',
    `${Date.now()}-${safeName}.pdf`,
  );
}

function buildFallbackName(fileName: string): string {
  return path.basename(fileName, path.extname(fileName)).trim() || 'Tuotu tosite';
}

function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function findDuplicateByReceiptFile(params: {
  receiptLinks: Map<number, string>;
  periodDocuments: { id: number; number: number }[];
  pdfRoot: string;
  uploadedBytes: Buffer;
}): { id: number; number: number } | null {
  const uploadedHash = hashBuffer(params.uploadedBytes);

  for (const document of params.periodDocuments) {
    const receiptPath = params.receiptLinks.get(document.id);
    if (!receiptPath) continue;

    const safeReceiptPath = resolvePdfRelativePath(params.pdfRoot, receiptPath);
    if (!safeReceiptPath) continue;

    const absoluteReceiptPath = path.resolve(params.pdfRoot, safeReceiptPath);
    try {
      const existingHash = hashBuffer(fs.readFileSync(absoluteReceiptPath));
      if (existingHash === uploadedHash) {
        return document;
      }
    } catch {
      // Ignore broken receipt links here and continue duplicate checks.
    }
  }

  return null;
}

function findDuplicateByContent(params: {
  imported: {
    date: number;
    category: string;
    name: string;
    entries: {
      accountNumber: string;
      debit: boolean;
      amount: number;
      description: string;
    }[];
  };
  periodDocuments: { id: number; number: number; date: number }[];
  metadataMap: Map<number, { document_id: number; category: string; name: string }>;
}): { id: number; number: number } | null {
  for (const document of params.periodDocuments) {
    const metadata = params.metadataMap.get(document.id);
    const entries = getEntriesForDocument(document.id).map((entry) => ({
      accountNumber: entry.account_number,
      debit: entry.debit,
      amount: entry.amount,
      description: entry.description,
    }));

    if (
      isDuplicateImportedDocument(params.imported, {
        date: document.date,
        category: metadata?.category ?? '',
        name: metadata?.name ?? '',
        entries,
      })
    ) {
      return document;
    }
  }

  return null;
}

export const POST = withDb(async (request: NextRequest) => {
  if (!isMultipartRequest(request)) {
    return jsonError('Send PDF as multipart form', 400);
  }

  const formData = await readRequestFormData(request);

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return jsonError('Send one PDF file in the .file. field', 400);
  }

  if (!isPdfFile(file)) {
    return jsonError('Vain PDF-tiedostot ovat sallittuja', 400);
  }

  const parsedForm = uploadSchema.parse({
    periodId: formData.get('periodId'),
  });

  const period = requireUnlockedExistingPeriod(parsedForm.periodId);
  const accounts = getAccounts();
  if (accounts.length === 0) {
    return jsonError('Chart of accounts not found for document parsing', 400);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0) {
    return jsonError('Uploaded file is empty', 400);
  }

  const imported = await extractImportedDocumentFromPdf({
    fileName: file.name,
    buffer: bytes,
    accounts,
  });
  const resolvedDate: ImportedDocumentDateResolution = resolveImportedDocumentDate({
    importedDate: imported.date,
    periodStart: period.start_date,
    periodEnd: period.end_date,
  });

  const accountByNumber = new Map(accounts.map((account) => [account.number, account]));
  for (const entry of imported.entries) {
    if (!accountByNumber.has(entry.accountNumber)) {
      return jsonError(`Tiliä ${entry.accountNumber} ei löydy tilikartasta`, 400);
    }
  }

  const source = await requireCurrentDataSource();
  const pdfRoot = getPdfRoot(source);
  const periodDocuments = getDocuments(period.id);
  const periodDocumentIds = periodDocuments.map((document) => document.id);
  const metadataMap = getDocumentMetadataMap(periodDocumentIds);
  const receiptLinks = getDocumentReceiptLinks(periodDocumentIds);

  const duplicateByReceipt = findDuplicateByReceiptFile({
    receiptLinks,
    periodDocuments,
    pdfRoot,
    uploadedBytes: bytes,
  });
  if (duplicateByReceipt) {
    return jsonError(
      `Sama PDF on jo tuotu tositteelle #${duplicateByReceipt.number}.`,
      409,
    );
  }

  const duplicateByContent = findDuplicateByContent({
    imported: {
      date: resolvedDate.date,
      category: imported.category,
      name: imported.name || buildFallbackName(file.name),
      entries: imported.entries,
    },
    periodDocuments,
    metadataMap,
  });
  if (duplicateByContent) {
    return jsonError(
      `Vastaava tosite on jo olemassa (#${duplicateByContent.number}).`,
      409,
    );
  }

  const receiptPath = buildImportedReceiptRelativePath(
    file.name,
    period.start_date,
    period.end_date,
  );
  const absoluteReceiptPath = path.resolve(pdfRoot, receiptPath);

  fs.mkdirSync(path.dirname(absoluteReceiptPath), { recursive: true });
  fs.writeFileSync(absoluteReceiptPath, bytes);

  try {
    const createInTransaction = getDb().transaction(() => {
      const document = createDocument(period.id, resolvedDate.date);

      for (const entry of imported.entries) {
        const account = requireResource(
          accountByNumber.get(entry.accountNumber),
          `Tiliä ${entry.accountNumber} ei löydy`,
        );
        createEntry(
          document.id,
          account.id,
          entry.debit,
          entry.amount,
          entry.description,
          entry.rowNumber,
        );
      }

      updateDocumentMetadata(
        document.id,
        imported.category,
        imported.name || buildFallbackName(file.name),
      );
      setDocumentReceiptLink(document.id, receiptPath);
      return document;
    });

    const document = createInTransaction();
    const response: DocumentImportApiSuccess = {
      id: document.id,
      number: document.number,
      category: imported.category,
      name: imported.name || buildFallbackName(file.name),
      receiptPath,
      usedFallbackDate: resolvedDate.usedFallback,
      fallbackReason: resolvedDate.fallbackReason,
    };
    return NextResponse.json(response);
  } catch (error) {
    try {
      if (fs.existsSync(absoluteReceiptPath)) {
        fs.unlinkSync(absoluteReceiptPath);
      }
    } catch {
      // Ignore cleanup errors and surface the original failure instead.
    }
    throw error;
  }
}, 'Document PDF import failed');
