import { NextRequest } from 'next/server';
import { updateCompanyInfoAction } from '@/actions/app-actions';
import { jsonActionRoute, readRequestJson } from '@/lib/api-helpers';

export const POST = jsonActionRoute(async (request: NextRequest) => {
  const body = await readRequestJson(request);
  return updateCompanyInfoAction(body);
}, 'Failed to save company info');
