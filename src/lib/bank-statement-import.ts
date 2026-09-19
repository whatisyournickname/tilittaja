import { createRequire } from 'module';
import path from 'path';
import { z } from 'zod';
import { ApiRouteError, readJsonResponse } from '@/lib/api-helpers';
import { getEnv } from '@/lib/env';
import type {
  PdfParseConstructor,
  PdfParseResult,
} from '@/lib/pdf-parse-types';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_BANK_STATEMENT_MODEL = 'gpt-5.4-mini';
const MAX_PDF_TEXT_CHARS = 120_000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const aiEntrySchema = z.object({
  entryDate: z.string().regex(ISO_DATE_PATTERN),
  valueDate: z.string().regex(ISO_DATE_PATTERN).nullable(),
  archiveId: z.string().nullable(),
  counterparty: z.string().nullable(),
  counterpartyIban: z.string().nullable(),
  reference: z.string().nullable(),
  message: z.string().nullable(),
  paymentType: z.string().nullable(),
  transactionNumber: z.number().int().nullable(),
  amount: z.number().finite(),
});

const aiBankStatementSchema = z.object({
  iban: z.string().nullable(),
  periodStart: z.string().regex(ISO_DATE_PATTERN),
  periodEnd: z.string().regex(ISO_DATE_PATTERN),
  openingBalance: z.number().finite().nullable(),
  closingBalance: z.number().finite().nullable(),
  entries: z.array(aiEntrySchema).min(1),
});

type AiBankStatement = z.infer<typeof aiBankStatementSchema>;

interface ImportedBankStatementEntry {
  entryDate: number;
  valueDate: number | null;
  archiveId: string;
  counterparty: string;
  counterpartyIban: string | null;
  reference: string | null;
  message: string | null;
  paymentType: string;
  transactionNumber: number;
  amount: number;
}

interface ImportedBankStatement {
  iban: string;
  periodStart: number;
  periodEnd: number;
  openingBalance: number;
  closingBalance: number;
  entries: ImportedBankStatementEntry[];
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
    PDFParse?: PdfParseConstructor & {
      setWorker?: (workerSrc?: string) => string;
    };
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

const BANK_STATEMENT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'iban',
    'periodStart',
    'periodEnd',
    'openingBalance',
    'closingBalance',
    'entries',
  ],
  properties: {
    iban: {
      type: ['string', 'null'],
      description: 'Statement IBAN if visible in the PDF, otherwise null.',
    },
    periodStart: {
      type: 'string',
      description:
        'First date on the statement as YYYY-MM-DD. Must be a full ISO date.',
    },
    periodEnd: {
      type: 'string',
      description:
        'Last date on the statement as YYYY-MM-DD. Must be a full ISO date.',
    },
    openingBalance: {
      type: ['number', 'null'],
      description: 'Opening balance in euros, or null if unavailable.',
    },
    closingBalance: {
      type: ['number', 'null'],
      description: 'Closing balance in euros, or null if unavailable.',
    },
    entries: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'entryDate',
          'valueDate',
          'archiveId',
          'counterparty',
          'counterpartyIban',
          'reference',
          'message',
          'paymentType',
          'transactionNumber',
          'amount',
        ],
        properties: {
          entryDate: {
            type: 'string',
            description:
              'Booking date for the entry as YYYY-MM-DD. Must be a full ISO date.',
          },
          valueDate: {
            type: ['string', 'null'],
            description:
              'Value date as YYYY-MM-DD when visible, otherwise null.',
          },
          archiveId: {
            type: ['string', 'null'],
            description:
              'Unique archive or transaction identifier from the statement, otherwise null.',
          },
          counterparty: {
            type: ['string', 'null'],
            description:
              'Counterparty or payer/payee name. Use null if missing.',
          },
          counterpartyIban: {
            type: ['string', 'null'],
            description: 'Counterparty IBAN when visible, otherwise null.',
          },
          reference: {
            type: ['string', 'null'],
            description:
              'Structured payment reference if visible, otherwise null.',
          },
          message: {
            type: ['string', 'null'],
            description:
              'Free-text payment message or explanation, otherwise null.',
          },
          paymentType: {
            type: ['string', 'null'],
            description:
              'Short payment type label from the statement, otherwise null.',
          },
          transactionNumber: {
            type: ['integer', 'null'],
            description:
              'Entry order or printed transaction number when visible, otherwise null.',
          },
          amount: {
            type: 'number',
            description:
              'Signed amount in euros. Positive means money in, negative means money out.',
          },
        },
      },
    },
  },
} as const;

