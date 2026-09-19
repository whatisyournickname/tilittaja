import { NextRequest, NextResponse } from 'next/server';
import { updateTilinpaatosMetadataAction } from '@/actions/app-actions';
import { getTilinpaatosMetadataDefaults } from '@/lib/tilinpaatos';
import {
  jsonActionRoute,
  readRequestJson,
  withDb,
} from '@/lib/api-helpers';
import type { TilinpaatosMetadata } from '@/lib/tilinpaatos';

export const GET = withDb(async () => {
  const defaults = getTilinpaatosMetadataDefaults();
  return NextResponse.json({ defaults });
}, 'Tilinpäätösasetusten haku epäonnistui');

export const POST = jsonActionRoute(async (request: NextRequest) => {
  const body = await readRequestJson<Partial<TilinpaatosMetadata>>(request);
  return updateTilinpaatosMetadataAction(body);
}, 'Tilinpäätösasetusten tallennus epäonnistui');
