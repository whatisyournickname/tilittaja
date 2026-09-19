import { NextRequest } from 'next/server';
import {
  deleteDocumentAction,
  updateDocumentAction,
} from '@/actions/app-actions';
import {
  jsonActionRoute,
  readRequestJson,
  requireRouteId,
} from '@/lib/api-helpers';
import type { RouteIdParams } from '@/lib/types';

export const PATCH = jsonActionRoute(async (
  request: NextRequest,
  { params }: RouteIdParams,
) => {
  const documentId = await requireRouteId(params, 'tositteen tunniste');
  const body = await readRequestJson(request);
  return updateDocumentAction(documentId, body);
}, 'Failed to update document');

export const DELETE = jsonActionRoute(async (
  _request: NextRequest,
  { params }: RouteIdParams,
) => {
  const documentId = await requireRouteId(params, 'tositteen tunniste');
  return deleteDocumentAction(documentId);
}, 'Failed to delete document');
