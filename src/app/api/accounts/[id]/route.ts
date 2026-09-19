import { NextRequest } from 'next/server';
import {
  deleteAccountAction,
  updateAccountAction,
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
  const accountId = await requireRouteId(params, 'tilin tunniste');
  const body = await readRequestJson(request);
  return updateAccountAction(accountId, body);
}, 'Failed to update account');

export const DELETE = jsonActionRoute(async (
  _request: NextRequest,
  { params }: RouteIdParams,
) => {
  const accountId = await requireRouteId(params, 'tilin tunniste');
  return deleteAccountAction(accountId);
}, 'Failed to delete account');
