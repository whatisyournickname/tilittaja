import { createRequire } from 'module';
import path from 'path';
import { z } from 'zod';
import { ApiRouteError, readJsonResponse } from '@/lib/api-helpers';
import { getEnv } from '@/lib/env';
import type { ImportedDocumentDateResolution } from '@/lib/import-types';
import type {
  PdfParseConstructor,
  PdfParseResult,
} from '@/lib/pdf-parse-types';
import { ACCOUNT_TYPES, type Account } from '@/lib/types';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_DOCUMENT_IMPORT_MODEL = 'gpt-5.4-mini';
const MAX_PDF_TEXT_CHARS = 120_000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const aiEntrySchema = z.object({
  accountNumber: z.string().trim().min(1),
  debit: z.boolean(),
  amount: z.number().finite().nonnegative(),
  description: z.string().nullable(),
});

const aiDocumentSchema = z.object({
  date: z.string().regex(ISO_DATE_PATTERN).nullable(),
  category: z.string().trim().min(1).nullable(),
  name: z.string().trim().min(1).nullable(),
  entries: z.array(aiEntrySchema).min(2),
});

type AiDocument = z.infer<typeof aiDocumentSchema>;

interface ImportedDocumentEntry {
  accountNumber: string;
  debit: boolean;
  amount: number;
  description: string;
  rowNumber: number;
}

interface ImportedDocument {
  date: number | null;
  category: string;
  name: string;
  entries: ImportedDocumentEntry[];
}

interface ComparableDocumentEntry {
  accountNumber: string;
  debit: boolean;
  amount: number;
  description: string;
}

interface ComparableDocument {
  date: number;
  category: string;
  name: string;
  entries: ComparableDocumentEntry[];
}

const requireFromNode = createRequire(import.meta.url);

function resolveRealModulePath(candidatePath: string): string {
  if (path.isAbsolute(candidatePath)) {
    return candidatePath;
  }

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

const DOCUMENT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['date', 'category', 'name', 'entries'],
  properties: {
    date: {
      type: ['string', 'null'],
      description:
        'Receipt or invoice date as YYYY-MM-DD. Return null when the exact date cannot be read reliably.',
    },
    category: {
      type: ['string', 'null'],
      description:
        'Short voucher category such as MU, OS, MY or ALV. Use MU if unsure.',
    },
    name: {
      type: ['string', 'null'],
      description:
        'Short voucher name, usually vendor/customer plus a short description.',
    },
    entries: {
      type: 'array',
      minItems: 2,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['accountNumber', 'debit', 'amount', 'description'],
        properties: {
          accountNumber: {
            type: 'string',
            description:
              'Exact account number from the provided chart of accounts. Never invent one.',
          },
          debit: {
            type: 'boolean',
            description: 'True for debit, false for credit.',
          },
          amount: {
            type: 'number',
            description: 'Positive euro amount with max 2 decimals.',
          },
          description: {
            type: ['string', 'null'],
            description:
              'Short line description copied or inferred from the receipt.',
          },
        },
      },
    },
  },
} as const;

const DOCUMENT_IMPORT_SYSTEM_PROMPT = [
  'Extract one balanced Finnish bookkeeping voucher from one receipt or invoice PDF.',
  'Return only the requested JSON schema.',
  'Use only account numbers from the provided chart of accounts.',
  'Do not invent account numbers, VAT rates, dates or payment methods.',
  'If the receipt date cannot be read reliably, return date as null instead of guessing.',
  'If an amount cannot be read reliably, omit that voucher row instead of using 0 or guessing.',
  'Total debit must equal total credit exactly.',
  'Use positive euro amounts with at most 2 decimals.',
  'If VAT is clearly shown and suitable VAT accounts exist, create separate VAT lines.',
  'If payment status is unclear, prefer a payable, receivable or clearing account over guessing a bank account.',
  'Use category MU if you are not confident about a more specific category.',
  'Keep the voucher name concise.',
].join(' ');

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

function normalizeOptionalText(value: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeCategory(value: string | null): string {
  const normalized = (normalizeOptionalText(value) ?? 'MU')
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '')
    .toUpperCase()
    .slice(0, 6);

  return normalized || 'MU';
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function normalizeDuplicateText(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

function buildAccountsPrompt(accounts: Account[]): string {
  const promptAccounts = accounts.map((account) => ({
    number: account.number,
    name: account.name,
    type: ACCOUNT_TYPES[account.type] ?? String(account.type),
    vatPercentage: account.vat_percentage,
    hasVatAccounts:
      account.vat_account1_id != null || account.vat_account2_id != null,
  }));

  return JSON.stringify(promptAccounts, null, 2);
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

  throw new ApiRouteError('GPT did not return parseable document data', 502);
}

function parseAiPayload(jsonText: string): AiDocument {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonText);
  } catch {
    throw new ApiRouteError('GPT returned invalid JSON data', 502);
  }

  const parsed = aiDocumentSchema.safeParse(parsedJson);
  if (!parsed.success) {
    const amountIssue = parsed.error.issues.find(
      (issue) =>
        issue.path.length >= 3 &&
        issue.path[0] === 'entries' &&
        issue.path[2] === 'amount',
    );
    if (amountIssue) {
      throw new ApiRouteError(
        'GPT could not reliably read the document entry amount from the PDF',
        502,
      );
    }

    throw new ApiRouteError('GPT returned invalid document data', 502);
  }

  return parsed.data;
}

