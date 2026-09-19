import { NextRequest } from 'next/server';
import { createBankStatementDocumentsAction } from '@/actions/app-actions';
import {
  jsonActionRoute,
  readOptionalRequestJson,
  requireRouteId,
} from '@/lib/api-helpers';
import type { RouteIdParams } from '@/lib/types';

export const POST = jsonActionRoute(async (
  request: NextRequest,
  { params }: RouteIdParams,
) => {
  const statementId = await requireRouteId(params, 'tiliote');
  const body = await readOptionalRequestJson(request);
  return createBankStatementDocumentsAction({
    statementId,
    entryIds: (body as { entryIds?: unknown } | null)?.entryIds,
  });
}, 'Failed to create documents');
