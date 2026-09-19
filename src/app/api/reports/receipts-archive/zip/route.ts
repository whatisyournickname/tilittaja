import fs from 'fs';
import JSZip from 'jszip';
import { NextRequest } from 'next/server';
import { withDb, jsonError } from '@/lib/api-helpers';
import { getPeriods, getSettings, resolveRequestDataSource } from '@/lib/db';
import { periodFilenamePart, sanitizeForFilename } from '@/lib/accounting';
import { collectReceiptsForPeriod } from '@/lib/receipt-resolution';
import { zipResponse } from '@/lib/zip-response';

export const runtime = 'nodejs';

export const GET = withDb(async (request: NextRequest) => {
  const source = resolveRequestDataSource(request);
  if (!source) {
    return jsonError('Active datasource not found.', 400);
  }
  const periodParam = request.nextUrl.searchParams.get('period') || '';
  const periodId = periodParam ? Number(periodParam) : undefined;

  const settings = getSettings();
  const periods = getPeriods();
  const selectedPeriod =
    (periodId ? periods.find((p) => p.id === periodId) : undefined) ||
    periods.find((p) => p.id === settings.current_period_id) ||
    periods[0];

  if (!selectedPeriod) {
    return jsonError('Tilikautta ei löytynyt.', 404);
  }

  const receipts = collectReceiptsForPeriod(selectedPeriod.id, source);

  if (receipts.length === 0) {
    return jsonError('Yhtään tositetta ei löytynyt tältä tilikaudelta.', 404);
  }

  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (const receipt of receipts) {
    let name = `${receipt.code}.pdf`;
    if (usedNames.has(name.toLowerCase())) {
      let counter = 2;
      while (usedNames.has(`${receipt.code}-${counter}.pdf`.toLowerCase())) {
        counter++;
      }
      name = `${receipt.code}-${counter}.pdf`;
    }
    usedNames.add(name.toLowerCase());
    zip.file(`tositteet/${name}`, fs.readFileSync(receipt.absolutePath));
  }

  const companySlug = sanitizeForFilename(settings.name);
  const periodSlug = periodFilenamePart(
    selectedPeriod.start_date,
    selectedPeriod.end_date,
  );

  return zipResponse(zip, `tositteet-${companySlug}-${periodSlug}.zip`, {
    noCache: true,
  });
}, 'Tositearkiston ZIP-vienti epäonnistui.');
