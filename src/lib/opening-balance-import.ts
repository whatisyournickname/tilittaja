import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { z } from 'zod';
import {
  ApiRouteError,
  readJsonResponse,
  requireResource,
} from '@/lib/api-helpers';
import { resolveDocumentLabels } from '@/lib/document-labels';
import { getDb, requireCurrentDataSource } from '@/lib/db/connection';
import { createAccount } from '@/lib/db/accounts';
import {
  createDocument,
  createEntry,
  deleteDocument,
  getAccounts,
  getDocuments,
  getEntriesForPeriod,
  getPeriod,
} from '@/lib/db/documents';
import {
  getDocumentMetadataMap,
  setDocumentReceiptLink,
  updateDocumentMetadata,
} from '@/lib/db/metadata-receipts';
import { getEnv } from '@/lib/env';
import type {
  PdfParseConstructor,
  PdfParseResult,
} from '@/lib/pdf-parse-types';
import { getPdfRoot } from '@/lib/receipt-pdfs';
import { Account, AccountType } from '@/lib/types';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_OPENING_BALANCE_MODEL = 'gpt-5.4';
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_IMPORTED_FILES = 10;
const MAX_PDF_TEXT_CHARS_PER_FILE = 80_000;
const MAX_TOTAL_PDF_TEXT_CHARS = 220_000;

const aiOpeningBalanceAccountSchema = z.object({
  number: z.string().regex(/^\d{3,6}$/),
  name: z.string().nullable(),
  balance: z.number().finite(),
});

const aiOpeningBalanceSchema = z.object({
  companyName: z.string().nullable(),
  businessId: z.string().nullable(),
  previousPeriodEnd: z.string().regex(ISO_DATE_PATTERN),
  accounts: z.array(aiOpeningBalanceAccountSchema).min(1),
  notes: z.array(z.string()).max(10).default([]),
});

type AiOpeningBalance = z.infer<typeof aiOpeningBalanceSchema>;

interface ImportedOpeningBalanceAccount {
  number: string;
  name: string;
  balance: number;
}

interface ImportedOpeningBalance {
  companyName: string | null;
  businessId: string | null;
  previousPeriodEnd: number;
  previousPeriodEndIso: string;
  accounts: ImportedOpeningBalanceAccount[];
  notes: string[];
}

interface PlannedOpeningBalanceEntry {
  accountNumber: string;
  accountName: string;
  accountType: AccountType;
  balance: number;
  amount: number;
  debit: boolean;
  existingAccountId: number | null;
}

interface PlannedOpeningBalanceAccount {
  number: string;
  name: string;
  type: AccountType;
}

interface OpeningBalancePlan {
  entries: PlannedOpeningBalanceEntry[];
  missingAccounts: PlannedOpeningBalanceAccount[];
  debitTotal: number;
  creditTotal: number;
}

interface OpeningBalanceTargetAccount {
  number: string;
  name: string;
  type: AccountType;
}

interface ImportedOpeningBalanceFile {
  fileName: string;
  buffer: Buffer;
}

export interface ImportedOpeningBalanceApplyResult {
  documentId: number;
  documentNumber: number;
  periodId: number;
  createdAccounts: number;
  createdEntries: number;
  previousPeriodEnd: string;
  importedAccounts: number;
  receiptPath: string;
  savedFiles: string[];
}

const requireFromNode = createRequire(import.meta.url);

