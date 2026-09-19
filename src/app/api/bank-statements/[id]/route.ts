import { NextResponse } from 'next/server';
import { deleteBankStatement } from '@/lib/db';
import { withDb, requireRouteId, jsonError } from '@/lib/api-helpers';
import { requireUnlockedBankStatementPeriod } from '@/lib/period-locks';
import type { RouteIdParams } from '@/lib/types';

export const DELETE = withDb(
  async (_request: Request, { params }: RouteIdParams) => {
    const statementId = await requireRouteId(params, 'tiliote');
    requireUnlockedBankStatementPeriod(statementId);

    const deleted = deleteBankStatement(statementId);

    if (!deleted) {
      return jsonError('Bank statement not found', 404);
    }

    return NextResponse.json({ ok: true });
  },
  'Failed to delete bank statement',
);
