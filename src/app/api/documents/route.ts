import { NextRequest } from 'next/server';
import { createDocumentAction } from '@/actions/app-actions';
import { jsonActionRoute, readRequestJson } from '@/lib/api-helpers';

export const POST = jsonActionRoute(async (request: NextRequest) => {
  const body = await readRequestJson(request);
  return createDocumentAction(body);
}, 'Failed to create document');
