import type { Document, Entry, Period } from '@/lib/types';
import {
  getDocument,
  getEntry,
  getPeriod,
  getPeriods,
} from '@/lib/db/documents';
import { getBankStatement, getBankStatementEntry } from '@/lib/db/bank-statements';
import { ApiRouteError, requireResource } from '@/lib/api-helpers';

export const LOCKED_PERIOD_ERROR_MESSAGE =
  'Period is locked. The period is in read-only mode.';

function requireUnlockedPeriod(
  period: Period | undefined,
  notFoundMessage: string,
): Period {
  const resolvedPeriod = requireResource(period, notFoundMessage);
  if (resolvedPeriod.locked) {
    throw new ApiRouteError(LOCKED_PERIOD_ERROR_MESSAGE, 423);
  }
  return resolvedPeriod;
}

export function resolvePeriodForDate(date: number): Period | undefined {
  return getPeriods().find(
    (period) => period.start_date <= date && period.end_date >= date,
  );
}

export function requireUnlockedExistingPeriod(periodId: number): Period {
  return requireUnlockedPeriod(getPeriod(periodId), 'Period not found');
}

export function requireUnlockedTargetPeriod(
  periodId: number,
  date: number,
): Period {
  return requireUnlockedPeriod(
    resolvePeriodForDate(date) ?? getPeriod(periodId),
    'Period not found',
  );
}

export function requireUnlockedDocumentPeriod(document: Document): Period {
  return requireUnlockedPeriod(
    getPeriod(document.period_id),
    'Document period not found',
  );
}

export function requireUnlockedDocumentPeriodById(documentId: number): Period {
  const document = requireResource(
    getDocument(documentId),
    'Document not found',
  );
  return requireUnlockedDocumentPeriod(document);
}

export function requireUnlockedEntryPeriod(entry: Entry): Period {
  const document = requireResource(
    getDocument(entry.document_id),
    'Document for entry row not found',
  );
  return requireUnlockedDocumentPeriod(document);
}

export function requireUnlockedEntryPeriodById(entryId: number): Period {
  const entry = requireResource(getEntry(entryId), 'Entry row not found');
  return requireUnlockedEntryPeriod(entry);
}

export function requireUnlockedBankStatementEntryPeriod(
  entryId: number,
): Period {
  const entry = requireResource(
    getBankStatementEntry(entryId),
    'Bank statement entry not found',
  );
  return requireUnlockedPeriod(
    resolvePeriodForDate(entry.entry_date),
    'Bank statement entry period not found',
  );
}

export function requireUnlockedBankStatementPeriod(
  statementId: number,
): Period {
  const statement = requireResource(
    getBankStatement(statementId),
    'Bank statement not found',
  );
  return requireUnlockedPeriod(
    getPeriods().find(
      (period) =>
        period.start_date <= statement.period_start &&
        period.end_date >= statement.period_end,
    ),
    'Bank statement period not found',
  );
}
