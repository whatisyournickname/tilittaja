import { z } from 'zod';
import { ApiRouteError, readJsonResponse } from '@/lib/api-helpers';
import { getEnv } from '@/lib/env';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_BANK_STATEMENT_LINK_MODEL = 'gpt-5.4-mini';
const MAX_CANDIDATES_PER_ENTRY = 8;
const FALLBACK_CANDIDATES_PER_ENTRY = 5;

const aiSuggestionSchema = z.object({
  entryId: z.number().int().positive(),
  documentId: z.number().int().positive().nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
  rationale: z.string().trim().min(1).max(240),
});

const aiSuggestionResponseSchema = z.object({
  suggestions: z.array(aiSuggestionSchema),
});

export interface BankStatementSuggestionEntryInput {
  id: number;
  entryDate: number;
  amount: number;
  counterparty: string;
  reference: string | null;
  message: string | null;
}

export interface BankStatementSuggestionDocumentInput {
  id: number;
  number: number;
  date: number;
  category: string;
  name: string;
  totalDebit: number;
  totalCredit: number;
  descriptions: string[];
}

interface BankStatementDocumentLinkSuggestion {
  entryId: number;
  documentId: number | null;
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
}

interface BankStatementRecentLinkExampleInput {
  entryDate: number;
  amount: number;
  counterparty: string;
  reference: string | null;
  message: string | null;
  documentId: number;
  documentNumber: number;
  documentDate: number;
  documentCategory: string;
  documentName: string;
  documentDescriptions: string[];
}

const BANK_STATEMENT_LINK_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['suggestions'],
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['entryId', 'documentId', 'confidence', 'rationale'],
        properties: {
          entryId: {
            type: 'integer',
            description: 'The bank statement entry id you are evaluating.',
          },
          documentId: {
            type: ['integer', 'null'],
            description:
              'Suggested existing document id from the provided candidate list, or null when no convincing match exists.',
          },
          confidence: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
          },
          rationale: {
            type: 'string',
            description:
              'Short Finnish explanation for why the match fits or why no suggestion was made.',
          },
        },
      },
    },
  },
} as const;

const BANK_STATEMENT_LINK_SYSTEM_PROMPT = [
  'Match Finnish bank statement entries to already existing bookkeeping documents (tosite).',
  'Return only the requested JSON schema.',
  'Use only document ids that appear inside each entry candidate list.',
  'If none of the candidates are convincing, return documentId as null.',
  'Prefer exact amount matches, close dates, and matching counterparty or description text.',
  'When multiple otherwise similar candidates exist for different months, prefer the document from the same calendar month as the bank statement entry.',
  'Use earlier resolved links from the same tilikausi as supporting examples when they clearly resemble the current entry.',
  'Treat earlier resolved links only as hints, not as extra candidates.',
  'Use confidence high only when the evidence is strong.',
  'Keep rationale brief, concrete, and in Finnish.',
  'Avoid reusing the same document for multiple entries unless the evidence clearly supports it.',
].join(' ');

function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase();
}

function tokenize(value: string): string[] {
  const stopWords = new Set([
    'oy',
    'oyj',
    'ab',
    'ltd',
    'the',
    'and',
    'tai',
    'and',
    'tili',
    'tilisiirto',
    'payment',
    'maksu',
    'palvelumaksu',
    'invoice',
    'lasku',
    'e',
    'faktura',
    'notprovided',
  ]);

  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !stopWords.has(token));
}

function formatIsoDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function monthKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function isSameCalendarMonth(left: number, right: number): boolean {
  return monthKey(left) === monthKey(right);
}

function countOverlap(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  return left.filter((token) => rightSet.has(token)).length;
}

function getDocumentTotal(document: BankStatementSuggestionDocumentInput): number {
  return Math.max(document.totalDebit, document.totalCredit);
}

function scoreCandidateDocument(
  entry: BankStatementSuggestionEntryInput,
  document: BankStatementSuggestionDocumentInput,
): number {
  let score = 0;
  const amountDifference = Math.abs(getDocumentTotal(document) - Math.abs(entry.amount));
  const dateDifferenceDays = Math.abs(document.date - entry.entryDate) / 86_400_000;
  const entryTokens = tokenize(
    [entry.counterparty, entry.message, entry.reference].filter(Boolean).join(' '),
  );
  const documentTokens = tokenize(
    [document.category, document.name, ...document.descriptions].join(' '),
  );
  const tokenOverlap = countOverlap(entryTokens, documentTokens);

  if (amountDifference < 0.01) score += 12;
  else if (amountDifference <= 1) score += 6;
  else if (amountDifference <= 5) score += 3;

  if (dateDifferenceDays <= 3) score += 5;
  else if (dateDifferenceDays <= 14) score += 3;
  else if (dateDifferenceDays <= 31) score += 1;

  score += Math.min(tokenOverlap * 2, 8);

  const normalizedCounterparty = normalizeText(entry.counterparty);
  const normalizedDocumentText = normalizeText(
    [document.category, document.name, ...document.descriptions].join(' '),
  );
  if (
    normalizedCounterparty &&
    normalizedDocumentText &&
    normalizedDocumentText.includes(normalizedCounterparty)
  ) {
    score += 3;
  }

  return score;
}

