'use server';

import {
  createBankStatement,
  createBankStatementEntry,
  createDocumentsFromBankStatementEntries,
  deleteBankStatement,
  getAccount,
  getBankStatement,
  getBankStatementEntries,
  getBankStatements,
  getDocument,
  getDocumentMetadataMap,
  getDocuments,
  getEntriesForPeriod,
  getPeriod,
  getSettings,
  updateBankStatementEntry,
} from '@/lib/db';
import { revalidateApp, runDbAction } from '@/actions/_helpers';
import {
  bankStatementAiApplySchema,
  bankStatementAiSuggestSchema,
  bankStatementCreateDocumentsSchema,
  bankStatementEntryLinkSchema,
  bankStatementManualCreateSchema,
} from '@/lib/validation';
import { ApiRouteError, requireResource } from '@/lib/api-helpers';
import { suggestBankStatementDocumentLinks } from '@/lib/bank-statement-document-linking';
import {
  requireUnlockedBankStatementEntryPeriod,
  requireUnlockedBankStatementPeriod,
  requireUnlockedDocumentPeriodById,
  requireUnlockedExistingPeriod,
} from '@/lib/period-locks';

function normalizeHistoryText(value: string | null): string {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
    .trim();
}

function buildLinkHistoryDedupKey(link: {
  amount: number;
  counterparty: string;
  reference: string | null;
  message: string | null;
  documentCategory: string;
  documentName: string;
  documentDescriptions: string[];
}): string {
  return [
    link.amount.toFixed(2),
    normalizeHistoryText(link.counterparty),
    normalizeHistoryText(link.reference),
    normalizeHistoryText(link.message),
    normalizeHistoryText(link.documentCategory),
    normalizeHistoryText(link.documentName),
    link.documentDescriptions.map((description) => normalizeHistoryText(description)).join('|'),
  ].join('::');
}

export async function updateBankStatementEntryDocumentAction(
  statementId: number,
  input: unknown,
) {
  void statementId;
  const parsed = bankStatementEntryLinkSchema.parse(input);

  return runDbAction(() => {
    requireUnlockedBankStatementEntryPeriod(parsed.entryId);

    if (parsed.documentId !== null) {
      requireResource(getDocument(parsed.documentId), 'Document not found');
      requireUnlockedDocumentPeriodById(parsed.documentId);
    }

    updateBankStatementEntry(parsed.entryId, {
      document_id: parsed.documentId,
    });

    revalidateApp();
    return { ok: true };
  }, 'Update failed.');
}

export async function createBankStatementDocumentsAction(input: unknown) {
  const parsed = bankStatementCreateDocumentsSchema.parse(input);

  return runDbAction(() => {
    const statement = requireResource(
      getBankStatement(parsed.statementId),
      'Bank statement not found',
    );

    const settings = getSettings();
    requireUnlockedExistingPeriod(settings.current_period_id);

    const idsToProcess = parsed.entryIds.length
      ? parsed.entryIds
      : getBankStatementEntries(parsed.statementId)
          .filter((entry) => !entry.document_id && entry.counterpart_account_id)
          .map((entry) => entry.id);

    if (idsToProcess.length === 0) {
      throw new ApiRouteError('No rows to process');
    }

    const result = createDocumentsFromBankStatementEntries(
      idsToProcess,
      statement.account_id,
      settings.current_period_id,
    );

    revalidateApp();
    return result;
  }, 'Failed to create documents.');
}