export function normalizeImportedDocument(
  payload: AiDocument,
  accounts: Account[],
): ImportedDocument {
  const accountNumbers = new Set(accounts.map((account) => account.number));
  const normalizedEntries = payload.entries
    .map((entry) => {
      const accountNumber = entry.accountNumber.trim();
      if (!accountNumbers.has(accountNumber)) {
        throw new ApiRouteError(
          `GPT selected unknown account ${accountNumber}`,
          502,
        );
      }

      return {
        accountNumber,
        debit: entry.debit,
        amount: entry.amount,
        description: normalizeOptionalText(entry.description) ?? '',
      };
    })
    .filter((entry) => entry.amount >= 0.005);

  if (normalizedEntries.length < 2) {
    throw new ApiRouteError(
      'GPT could not get enough usable entry rows from the document',
      502,
    );
  }

  const entries = normalizedEntries.map((entry, index) => ({
    ...entry,
    rowNumber: index + 1,
  }));

  const debitTotal = entries
    .filter((entry) => entry.debit)
    .reduce((sum, entry) => sum + toCents(entry.amount), 0);
  const creditTotal = entries
    .filter((entry) => !entry.debit)
    .reduce((sum, entry) => sum + toCents(entry.amount), 0);

  if (debitTotal !== creditTotal) {
    throw new ApiRouteError(
      'GPT returned an unbalanced document where debit and credit do not match',
      502,
    );
  }

  return {
    date: payload.date ? parseIsoDate(payload.date, 'date') : null,
    category: normalizeCategory(payload.category),
    name: normalizeOptionalText(payload.name) ?? '',
    entries,
  };
}

function tryAlignImportedDateToPeriodYear(
  importedDate: number,
  periodStart: number,
  periodEnd: number,
): number | null {
  const source = new Date(importedDate);
  const month = source.getUTCMonth();
  const day = source.getUTCDate();
  const startYear = new Date(periodStart).getUTCFullYear();
  const endYear = new Date(periodEnd).getUTCFullYear();

  for (let year = startYear; year <= endYear; year += 1) {
    const candidate = Date.UTC(year, month, day);
    const candidateDate = new Date(candidate);
    if (
      candidateDate.getUTCFullYear() !== year ||
      candidateDate.getUTCMonth() !== month ||
      candidateDate.getUTCDate() !== day
    ) {
      continue;
    }
    if (candidate >= periodStart && candidate <= periodEnd) {
      return candidate;
    }
  }

  return null;
}

export function resolveImportedDocumentDate(params: {
  importedDate: number | null;
  periodStart: number;
  periodEnd: number;
}): ImportedDocumentDateResolution {
  const { importedDate, periodStart, periodEnd } = params;

  if (importedDate != null && importedDate >= periodStart && importedDate <= periodEnd) {
    return { date: importedDate, usedFallback: false, fallbackReason: null };
  }

  if (importedDate != null) {
    const alignedDate = tryAlignImportedDateToPeriodYear(
      importedDate,
      periodStart,
      periodEnd,
    );
    if (alignedDate != null) {
      return {
        date: alignedDate,
        usedFallback: true,
        fallbackReason: 'shifted_year',
      };
    }

    return {
      date: periodStart,
      usedFallback: true,
      fallbackReason: 'outside_period',
    };
  }

  return {
    date: periodStart,
    usedFallback: true,
    fallbackReason: 'missing',
  };
}

export function isDuplicateImportedDocument(
  imported: ComparableDocument,
  existing: ComparableDocument,
): boolean {
  if (imported.date !== existing.date) {
    return false;
  }

  if (normalizeCategory(imported.category) !== normalizeCategory(existing.category)) {
    return false;
  }

  if (
    normalizeDuplicateText(imported.name) !== normalizeDuplicateText(existing.name)
  ) {
    return false;
  }

  if (imported.entries.length !== existing.entries.length) {
    return false;
  }

  return imported.entries.every((entry, index) => {
    const existingEntry = existing.entries[index];
    return (
      entry.accountNumber.trim() === existingEntry.accountNumber.trim() &&
      entry.debit === existingEntry.debit &&
      toCents(entry.amount) === toCents(existingEntry.amount) &&
      normalizeDuplicateText(entry.description) ===
        normalizeDuplicateText(existingEntry.description)
    );
  });
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
      'No text could be read from the PDF for GPT parsing',
      400,
    );
  }

  return text.slice(0, MAX_PDF_TEXT_CHARS);
}

async function requestDocumentJson(params: {
  fileName: string;
  extractedText: string;
  accounts: Account[];
}): Promise<string> {
  const env = getEnv();
  if (!env.OPENAI_API_KEY) {
    throw new ApiRouteError(
      'OPENAI_API_KEY is missing from server environment variables',
      500,
    );
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.OPENAI_DOCUMENT_IMPORT_MODEL ?? DEFAULT_DOCUMENT_IMPORT_MODEL,
      reasoning: { effort: 'low' },
      store: false,
      text: {
        format: {
          type: 'json_schema',
          name: 'document_import',
          strict: true,
          schema: DOCUMENT_JSON_SCHEMA,
        },
      },
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: DOCUMENT_IMPORT_SYSTEM_PROMPT }],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `PDF filename: ${params.fileName}`,
            },
            {
              type: 'input_text',
              text: `Chart of accounts JSON:\n${buildAccountsPrompt(params.accounts)}`,
            },
            {
              type: 'input_text',
              text: params.extractedText,
            },
          ],
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

export async function extractImportedDocumentFromPdf(params: {
  fileName: string;
  buffer: Buffer;
  accounts: Account[];
}): Promise<ImportedDocument> {
  const extractedText = await extractPdfText(params.buffer);
  const jsonText = await requestDocumentJson({
    fileName: params.fileName,
    extractedText,
    accounts: params.accounts,
  });
  const parsed = parseAiPayload(jsonText);
  return normalizeImportedDocument(parsed, params.accounts);
}

export function sanitizeImportedDocumentPdfName(fileName: string): string {
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

  return asciiName || 'tosite';
}