const OPENING_BALANCE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['companyName', 'businessId', 'previousPeriodEnd', 'accounts', 'notes'],
  properties: {
    companyName: {
      type: ['string', 'null'],
      description: 'Company name if visible in the materials, otherwise null.',
    },
    businessId: {
      type: ['string', 'null'],
      description: 'Finnish business ID if visible, otherwise null.',
    },
    previousPeriodEnd: {
      type: 'string',
      description:
        'End date of the closed financial year as YYYY-MM-DD. Use the closing date of the material.',
    },
    accounts: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['number', 'name', 'balance'],
        properties: {
          number: {
            type: 'string',
            description:
              'Finnish chart-of-accounts number, usually 1000-2999. Keep the exact number from the material.',
          },
          name: {
            type: ['string', 'null'],
            description: 'Account name from the material, or null if not visible.',
          },
          balance: {
            type: 'number',
            description:
              'Closing balance in euros as a signed natural balance. Positive means normal side balance: assets as debit-positive, liabilities/equity as credit-positive. Negative means the opposite side.',
          },
        },
      },
    },
    notes: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Short extraction notes for ambiguities or assumptions. Empty array when everything is clear.',
    },
  },
} as const;

const OPENING_BALANCE_SYSTEM_PROMPT = [
  'Extract the opening balances for a new Finnish fiscal year from one or more PDF financial statement materials.',
  'Return only the requested JSON schema.',
  'Use the closing balances of balance-sheet accounts that should be carried into the next fiscal year.',
  'Focus on Finnish balance sheet accounts, usually account numbers 1000-2999.',
  'Do not include revenue or expense accounts unless the material explicitly shows them as carried balances in the balance sheet.',
  'Merge duplicate mentions across PDFs so each account number appears only once in the output.',
  'Use signed natural balances: assets debit-positive, liabilities and equity credit-positive.',
  'Do not invent account numbers or balances. Omit accounts that cannot be determined reliably.',
  'Use YYYY-MM-DD for the previousPeriodEnd date.',
  'Keep notes short and only when something is uncertain.',
].join(' ');

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeOptionalText(value: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseIsoDate(dateString: string, fieldLabel: string): number {
  const timestamp = Date.parse(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(timestamp)) {
    throw new ApiRouteError(
      `GPT returned an invalid date for field ${fieldLabel}`,
      502,
    );
  }
  return timestamp;
}

function isBalanceSheetAccountNumber(accountNumber: string): boolean {
  const parsed = Number.parseInt(accountNumber, 10);
  return Number.isInteger(parsed) && parsed >= 1000 && parsed <= 2999;
}

function inferOpeningBalanceAccountType(
  accountNumber: string,
): AccountType {
  const number = Number.parseInt(accountNumber, 10);
  if (!Number.isInteger(number)) {
    throw new ApiRouteError(`Invalid account number in opening balance import: ${accountNumber}`);
  }
  if (accountNumber === '2250') return 5;
  if (accountNumber === '2370') return 6;
  if (number >= 1000 && number <= 1999) return 0;
  if (number >= 2000 && number <= 2249) return 2;
  if (number >= 2250 && number <= 2369) return 5;
  if (number >= 2370 && number <= 2399) return 6;
  if (number >= 2400 && number <= 2999) return 1;
  throw new ApiRouteError(
    `Opening balance import only allows balance sheet accounts 1000-2999, got ${accountNumber}`,
  );
}

function isDebitNaturalAccountType(accountType: AccountType): boolean {
  return accountType === 0 || accountType === 4;
}

function mapOpeningBalanceAccountToNewPeriod(
  accountNumber: string,
  accountName: string,
  accountType: AccountType,
): OpeningBalanceTargetAccount {
  if (accountType === 6) {
    return {
      number: '2250',
      name: 'Edellisten tilikausien voitto (tappio)',
      type: 5,
    };
  }

  return {
    number: accountNumber,
    name: accountName,
    type: accountType,
  };
}

export function getOpeningBalanceEntryDebit(
  accountType: AccountType,
  balance: number,
): boolean {
  return isDebitNaturalAccountType(accountType) ? balance >= 0 : balance < 0;
}

function resolveRealModulePath(candidatePath: string): string {
  if (path.isAbsolute(candidatePath)) return candidatePath;

  const normalizedCandidate = candidatePath.replace(/\\/g, '/');
  const nodeModulesIndex = normalizedCandidate.indexOf('node_modules/');
  if (nodeModulesIndex >= 0) {
    return path.resolve(process.cwd(), normalizedCandidate.slice(nodeModulesIndex));
  }

  return path.resolve(process.cwd(), candidatePath);
}

function loadPdfParse(): {
  PDFParse: PdfParseConstructor;
  workerPath: string;
} {
  const pdfParseModule = requireFromNode('pdf-parse') as {
    PDFParse?: PdfParseConstructor;
  };
  const PDFParse = pdfParseModule.PDFParse;
  if (!PDFParse) {
    throw new ApiRouteError('Failed to load PDF parser', 500);
  }

  const bundledPdfParseMainPath = requireFromNode.resolve('pdf-parse');
  const pdfParseMainPath = resolveRealModulePath(bundledPdfParseMainPath);
  const workerPath = path.join(path.dirname(pdfParseMainPath), 'pdf.worker.mjs');
  return { PDFParse, workerPath };
}

async function ensurePdfJsWorkerGlobal(workerPath: string): Promise<void> {
  if (globalThis.pdfjsWorker?.WorkerMessageHandler) {
    return;
  }

  const workerModule: Partial<PdfJsWorkerState> = await import(
    /* webpackIgnore: true */
    workerPath
  );

  globalThis.pdfjsWorker = {
    WorkerMessageHandler: workerModule.WorkerMessageHandler,
  };
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse, workerPath } = loadPdfParse();
  await ensurePdfJsWorkerGlobal(workerPath);
  const parser = new PDFParse({ data: buffer });

  let result: PdfParseResult;
  try {
    result = await parser.getText();
  } finally {
    await parser.destroy().catch(() => undefined);
  }

  const text = (result.text ?? '').replace(/\u0000/g, ' ').trim();
  if (!text) {
    throw new ApiRouteError(
      'No text could be read from the PDF for the opening balance',
      400,
    );
  }

  return text.slice(0, MAX_PDF_TEXT_CHARS_PER_FILE);
}