const BANK_STATEMENT_SYSTEM_PROMPT = [
  'Extract structured data from one Finnish bank statement PDF.',
  'Return only the requested JSON schema.',
  'Use YYYY-MM-DD dates.',
  'Use signed euro amounts: positive for incoming money, negative for outgoing money.',
  'Preserve the original entry order from the statement.',
  'Do not invent missing values. Use null when a field is not visible.',
  'Keep text concise and copied from the statement where possible.',
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

function shouldUsePlaywrightBankStatementFixture(fileName: string): boolean {
  return (
    process.env.PLAYWRIGHT_BANK_STATEMENT_IMPORT_FIXTURE === '1' ||
    fileName.toLowerCase().startsWith('playwright-bank-statement')
  );
}

function buildPlaywrightBankStatementFixture(): ImportedBankStatement {
  const year = new Date().getUTCFullYear();
  const runToken = Date.now().toString(36);
  return normalizeImportedBankStatement({
    iban: 'FI55 1234 5600 7777 88',
    periodStart: `${year}-04-01`,
    periodEnd: `${year}-04-30`,
    openingBalance: 1000,
    closingBalance: 1225.5,
    entries: [
      {
        entryDate: `${year}-04-02`,
        valueDate: `${year}-04-02`,
        archiveId: `PW-BS-${year}-04-001-${runToken}`,
        counterparty: 'Playwright Asiakas Oy',
        counterpartyIban: 'FI84 1234 5600 1234 56',
        reference: '4001',
        message: 'Playwright testimaksu',
        paymentType: 'Tilisiirto',
        transactionNumber: 1,
        amount: 300,
      },
      {
        entryDate: `${year}-04-03`,
        valueDate: `${year}-04-03`,
        archiveId: `PW-BS-${year}-04-002-${runToken}`,
        counterparty: 'Playwright Kulut Oy',
        counterpartyIban: null,
        reference: null,
        message: 'Playwright palvelumaksu',
        paymentType: 'Korttimaksu',
        transactionNumber: 2,
        amount: -74.5,
      },
    ],
  });
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

  throw new ApiRouteError('GPT did not return parseable bank statement data', 502);
}

function parseAiPayload(jsonText: string): AiBankStatement {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonText);
  } catch {
    throw new ApiRouteError('GPT returned invalid JSON data', 502);
  }

  return aiBankStatementSchema.parse(parsedJson);
}

export function normalizeImportedBankStatement(
  payload: AiBankStatement,
): ImportedBankStatement {
  const periodStart = parseIsoDate(payload.periodStart, 'periodStart');
  const periodEnd = parseIsoDate(payload.periodEnd, 'periodEnd');

  if (periodEnd < periodStart) {
    throw new ApiRouteError(
      'GPT returned an end date for the bank statement before the start date',
      502,
    );
  }

  return {
    iban: normalizeOptionalText(payload.iban) ?? '',
    periodStart,
    periodEnd,
    openingBalance: payload.openingBalance ?? 0,
    closingBalance: payload.closingBalance ?? 0,
    entries: payload.entries.map((entry, index) => ({
      entryDate: parseIsoDate(entry.entryDate, `entries[${index}].entryDate`),
      valueDate: entry.valueDate
        ? parseIsoDate(entry.valueDate, `entries[${index}].valueDate`)
        : null,
      archiveId: normalizeOptionalText(entry.archiveId) ?? '',
      counterparty: normalizeOptionalText(entry.counterparty) ?? '',
      counterpartyIban: normalizeOptionalText(entry.counterpartyIban),
      reference: normalizeOptionalText(entry.reference),
      message: normalizeOptionalText(entry.message),
      paymentType: normalizeOptionalText(entry.paymentType) ?? '',
      transactionNumber: entry.transactionNumber ?? index + 1,
      amount: entry.amount,
    })),
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
      'No text could be read from the PDF for GPT parsing',
      400,
    );
  }

  return text.slice(0, MAX_PDF_TEXT_CHARS);
}

async function requestBankStatementJson(
  fileName: string,
  extractedText: string,
): Promise<string> {
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
      model: env.OPENAI_BANK_STATEMENT_MODEL ?? DEFAULT_BANK_STATEMENT_MODEL,
      reasoning: { effort: 'low' },
      store: false,
      text: {
        format: {
          type: 'json_schema',
          name: 'bank_statement_import',
          strict: true,
          schema: BANK_STATEMENT_JSON_SCHEMA,
        },
      },
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: BANK_STATEMENT_SYSTEM_PROMPT }],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `PDF filename: ${fileName}`,
            },
            {
              type: 'input_text',
              text: extractedText,
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

export async function extractImportedBankStatementFromPdf(params: {
  fileName: string;
  buffer: Buffer;
}): Promise<ImportedBankStatement> {
  if (shouldUsePlaywrightBankStatementFixture(params.fileName)) {
    return buildPlaywrightBankStatementFixture();
  }

  const extractedText = await extractPdfText(params.buffer);
  const jsonText = await requestBankStatementJson(
    params.fileName,
    extractedText,
  );
  const parsed = parseAiPayload(jsonText);
  return normalizeImportedBankStatement(parsed);
}

export function sanitizeImportedBankStatementPdfName(fileName: string): string {
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

  return asciiName || 'tiliote';
}
