import { NextRequest } from 'next/server';
import { createVatSettlementAction } from '@/actions/app-actions';
import {
  jsonActionRoute,
  readOptionalRequestJson,
} from '@/lib/api-helpers';

export const POST = jsonActionRoute(async (request: NextRequest) => {
  const body = await readOptionalRequestJson(request);
  return createVatSettlementAction(body);
}, 'Failed to generate VAT return.');