function extractResponseText(payload: unknown): string {
  if (
    payload &&
    typeof payload === 'object' &&
    'output_text' in payload &&
    typeof payload.output_text === 'string'
  ) {
    const outputText = payload.output_text.trim();
    if (outputText) return outputText;
  }

  if (
    payload &&
    typeof payload === 'object' &&
    'output' in payload &&
    Array.isArray(payload.output)
  ) {
    const fragments = payload.output.flatMap((item) => {
      if (!item || typeof item !== 'object' || !('content' in item)) return [];
      const content = item.content;
      if (!Array.isArray(content)) return [];

      return content.flatMap((part) => {
        if (!part || typeof part !== 'object') return [];
        if ('text' in part && typeof part.text === 'string') {
          return [part.text];
        }
        return [];
      });
    });

    const combined = fragments.join('\n').trim();
    if (combined) return combined;
  }

  throw new ApiRouteError('GPT did not return parseable opening balance data', 502);
}

function parseAiPayload(jsonText: string): AiOpeningBalance {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonText);
  } catch {
    throw new ApiRouteError('GPT returned invalid JSON data', 502);
  }

  return aiOpeningBalanceSchema.parse(parsedJson);
}

export function normalizeImportedOpeningBalance(
  payload: AiOpeningBalance,
): ImportedOpeningBalance {
  const accountsByNumber = new Map<string, ImportedOpeningBalanceAccount>();

  for (const account of payload.accounts) {
    const number = account.number.trim();
    if (!isBalanceSheetAccountNumber(number)) continue;

    const normalizedAccount: ImportedOpeningBalanceAccount = {
      number,
      name: normalizeOptionalText(account.name) ?? `Account ${number}`,
      balance: roundCents(account.balance),
    };

    if (Math.abs(normalizedAccount.balance) < 0.005) continue;

    const existing = accountsByNumber.get(number);
    if (!existing) {
      accountsByNumber.set(number, normalizedAccount);
      continue;
    }

    if (Math.abs(existing.balance - normalizedAccount.balance) >= 0.01) {
      throw new ApiRouteError(
        `GPT returned conflicting balances for account ${number} (${existing.balance} vs ${normalizedAccount.balance})`,
        502,
      );
    }

    if (
      existing.name.startsWith('Account ') &&
      !normalizedAccount.name.startsWith('Account ')
    ) {
      accountsByNumber.set(number, normalizedAccount);
    }
  }

  const accounts = [...accountsByNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number, 'fi'),
  );

  if (accounts.length === 0) {
    throw new ApiRouteError(
      'GPT did not find any valid balance sheet accounts from the financial statement materials',
      502,
    );
  }

  const notes = payload.notes
    .map((note) => note.trim())
    .filter(Boolean)
    .slice(0, 10);

  return {
    companyName: normalizeOptionalText(payload.companyName),
    businessId: normalizeOptionalText(payload.businessId),
    previousPeriodEnd: parseIsoDate(payload.previousPeriodEnd, 'previousPeriodEnd'),
    previousPeriodEndIso: payload.previousPeriodEnd,
    accounts,
    notes,
  };
}

