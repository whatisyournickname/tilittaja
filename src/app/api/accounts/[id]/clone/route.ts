import { NextRequest } from 'next/server';
import { cloneAccountAction } from '@/actions/app-actions';
import {
  jsonActionRoute,
  readRequestJson,
  requireRouteId,
} from '@/lib/api-helpers';
import type { RouteIdParams } from '@/lib/types';

export const POST = jsonActionRoute(async (
  request: NextRequest,
  { params }: RouteIdParams,
) => {
  const sourceId = await requireRouteId(params, 'tilin tunniste');
  const body = await readRequestJson(request);
  return cloneAccountAction(sourceId, body);
}, 'Failed to clone account', { status: 201 });
