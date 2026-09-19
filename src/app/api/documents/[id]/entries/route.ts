import { NextRequest } from 'next/server';
import { saveDocumentEntriesAction } from '@/actions/app-actions';
import {
  jsonActionRoute,
  readOptionalRequestJson,
  requireRouteId,
} from '@/lib/api-helpers';
import type { RouteIdParams } from '@/lib/types';

export const PATCH = jsonActionRoute(async (
  request: NextRequest,
  { params }: RouteIdParams,
) => {
  const documentId = await requireRouteId(params, 'tositteen tunniste');
  const body = await readOptionalRequestJson(request);
  return saveDocumentEntriesAction(documentId, body);
}, 'Failed to update entry amounts');