async function requestOpeningBalanceJson(
  files: Array<{ fileName: string; extractedText: string }>,
): Promise<string> {
  const env = getEnv();
  if (!env.OPENAI_API_KEY) {
    throw new ApiRouteError(
      'OPENAI_API_KEY is missing from server environment variables',
      500,
    );
  }

  const inputContent = files.flatMap((file, index) => [
    {
      type: 'input_text' as const,
      text: `PDF ${index + 1}/${files.length}: ${file.fileName}`,
    },
    {
      type: 'input_text' as const,
      text: file.extractedText,
    },
  ]);

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model:
        env.OPENAI_OPENING_BALANCE_MODEL ?? DEFAULT_OPENING_BALANCE_MODEL,
      reasoning: { effort: 'medium' },
      store: false,
      text: {
        format: {
          type: 'json_schema',
          name: 'opening_balance_import',
          strict: true,
          schema: OPENING_BALANCE_JSON_SCHEMA,
        },
      },
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: OPENING_BALANCE_SYSTEM_PROMPT }],
        },
        {
          role: 'user',
          content: inputContent,
        },
      ],
    }),
  });

  const payload = await readJsonResponse(
    response,
    'OpenAI API returned invalid JSON data',
  );
  if (!response.ok) {
    const apiMessage =
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      payload.error &&
      typeof payload.error === 'object' &&
      'message' in payload.error &&
      typeof payload.error.message === 'string'
        ? payload.error.message
        : 'OpenAI API request failed';

    throw new ApiRouteError(`GPT parsing failed: ${apiMessage}`, 502);
  }

  return extractResponseText(payload);
}

async function extractImportedOpeningBalanceFromPdfs(
  files: ImportedOpeningBalanceFile[],
): Promise<ImportedOpeningBalance> {
  if (files.length === 0) {
    throw new ApiRouteError('Send at least one PDF file', 400);
  }
  if (files.length > MAX_IMPORTED_FILES) {
    throw new ApiRouteError('You can send at most 10 PDF files', 400);
  }

  const extractedFiles: Array<{ fileName: string; extractedText: string }> = [];
  let totalTextChars = 0;

  for (const file of files) {
    if (!file.buffer.length) {
      throw new ApiRouteError(`Uploaded file is empty: ${file.fileName}`, 400);
    }

    const extractedText = await extractPdfText(file.buffer);
    totalTextChars += extractedText.length;

    if (totalTextChars > MAX_TOTAL_PDF_TEXT_CHARS) {
      throw new ApiRouteError(
        'PDF material is too large to import at once. Send fewer or shorter files.',
        400,
      );
    }

    extractedFiles.push({ fileName: file.fileName, extractedText });
  }

  const jsonText = await requestOpeningBalanceJson(extractedFiles);
  const parsed = parseAiPayload(jsonText);
  return normalizeImportedOpeningBalance(parsed);
}