export async function suggestBankStatementDocumentLinksAction(input: unknown) {
  const parsed = bankStatementAiSuggestSchema.parse(input);

  return runDbAction(async () => {
    const statement = requireResource(
      getBankStatement(parsed.statementId),
      'Bank statement not found',
    );
    const settings = getSettings();
    const statementEntries = getBankStatementEntries(parsed.statementId).filter(
      (entry) => entry.document_id == null,
    );
    const requestedEntryIds = new Set(parsed.entryIds);
    const targetEntries =
      requestedEntryIds.size > 0
        ? statementEntries.filter((entry) => requestedEntryIds.has(entry.id))
        : statementEntries;

    if (targetEntries.length === 0) {
      return { suggestions: [] };
    }

    const documents = getDocuments(settings.current_period_id);
    const documentEntries = getEntriesForPeriod(settings.current_period_id);
    const metadataByDocumentId = getDocumentMetadataMap(
      documents.map((document) => document.id),
    );

    const entriesByDocumentId = new Map<
      number,
      Array<{ amount: number; debit: boolean; description: string }>
    >();
    documentEntries.forEach((entry) => {
      const current = entriesByDocumentId.get(entry.document_id) ?? [];
      current.push({
        amount: entry.amount,
        debit: entry.debit,
        description: entry.description,
      });
      entriesByDocumentId.set(entry.document_id, current);
    });

    const documentSummaries = documents.map((document) => {
      const metadata = metadataByDocumentId.get(document.id);
      const linkedEntries = entriesByDocumentId.get(document.id) ?? [];
      const descriptions = [...new Set(linkedEntries.map((entry) => entry.description.trim()))]
        .filter(Boolean)
        .slice(0, 3);

      return {
        id: document.id,
        number: document.number,
        date: document.date,
        category: metadata?.category ?? '',
        name: metadata?.name ?? '',
        totalDebit: linkedEntries
          .filter((entry) => entry.debit)
          .reduce((sum, entry) => sum + entry.amount, 0),
        totalCredit: linkedEntries
          .filter((entry) => !entry.debit)
          .reduce((sum, entry) => sum + entry.amount, 0),
        descriptions,
      };
    });
    const documentSummaryById = new Map(
      documentSummaries.map((document) => [document.id, document]),
    );
    const currentPeriod = requireResource(
      getPeriod(settings.current_period_id),
      'Period not found',
    );
    const previousLinkExamples = getBankStatements({
      periodStart: currentPeriod.start_date,
      periodEnd: currentPeriod.end_date,
    })
      .filter(
        (candidate) =>
          candidate.account_id === statement.account_id &&
          candidate.id !== statement.id &&
          candidate.period_end < statement.period_start,
      )
      .flatMap((candidate) =>
        getBankStatementEntries(candidate.id).map((entry) => ({
          entry,
          statementEnd: candidate.period_end,
        })),
      )
      .filter(({ entry }) => entry.document_id != null)
      .sort((left, right) => {
        if (right.entry.entry_date !== left.entry.entry_date) {
          return right.entry.entry_date - left.entry.entry_date;
        }

        return right.statementEnd - left.statementEnd;
      })
      .flatMap(({ entry }) => {
        const document = documentSummaryById.get(entry.document_id!);
        if (!document) return [];

        return [
          {
            entryDate: entry.entry_date,
            amount: entry.amount,
            counterparty: entry.counterparty,
            reference: entry.reference,
            message: entry.message,
            documentId: document.id,
            documentNumber: document.number,
            documentDate: document.date,
            documentCategory: document.category,
            documentName: document.name,
            documentDescriptions: document.descriptions,
          },
        ];
      })
      .filter((link, index, links) => {
        const dedupKey = buildLinkHistoryDedupKey(link);
        return index === links.findIndex((candidate) => buildLinkHistoryDedupKey(candidate) === dedupKey);
      });

    const suggestions = await suggestBankStatementDocumentLinks({
      statement: {
        id: statement.id,
        accountNumber: statement.account_number,
        accountName: statement.account_name,
        periodStart: statement.period_start,
        periodEnd: statement.period_end,
      },
      entries: targetEntries.map((entry) => ({
        id: entry.id,
        entryDate: entry.entry_date,
        amount: entry.amount,
        counterparty: entry.counterparty,
        reference: entry.reference,
        message: entry.message,
      })),
      documents: documentSummaries,
      previousLinkExamples,
    });

    return {
      suggestions: suggestions.map((suggestion) => ({
        ...suggestion,
        document:
          suggestion.documentId != null
            ? documentSummaryById.get(suggestion.documentId) ?? null
            : null,
      })),
    };
  }, 'Failed to fetch AI suggestions.');
}

export async function applyBankStatementDocumentSuggestionsAction(input: unknown) {
  const parsed = bankStatementAiApplySchema.parse(input);

  return runDbAction(() => {
    const statement = requireResource(
      getBankStatement(parsed.statementId),
      'Bank statement not found',
    );
    const statementEntryIds = new Set(
      getBankStatementEntries(parsed.statementId).map((entry) => entry.id),
    );
    void statement;

    parsed.links.forEach((link) => {
      if (!statementEntryIds.has(link.entryId)) {
        throw new ApiRouteError('Tilioterivi ei kuulu valittuun tiliotteeseen', 400);
      }

      requireUnlockedBankStatementEntryPeriod(link.entryId);
      requireResource(getDocument(link.documentId), 'Document not found');
      requireUnlockedDocumentPeriodById(link.documentId);
      updateBankStatementEntry(link.entryId, {
        document_id: link.documentId,
      });
    });

    revalidateApp();
    return { linked: parsed.links.length };
  }, 'Failed to accept AI suggestions.');
}

export async function deleteBankStatementAction(statementId: number) {
  return runDbAction(() => {
    requireUnlockedBankStatementPeriod(statementId);
    const deleted = deleteBankStatement(statementId);

    if (!deleted) {
      throw new ApiRouteError('Bank statement not found', 404);
    }

    revalidateApp();
    return { ok: true };
  }, 'Failed to delete bank statement.');
}

export async function createBankStatementManualAction(input: unknown) {
  const parsed = bankStatementManualCreateSchema.parse(input);

  return runDbAction(() => {
    const account = requireResource(
      getAccount(parsed.accountId),
      'Bank account not found',
    );

    const statement = createBankStatement({
      account_id: account.id,
      iban: parsed.iban,
      period_start: parsed.periodStart,
      period_end: parsed.periodEnd,
      opening_balance: parsed.openingBalance,
      closing_balance: parsed.closingBalance,
      source_file: '',
    });

    for (let i = 0; i < parsed.entries.length; i++) {
      const entry = parsed.entries[i];
      createBankStatementEntry({
        bank_statement_id: statement.id,
        entry_date: entry.entryDate,
        value_date: entry.entryDate,
        archive_id: '',
        counterparty: entry.counterparty,
        counterparty_iban: null,
        reference: entry.reference,
        message: entry.message,
        payment_type: '',
        transaction_number: i + 1,
        amount: entry.amount,
        counterpart_account_id: null,
      });
    }

    revalidateApp();
    return { id: statement.id };
  }, 'Failed to create bank statement.');
}
