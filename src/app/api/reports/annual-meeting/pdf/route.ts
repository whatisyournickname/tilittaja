import { NextRequest } from 'next/server';
import { withDb } from '@/lib/api-helpers';
import { buildFinancialStatementPackage } from '@/lib/financial-statement';
import { sanitizeForFilename } from '@/lib/accounting';
import { buildAnnualMeetingPdf } from '@/lib/pdf/annual-meeting-pdf';
import { pdfResponse } from '@/lib/pdf/pdf-response';

export const runtime = 'nodejs';

export const GET = withDb(async (request: NextRequest) => {
  const period = request.nextUrl.searchParams.get('period');
  const preview = request.nextUrl.searchParams.get('preview') === '1';
  const pkg = buildFinancialStatementPackage(period ? Number(period) : undefined);

  const buffer = await buildAnnualMeetingPdf(pkg);

  const companySlug = sanitizeForFilename(pkg.companyName);
  const periodSlug = `${pkg.periodStart.replaceAll('.', '')}-${pkg.periodEnd.replaceAll('.', '')}`;
  return pdfResponse(buffer, `annualMeeting-${companySlug}-${periodSlug}.pdf`, {
    inline: preview,
  });
}, 'Yhtiökokous-PDF:n muodostus epäonnistui');