export function sanitizeOpeningBalancePdfName(fileName: string): string {
  const normalizedFileName = fileName
    .replace(/[\\/]+/g, '-')
    .replace(/\.pdf$/i, '')
    .trim();
  const baseName = path.basename(normalizedFileName).trim();
  const asciiName = baseName
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .toLowerCase();

  return asciiName || 'tilinavaus';
}

function getExistingOpeningDocumentId(periodId: number): number | null {
  const documents = getDocuments(periodId);
  if (documents.length === 0) return null;

  const metadataMap = getDocumentMetadataMap(documents.map((document) => document.id));
  const existing = documents.find((document) => {
    const metadata = metadataMap.get(document.id);
    return metadata?.category?.toUpperCase() === 'AVAUS';
  });

  return existing?.id ?? null;
}

export function buildOpeningBalancePlan(
  imported: ImportedOpeningBalance,
  existingAccounts: Account[],
): OpeningBalancePlan {
  const existingByNumber = new Map(
    existingAccounts.map((account) => [account.number, account]),
  );

  const entriesByNumber = new Map<string, PlannedOpeningBalanceEntry>();
  const missingAccounts: PlannedOpeningBalanceAccount[] = [];
  let debitTotal = 0;
  let creditTotal = 0;

  for (const importedAccount of imported.accounts) {
    const existingAccount = existingByNumber.get(importedAccount.number);
    const accountType = existingAccount
      ? existingAccount.type
      : inferOpeningBalanceAccountType(importedAccount.number);

    if (!isBalanceSheetAccountNumber(importedAccount.number)) {
      continue;
    }

    if (
      accountType !== 0 &&
      accountType !== 1 &&
      accountType !== 2 &&
      accountType !== 5 &&
      accountType !== 6
    ) {
      throw new ApiRouteError(
        `Account ${importedAccount.number} is not a balance sheet account in the current chart of accounts`,
        400,
      );
    }

    const targetAccount = mapOpeningBalanceAccountToNewPeriod(
      importedAccount.number,
      existingAccount?.name || importedAccount.name,
      accountType,
    );
    const targetExistingAccount = existingByNumber.get(targetAccount.number);
    const amount = Math.abs(roundCents(importedAccount.balance));
    if (amount < 0.005) continue;

    const normalizedBalance = roundCents(importedAccount.balance);
    const debit = getOpeningBalanceEntryDebit(
      targetAccount.type,
      normalizedBalance,
    );
    const currentEntry = entriesByNumber.get(targetAccount.number);

    if (currentEntry) {
      currentEntry.balance = roundCents(currentEntry.balance + normalizedBalance);
      currentEntry.amount = Math.abs(currentEntry.balance);
      currentEntry.debit = getOpeningBalanceEntryDebit(
        targetAccount.type,
        currentEntry.balance,
      );
    } else {
      entriesByNumber.set(targetAccount.number, {
        accountNumber: targetAccount.number,
        accountName: targetExistingAccount?.name || targetAccount.name,
        accountType: targetAccount.type,
        balance: normalizedBalance,
        amount,
        debit,
        existingAccountId: targetExistingAccount?.id ?? null,
      });
    }

    if (
      !targetExistingAccount &&
      !missingAccounts.some((account) => account.number === targetAccount.number)
    ) {
      missingAccounts.push({
        number: targetAccount.number,
        name: targetAccount.name,
        type: targetAccount.type,
      });
    }

    if (debit) debitTotal += amount;
    else creditTotal += amount;
  }

  const entries = [...entriesByNumber.values()]
    .filter((entry) => entry.amount >= 0.005)
    .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber, 'fi'));

  debitTotal = roundCents(debitTotal);
  creditTotal = roundCents(creditTotal);

  if (entries.length === 0) {
    throw new ApiRouteError('No opening entries were generated from the PDF material', 400);
  }

  if (Math.abs(debitTotal - creditTotal) >= 0.01) {
    throw new ApiRouteError(
      `Opening balances do not match: debit ${debitTotal.toFixed(2)} euros, credit ${creditTotal.toFixed(2)} euros`,
      400,
    );
  }

  return { entries, missingAccounts, debitTotal, creditTotal };
}

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

