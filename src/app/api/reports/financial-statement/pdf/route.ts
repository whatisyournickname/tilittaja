import { NextRequest } from 'next/server';
import { withDb, jsonError } from '@/lib/api-helpers';
import { buildTilinpaatosPackage } from '@/lib/tilinpaatos';
import { sanitizeForFilename } from '@/lib/accounting';
import { buildTilinpaatosPdf } from '@/lib/pdf/tilinpaatos-pdf';
import { pdfResponse } from '@/lib/pdf/pdf-response';

export const runtime = 'nodejs';

export const GET = withDb(async (request: NextRequest) => {
  const period = request.nextUrl.searchParams.get('period');
  const preview = request.nextUrl.searchParams.get('preview') === '1';
  const packageData = buildTilinpaatosPackage(
    period ? Number(period) : undefined,
  );

  if (packageData.compliance.hardErrors > 0) {
    return jsonError(
      'PDF-vienti estetty: pakollisia tilinpäätöksen tietoja puuttuu tarkistuslistan mukaan.',
      400,
    );
  }

  const buffer = await buildTilinpaatosPdf(packageData);

  const companySlug = sanitizeForFilename(packageData.companyName);
  const periodSlug = `${packageData.periodStart.replaceAll('.', '')}-${packageData.periodEnd.replaceAll('.', '')}`;
  return pdfResponse(buffer, `tilinpaatos-${companySlug}-${periodSlug}.pdf`, {
    inline: preview,
  });
}, 'Tilinpäätös-PDF:n muodostus epäonnistui');
