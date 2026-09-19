import { NextRequest, NextResponse } from 'next/server';
import { updateFinancialStatementMetadataAction } from '@/actions/app-actions';
import { getFinancialStatementMetadataDefaults } from '@/lib/financial-statement';
import {
  jsonActionRoute,
  readRequestJson,
  withDb,
} from '@/lib/api-helpers';
import type { FinancialStatementMetadata } from '@/lib/financial-statement';

export const GET = withDb(async () => {
  const defaults = getFinancialStatementMetadataDefaults();
  return NextResponse.json({ defaults });
}, 'Failed to load financial statement settings');

export const POST = jsonActionRoute(async (request: NextRequest) => {
  const body = await readRequestJson<Partial<FinancialStatementMetadata>>(request);
  return updateFinancialStatementMetadataAction(body);
}, 'Failed to save financial statement settings');
