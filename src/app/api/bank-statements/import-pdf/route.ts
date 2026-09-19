import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  bankStatementArchiveIdExists,
  createBankStatement,
  createBankStatementEntry,
  getAccount,
  requireCurrentDataSource,
} from '@/lib/db';
import {
  isMultipartRequest,
  isPdfFile,
  jsonError,
  readRequestFormData,
  requireResource,
  withDb,
} from '@/lib/api-helpers';
import {
  extractImportedBankStatementFromPdf,
  sanitizeImportedBankStatementPdfName,
} from '@/lib/bank-statement-import';
import type { BankStatementImportApiSuccess } from '@/lib/import-types';
import { getPdfRoot } from '@/lib/receipt-pdfs';

export const runtime = 'nodejs';

const uploadSchema = z.object({
  accountId: z.coerce
    .number({ error: 'Valitse pankkitili' })
    .int({ error: 'Valitse pankkitili' })
    .positive({ error: 'Valitse pankkitili' }),
});

function getStatementPeriodFolder(
  periodStart: number,
  periodEnd: number,
): string {
  const startYear = new Date(periodStart).getUTCFullYear();
  const endYear = new Date(periodEnd).getUTCFullYear();
  return `${startYear}-${endYear}`;
}

function buildStatementRelativePath(
  fileName: string,
  periodStart: number,
  periodEnd: number,
): string {
  const folder = getStatementPeriodFolder(periodStart, periodEnd);
  const safeName = sanitizeImportedBankStatementPdfName(fileName);
  return path.join('tiliotteet', folder, `${Date.now()}-${safeName}.pdf`);
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
    accountId: formData.get('accountId'),
  });
  const bankAccount = requireResource(
    getAccount(parsedForm.accountId),
    'Bank account not found',
  );

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0) {
    return jsonError('Uploaded file is empty', 400);
  }

  const imported = await extractImportedBankStatementFromPdf({
    fileName: file.name,
    buffer: bytes,
  });

  const source = await requireCurrentDataSource();
  const pdfRoot = getPdfRoot(source);
  const sourceFile = buildStatementRelativePath(
    file.name,
    imported.periodStart,
    imported.periodEnd,
  );
  const absolutePath = path.resolve(pdfRoot, sourceFile);

  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, bytes);

  try {
    const statement = createBankStatement({
      account_id: bankAccount.id,
      iban: imported.iban,
      period_start: imported.periodStart,
      period_end: imported.periodEnd,
      opening_balance: imported.openingBalance,
      closing_balance: imported.closingBalance,
      source_file: sourceFile,
    });

    let created = 0;
    let skipped = 0;

    for (const entry of imported.entries) {
      if (entry.archiveId && bankStatementArchiveIdExists(entry.archiveId)) {
        skipped++;
        continue;
      }

      createBankStatementEntry({
        bank_statement_id: statement.id,
        entry_date: entry.entryDate,
        value_date: entry.valueDate ?? entry.entryDate,
        archive_id: entry.archiveId,
        counterparty: entry.counterparty,
        counterparty_iban: entry.counterpartyIban,
        reference: entry.reference,
        message: entry.message,
        payment_type: entry.paymentType,
        transaction_number: entry.transactionNumber,
        amount: entry.amount,
        counterpart_account_id: null,
      });
      created++;
    }

    const response: BankStatementImportApiSuccess = {
      id: statement.id,
      created,
      skipped,
    };
    return NextResponse.json(response);
  } catch (error) {
    try {
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
    } catch {
      // Ignore cleanup errors and surface the original failure instead.
    }
    throw error;
  }
}, 'Bank statement PDF import failed');