async function buildMergedOpeningBalanceReceiptPdf(
  files: ImportedOpeningBalanceFile[],
): Promise<Buffer> {
  const merged = await PDFDocument.create();

  for (const file of files) {
    try {
      const sourcePdf = await PDFDocument.load(file.buffer);
      const pageIndices = sourcePdf.getPageIndices();
      const copiedPages = await merged.copyPages(sourcePdf, pageIndices);
      copiedPages.forEach((page) => merged.addPage(page));
    } catch {
      throw new ApiRouteError(
        `Failed to merge PDF file ${file.fileName}`,
        400,
      );
    }
  }

  if (merged.getPageCount() === 0) {
    throw new ApiRouteError('No PDF pages were found in the opening materials', 400);
  }

  return Buffer.from(await merged.save());
}

function resolveOpeningBalanceReceiptPath(
  documentId: number,
  periodId: number,
  periodStartDate: number,
  periodEndDate: number,
): string {
  const periodDocuments = getDocuments(periodId);
  const metadataMap = getDocumentMetadataMap(
    periodDocuments.map((document) => document.id),
  );
  const firstEntryDescriptionByDocumentId = new Map<number, string>();

  for (const entry of getEntriesForPeriod(periodId)) {
    if (
      entry.row_number !== 1 ||
      firstEntryDescriptionByDocumentId.has(entry.document_id)
    ) {
      continue;
    }
    firstEntryDescriptionByDocumentId.set(entry.document_id, entry.description);
  }

  const label = resolveDocumentLabels(
    periodDocuments.map((document) => ({
      id: document.id,
      number: document.number,
      storedCategory: metadataMap.get(document.id)?.category ?? '',
      storedName: metadataMap.get(document.id)?.name ?? '',
      fallbackDescription:
        firstEntryDescriptionByDocumentId.get(document.id) ?? '',
    })),
  ).get(documentId);

  if (!label) {
    throw new ApiRouteError('Could not generate code for opening document', 500);
  }

  return buildUploadedReceiptPath(label.code, periodStartDate, periodEndDate);
}

function writeReceiptPdf(
  source: string,
  relativePath: string,
  buffer: Buffer,
): void {
  const pdfRoot = getPdfRoot(source);
  const absolutePath = path.resolve(pdfRoot, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, buffer);
}

function cleanupReceiptFile(source: string, relativePath: string | null): void {
  if (!relativePath) return;

  try {
    const pdfRoot = getPdfRoot(source);
    const absolutePath = path.resolve(pdfRoot, relativePath);
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }
  } catch {
    // Ignore cleanup failures and surface the original error.
  }
}

function buildImportedSourceRelativePath(
  periodId: number,
  previousPeriodEndIso: string,
  fileName: string,
  index: number,
): string {
  const safeName = sanitizeOpeningBalancePdfName(fileName);
  return path.join(
    'imported-source',
    'tilikauden-avaus',
    `period-${periodId}`,
    `${previousPeriodEndIso}-${Date.now()}-${index + 1}-${safeName}.pdf`,
  );
}

function saveImportedSourceFiles(
  source: string,
  periodId: number,
  previousPeriodEndIso: string,
  files: ImportedOpeningBalanceFile[],
): string[] {
  const pdfRoot = getPdfRoot(source);
  const savedPaths: string[] = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const relativePath = buildImportedSourceRelativePath(
      periodId,
      previousPeriodEndIso,
      file.fileName,
      index,
    );
    const absolutePath = path.resolve(pdfRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, file.buffer);
    savedPaths.push(relativePath);
  }

  return savedPaths;
}

