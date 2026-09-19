import { NextRequest } from 'next/server';
import {
  updateEntryAccountAction,
  updateEntryDescriptionAction,
} from '@/actions/app-actions';
import {
  ApiRouteError,
  jsonActionRoute,
  readOptionalRequestJson,
  requireRouteId,
} from '@/lib/api-helpers';
import type { RouteIdParams } from '@/lib/types';

export const PATCH = jsonActionRoute(async (
  request: NextRequest,
  { params }: RouteIdParams,
) => {
  const entryId = await requireRouteId(params, 'entry identifier');
  const body = (await readOptionalRequestJson(request)) as {
    description?: unknown;
    accountId?: unknown;
  } | null;
  const description = body?.description;
  const accountId = body?.accountId;
  const hasDescription = typeof description === 'string';
  const normalizedAccountId =
    typeof accountId === 'number' && Number.isInteger(accountId) && accountId > 0
      ? accountId
      : undefined;
  const hasAccountId = normalizedAccountId !== undefined;

  if (!hasDescription && !hasAccountId) {
    throw new ApiRouteError('Anna joko kuvaus tai tili', 400);
  }

  let nextDescription: string | undefined;
  let nextAccountId: number | undefined;
  let accountNumber: string | undefined;
  let accountName: string | undefined;

  if (hasDescription) {
    const payload = await updateEntryDescriptionAction(entryId, {
      description,
    });
    nextDescription = payload.description;
  }

  if (hasAccountId) {
    const payload = await updateEntryAccountAction(entryId, {
      accountId: normalizedAccountId,
    });
    nextAccountId = payload.accountId;
    accountNumber = payload.accountNumber;
    accountName = payload.accountName;
  }

  return {
    id: entryId,
    description: nextDescription,
    accountId: nextAccountId,
    accountNumber,
    accountName,
  };
}, 'Failed to update entry row');
