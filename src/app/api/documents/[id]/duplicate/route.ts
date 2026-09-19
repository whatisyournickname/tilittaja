import { NextRequest } from 'next/server';
import { duplicateDocumentAction } from '@/actions/app-actions';
import { jsonActionRoute, requireRouteId } from '@/lib/api-helpers';
import type { RouteIdParams } from '@/lib/types';

export const POST = jsonActionRoute(async (
  _request: NextRequest,
  { params }: RouteIdParams,
) => {
  const documentId = await requireRouteId(params, 'tositteen tunniste');
  return duplicateDocumentAction(documentId);
}, 'Failed to copy document');