export function buildCandidateDocumentsForEntries(
  entries: BankStatementSuggestionEntryInput[],
  documents: BankStatementSuggestionDocumentInput[],
): Map<number, BankStatementSuggestionDocumentInput[]> {
  return new Map(
    entries.map((entry) => {
      const scored = documents
        .map((document) => ({
          document,
          score: scoreCandidateDocument(entry, document),
        }))
        .sort((left, right) => {
          if (right.score !== left.score) return right.score - left.score;

          const leftAmountDifference = Math.abs(
            getDocumentTotal(left.document) - Math.abs(entry.amount),
          );
          const rightAmountDifference = Math.abs(
            getDocumentTotal(right.document) - Math.abs(entry.amount),
          );
          if (leftAmountDifference !== rightAmountDifference) {
            return leftAmountDifference - rightAmountDifference;
          }

          return (
            Math.abs(left.document.date - entry.entryDate) -
            Math.abs(right.document.date - entry.entryDate)
          );
        });

      const positiveCandidates = scored.filter((candidate) => candidate.score > 0);
      const topPositiveScore = positiveCandidates[0]?.score ?? 0;
      const sameMonthCompetitiveCandidates = positiveCandidates.filter(
        (candidate) =>
          isSameCalendarMonth(candidate.document.date, entry.entryDate) &&
          candidate.score >= topPositiveScore - 2,
      );
      const prioritizedPositiveCandidates =
        sameMonthCompetitiveCandidates.length > 0
          ? sameMonthCompetitiveCandidates
          : positiveCandidates;

      const strongCandidates = prioritizedPositiveCandidates
        .slice(0, MAX_CANDIDATES_PER_ENTRY)
        .map((candidate) => candidate.document);

      if (strongCandidates.length > 0) {
        return [entry.id, strongCandidates] as const;
      }

      const fallbackCandidates = [...documents]
        .sort((left, right) => {
          const leftAmountDifference = Math.abs(
            getDocumentTotal(left) - Math.abs(entry.amount),
          );
          const rightAmountDifference = Math.abs(
            getDocumentTotal(right) - Math.abs(entry.amount),
          );
          if (leftAmountDifference !== rightAmountDifference) {
            return leftAmountDifference - rightAmountDifference;
          }

          return (
            Math.abs(left.date - entry.entryDate) -
            Math.abs(right.date - entry.entryDate)
          );
        })
        .slice(0, FALLBACK_CANDIDATES_PER_ENTRY);

      return [entry.id, fallbackCandidates] as const;
    }),
  );
}

export function buildSuggestionPromptPayload(params: {
  statement: {
    id: number;
    accountNumber: string;
    accountName: string;
    periodStart: number;
    periodEnd: number;
  };
  entries: BankStatementSuggestionEntryInput[];
  candidatesByEntryId: Map<number, BankStatementSuggestionDocumentInput[]>;
  previousLinkExamples?: BankStatementRecentLinkExampleInput[];
}) {
  return {
    statement: {
      id: params.statement.id,
      accountNumber: params.statement.accountNumber,
      accountName: params.statement.accountName,
      periodStart: formatIsoDate(params.statement.periodStart),
      periodEnd: formatIsoDate(params.statement.periodEnd),
    },
    previousResolvedLinks: (params.previousLinkExamples ?? []).map((example) => ({
      date: formatIsoDate(example.entryDate),
      amount: example.amount,
      counterparty: example.counterparty,
      reference: example.reference,
      message: example.message,
      linkedDocument: {
        documentId: example.documentId,
        number: example.documentNumber,
        date: formatIsoDate(example.documentDate),
        category: example.documentCategory,
        name: example.documentName,
        descriptions: example.documentDescriptions,
      },
    })),
    entries: params.entries.map((entry) => ({
      entryId: entry.id,
      date: formatIsoDate(entry.entryDate),
      amount: entry.amount,
      counterparty: entry.counterparty,
      reference: entry.reference,
      message: entry.message,
      candidates: (params.candidatesByEntryId.get(entry.id) ?? []).map((document) => ({
        documentId: document.id,
        number: document.number,
        date: formatIsoDate(document.date),
        category: document.category,
        name: document.name,
        totalAmount: getDocumentTotal(document),
        descriptions: document.descriptions,
      })),
    })),
  };
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

  throw new ApiRouteError('GPT did not return a parseable linking suggestion', 502);
}

