import { NextRequest } from 'next/server';
import { withDb, jsonError } from '@/lib/api-helpers';
import { buildMaterialPdf, isMaterialKind } from '@/lib/financial-statement-materials';
import { pdfResponse } from '@/lib/pdf/pdf-response';

export const runtime = 'nodejs';

export const GET = withDb(async (request: NextRequest) => {
  const periodParam = request.nextUrl.searchParams.get('period') || '';
  const kindParam = request.nextUrl.searchParams.get('kind') || '';
  const preview = request.nextUrl.searchParams.get('preview') === '1';

  if (!isMaterialKind(kindParam)) {
    return jsonError(
      'Invalid material. Use kind parameter: general-ledger, journal, balance-sheet-detailed, balance-sheet-broad or income-statement-broad.',
      400,
    );
  }

  const periodId = periodParam ? Number(periodParam) : undefined;
  const { buffer, filename } = await buildMaterialPdf(kindParam, periodId);

  return pdfResponse(buffer, filename, { inline: preview });
}, 'Material PDF export failed.');
