import { NextRequest } from 'next/server';
import { withDb } from '@/lib/api-helpers';
import { buildTilinpaatosPackage } from '@/lib/tilinpaatos';
import { sanitizeForFilename } from '@/lib/accounting';
import { buildYhtiokokousPdf } from '@/lib/pdf/yhtiokokous-pdf';
import { pdfResponse } from '@/lib/pdf/pdf-response';

export const runtime = 'nodejs';

export const GET = withDb(async (request: NextRequest) => {
  const period = request.nextUrl.searchParams.get('period');
  const preview = request.nextUrl.searchParams.get('preview') === '1';
  const pkg = buildTilinpaatosPackage(period ? Number(period) : undefined);

  const buffer = await buildYhtiokokousPdf(pkg);

  const companySlug = sanitizeForFilename(pkg.companyName);
  const periodSlug = `${pkg.periodStart.replaceAll('.', '')}-${pkg.periodEnd.replaceAll('.', '')}`;
  return pdfResponse(buffer, `yhtiokokous-${companySlug}-${periodSlug}.pdf`, {
    inline: preview,
  });
}, 'Yhtiökokous-PDF:n muodostus epäonnistui');