function parseAiSuggestionPayload(jsonText: string): z.infer<typeof aiSuggestionResponseSchema> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonText);
  } catch {
    throw new ApiRouteError('GPT returned invalid JSON data', 502);
  }

  return aiSuggestionResponseSchema.parse(parsedJson);
}

function normalizeSuggestions(params: {
  entries: BankStatementSuggestionEntryInput[];
  candidatesByEntryId: Map<number, BankStatementSuggestionDocumentInput[]>;
  rawSuggestions: z.infer<typeof aiSuggestionResponseSchema>['suggestions'];
}): BankStatementDocumentLinkSuggestion[] {
  const rawSuggestionByEntryId = new Map(
    params.rawSuggestions.map((suggestion) => [suggestion.entryId, suggestion]),
  );

  return params.entries.map((entry) => {
    const rawSuggestion = rawSuggestionByEntryId.get(entry.id);
    if (!rawSuggestion) {
      return {
        entryId: entry.id,
        documentId: null,
        confidence: 'low' as const,
        rationale: 'AI did not find a confident document for this row.',
      };
    }

    const candidateIds = new Set(
      (params.candidatesByEntryId.get(entry.id) ?? []).map((document) => document.id),
    );
    if (
      rawSuggestion.documentId != null &&
      !candidateIds.has(rawSuggestion.documentId)
    ) {
      return {
        entryId: entry.id,
        documentId: null,
        confidence: 'low' as const,
        rationale: 'AI suggested a document outside the selection, so the suggestion was rejected.',
      };
    }

    return rawSuggestion;
  });
}

async function requestSuggestionJson(params: {
  statement: {
    id: number;
    accountNumber: string;
    accountName: string;
    periodStart: number;
    periodEnd: number;
  };
  entries: BankStatementSuggestionEntryInput[];
  candidatesByEntryId: Map<number, BankStatementSuggestionDocumentInput[]>;
  previousLinkExamples?: BankStatementRecentLinkExampleInput[];
}): Promise<string> {
  const env = getEnv();
  if (!env.OPENAI_API_KEY) {
    throw new ApiRouteError(
      'OPENAI_API_KEY is missing from server environment variables',
      500,
    );
  }

  const promptPayload = buildSuggestionPromptPayload({
    statement: params.statement,
    entries: params.entries,
    candidatesByEntryId: params.candidatesByEntryId,
    previousLinkExamples: params.previousLinkExamples,
  });

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.OPENAI_BANK_STATEMENT_MODEL ?? DEFAULT_BANK_STATEMENT_LINK_MODEL,
      reasoning: { effort: 'low' },
      store: false,
      text: {
        format: {
          type: 'json_schema',
          name: 'bank_statement_document_linking',
          strict: true,
          schema: BANK_STATEMENT_LINK_JSON_SCHEMA,
        },
      },
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: BANK_STATEMENT_LINK_SYSTEM_PROMPT }],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify(promptPayload, null, 2),
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
        : 'OpenAI API call failed';
    throw new ApiRouteError(`AI linking failed: ${apiMessage}`, 502);
  }

  return extractResponseText(payload);
}

export async function suggestBankStatementDocumentLinks(params: {
  statement: {
    id: number;
    accountNumber: string;
    accountName: string;
    periodStart: number;
    periodEnd: number;
  };
  entries: BankStatementSuggestionEntryInput[];
  documents: BankStatementSuggestionDocumentInput[];
  previousLinkExamples?: BankStatementRecentLinkExampleInput[];
}): Promise<BankStatementDocumentLinkSuggestion[]> {
  if (params.entries.length === 0) {
    return [];
  }

  const candidatesByEntryId = buildCandidateDocumentsForEntries(
    params.entries,
    params.documents,
  );
  const jsonText = await requestSuggestionJson({
    statement: params.statement,
    entries: params.entries,
    candidatesByEntryId,
    previousLinkExamples: params.previousLinkExamples,
  });
  const parsed = parseAiSuggestionPayload(jsonText);

  return normalizeSuggestions({
    entries: params.entries,
    candidatesByEntryId,
    rawSuggestions: parsed.suggestions,
  });
}
