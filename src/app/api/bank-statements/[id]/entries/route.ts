import { NextRequest, NextResponse } from 'next/server';
import { getDocument, updateBankStatementEntry } from '@/lib/db';
import { withDb, requireResource } from '@/lib/api-helpers';
import {
  requireUnlockedBankStatementEntryPeriod,
  requireUnlockedDocumentPeriodById,
} from '@/lib/period-locks';
import { bankStatementEntryPatchSchema } from '@/lib/validation';
import type { RouteIdParams } from '@/lib/types';

export const PUT = withDb(
  async (request: NextRequest, { params }: RouteIdParams) => {
    await params;
    const body = await request.json();
    const parsed = bankStatementEntryPatchSchema.parse(body);

    requireUnlockedBankStatementEntryPeriod(parsed.entryId);

    if (parsed.documentId !== undefined && parsed.documentId !== null) {
      requireResource(
        getDocument(parsed.documentId),
        'Document not found',
      );
      requireUnlockedDocumentPeriodById(parsed.documentId);
    }

    updateBankStatementEntry(parsed.entryId, {
      counterpart_account_id:
        parsed.counterpartAccountId === undefined
          ? undefined
          : (parsed.counterpartAccountId ?? null),
      document_id:
        parsed.documentId === undefined
          ? undefined
          : (parsed.documentId ?? null),
    });

    return NextResponse.json({ ok: true });
  },
  'Update failed',
);