function cleanupSavedSourceFiles(source: string, savedPaths: string[]): void {
  const pdfRoot = getPdfRoot(source);

  for (const relativePath of savedPaths) {
    try {
      const absolutePath = path.resolve(pdfRoot, relativePath);
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
    } catch {
      // Ignore cleanup failures and surface the original error.
    }
  }
}

export async function applyImportedOpeningBalance(params: {
  periodId: number;
  files: ImportedOpeningBalanceFile[];
}): Promise<ImportedOpeningBalanceApplyResult> {
  const period = requireResource(
    getPeriod(params.periodId),
    'Period not found',
  );

  if (period.locked) {
    throw new ApiRouteError('Period is locked, so the opening balance cannot be imported', 400);
  }

  const existingOpeningDocumentId = getExistingOpeningDocumentId(period.id);
  if (existingOpeningDocumentId) {
    throw new ApiRouteError(
      `There is already an opening document for the period (#${existingOpeningDocumentId}). Delete it before re-importing.`,
      409,
    );
  }

  const imported = await extractImportedOpeningBalanceFromPdfs(params.files);
  if (imported.previousPeriodEnd >= period.start_date) {
    throw new ApiRouteError(
      'The end date of the financial statement material must be before the start of the selected period',
      400,
    );
  }

  const plan = buildOpeningBalancePlan(imported, getAccounts());
  const mergedReceiptBuffer = await buildMergedOpeningBalanceReceiptPdf(params.files);
  const source = await requireCurrentDataSource();
  const savedPaths = saveImportedSourceFiles(
    source,
    period.id,
    imported.previousPeriodEndIso,
    params.files,
  );
  let createdDocumentId: number | null = null;
  let receiptPath: string | null = null;

  try {
    const createInTransaction = getDb().transaction(() => {
      const accountIdByNumber = new Map(
        getAccounts().map((account) => [account.number, account.id]),
      );

      for (const missingAccount of plan.missingAccounts) {
        const createdAccount = createAccount({
          number: missingAccount.number,
          name: missingAccount.name,
          type: missingAccount.type,
        });
        accountIdByNumber.set(createdAccount.number, createdAccount.id);
      }

      const document = createDocument(period.id, period.start_date);
      const description = `Tilikauden avaus ${imported.previousPeriodEndIso}`;

      plan.entries.forEach((entry, index) => {
        const accountId = accountIdByNumber.get(entry.accountNumber);
        if (!accountId) {
          throw new ApiRouteError(
            `Failed to create account ${entry.accountNumber} during opening balance import`,
            500,
          );
        }

        createEntry(
          document.id,
          accountId,
          entry.debit,
          entry.amount,
          description,
          index + 1,
        );
      });

      updateDocumentMetadata(
        document.id,
        'AVAUS',
        `Tilikauden avaus ${imported.previousPeriodEndIso}`,
      );

      return {
        documentId: document.id,
        documentNumber: document.number,
      };
    });

    const created = createInTransaction();
    createdDocumentId = created.documentId;
    receiptPath = resolveOpeningBalanceReceiptPath(
      created.documentId,
      period.id,
      period.start_date,
      period.end_date,
    );
    writeReceiptPdf(source, receiptPath, mergedReceiptBuffer);
    setDocumentReceiptLink(created.documentId, receiptPath);

    return {
      documentId: created.documentId,
      documentNumber: created.documentNumber,
      periodId: period.id,
      createdAccounts: plan.missingAccounts.length,
      createdEntries: plan.entries.length,
      previousPeriodEnd: imported.previousPeriodEndIso,
      importedAccounts: imported.accounts.length,
      receiptPath,
      savedFiles: savedPaths,
    };
  } catch (error) {
    cleanupSavedSourceFiles(source, savedPaths);
    cleanupReceiptFile(source, receiptPath);
    if (createdDocumentId != null) {
      try {
        deleteDocument(createdDocumentId);
      } catch {
        // Ignore cleanup failures and surface the original error.
      }
    }
    throw error;
  }
}
