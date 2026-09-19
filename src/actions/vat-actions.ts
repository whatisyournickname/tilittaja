'use server';

import {
  createDocument,
  createEntry,
  getAccounts,
  getEntriesForPeriod,
  updateDocumentMetadata,
} from '@/lib/db';
import { revalidateApp, runDbAction } from '@/actions/_helpers';
import { vatSettlementSchema } from '@/lib/validation';
import { requireUnlockedTargetPeriod } from '@/lib/period-locks';
import { buildVatSettlementPreview } from '@/lib/vat-report';
import { ApiRouteError } from '@/lib/api-helpers';

export async function createVatSettlementAction(input: unknown) {
  const parsed = vatSettlementSchema.parse(input);

  return runDbAction(() => {
    const accounts = getAccounts();
    const entries = getEntriesForPeriod(parsed.periodId);
    const preview = buildVatSettlementPreview(entries, accounts);

    if (!preview) {
      throw new ApiRouteError(
        'VAT accounts have no transferable balance or settlement account is missing.',
      );
    }

    requireUnlockedTargetPeriod(parsed.periodId, parsed.date);
    const document = createDocument(parsed.periodId, parsed.date);
    let rowNumber = 1;

    for (const line of preview.sourceLines) {
      createEntry(
        document.id,
        line.accountId,
        line.debit,
        line.amount,
        'ALV-ilmoitus',
        rowNumber,
      );
      rowNumber += 1;
    }

    createEntry(
      document.id,
      preview.settlementAccountId,
      preview.settlementDebit,
      preview.settlementAmount,
      'ALV-ilmoitus',
      rowNumber,
    );

    updateDocumentMetadata(document.id, 'ALV', 'ALV-ilmoitus');
    revalidateApp();
    return { id: document.id, number: document.number };
  }, 'Failed to generate VAT return.');
}
