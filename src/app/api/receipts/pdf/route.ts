import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { withDb, jsonError } from '@/lib/api-helpers';
import { pdfResponse } from '@/lib/pdf/pdf-response';
import {
  getDocument,
  getDocumentReceiptLink,
  getEntriesForDocument,
  resolveRequestDataSource,
} from '@/lib/db';
import {
  buildReceiptIndex,
  chooseDocumentReceipt,
  getAutomaticReceiptPaths,
  getPdfRoot,
  getReceiptsRoot,
  resolvePdfRelativePath,
} from '@/lib/receipt-pdfs';

export const GET = withDb(async (request: NextRequest) => {
  const documentIdParam = request.nextUrl.searchParams.get('documentId');
  const documentId = Number(documentIdParam);
  const numberParam = request.nextUrl.searchParams.get('number');
  const number = Number(numberParam);
  const pathParam = request.nextUrl.searchParams.get('path');

  const source = resolveRequestDataSource(request);
  if (!source) {
    return jsonError('Active datasource not found.', 400);
  }
  const pdfRoot = getPdfRoot(source);
  const receiptsRoot = getReceiptsRoot(source);

  let relativePath: string | null = null;

  if (pathParam) {
    relativePath = resolvePdfRelativePath(pdfRoot, pathParam);
    if (!relativePath) {
      return jsonError('Virheellinen PDF-polku', 400);
    }
  } else if (Number.isInteger(documentId) && documentId > 0) {
    const document = getDocument(documentId);
    if (!document) {
      return jsonError('Document not found', 404);
    }

    const receiptIndex = buildReceiptIndex(receiptsRoot);
    const manualPath = getDocumentReceiptLink(documentId);
    const entryDescriptions = getEntriesForDocument(documentId).map(
      (entry) => entry.description,
    );
    relativePath = chooseDocumentReceipt({
      manualPath,
      automaticPaths: getAutomaticReceiptPaths({
        documentNumber: document.number,
        entryDescriptions,
        receiptIndex,
      }),
      pdfRoot,
      receiptsRoot,
    }).path;

    if (!relativePath) {
      return jsonError(`PDF puuttuu tositteelta ${document.number}`, 404);
    }
  } else {
    if (!Number.isInteger(number) || number < 0) {
      return jsonError('Virheellinen tositenumero', 400);
    }

    const matched = buildReceiptIndex(receiptsRoot).byNumber.get(number) ?? [];
    if (matched.length === 0) {
      return jsonError(`PDF puuttuu tositteelta ${number}`, 404);
    }
    relativePath = path.normalize(path.join('tositteet', matched[0]));
  }

  const absolutePath = path.resolve(pdfRoot, relativePath);

  if (!absolutePath.startsWith(path.resolve(pdfRoot))) {
    return jsonError('Virheellinen polku', 400);
  }

  try {
    const file = fs.readFileSync(absolutePath);
    return pdfResponse(file, path.basename(absolutePath), { noCache: true });
  } catch (error) {
    console.error('Error reading receipt PDF:', error);
    return jsonError('PDF download failed');
  }
}, 'Document PDF download failed');
