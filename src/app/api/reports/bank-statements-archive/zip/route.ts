import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { NextRequest } from 'next/server';
import { withDb, jsonError } from '@/lib/api-helpers';
import { periodFilenamePart, sanitizeForFilename } from '@/lib/accounting';
import {
  getBankStatements,
  getPeriods,
  getSettings,
  resolveRequestDataSource,
} from '@/lib/db';
import { resolveBankStatementPdfAbsolutePath } from '@/lib/receipt-pdfs';
import { zipResponse } from '@/lib/zip-response';

export const runtime = 'nodejs';

function periodsOverlap(
  range: { start: number; end: number },
  target: { start: number; end: number },
): boolean {
  return range.start <= target.end && range.end >= target.start;
}

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

  const statements = getBankStatements().filter((statement) =>
    periodsOverlap(
      {
        start: statement.period_start,
        end: statement.period_end,
      },
      {
        start: selectedPeriod.start_date,
        end: selectedPeriod.end_date,
      },
    ),
  );

  const zip = new JSZip();
  const usedNames = new Set<string>();
  let addedCount = 0;

  for (const statement of statements) {
    if (!statement.source_file) continue;

    const absolutePath = resolveBankStatementPdfAbsolutePath(
      source,
      statement.source_file,
    );
    if (!absolutePath) continue;

    const parsedName = path.parse(path.basename(absolutePath));
    let fileName = `${parsedName.name}.pdf`;
    if (usedNames.has(fileName.toLowerCase())) {
      let counter = 2;
      while (usedNames.has(`${parsedName.name}-${counter}.pdf`.toLowerCase())) {
        counter++;
      }
      fileName = `${parsedName.name}-${counter}.pdf`;
    }

    usedNames.add(fileName.toLowerCase());
    zip.file(`tiliotteet/${fileName}`, fs.readFileSync(absolutePath));
    addedCount++;
  }

  if (addedCount === 0) {
    return jsonError('Yhtään tiliotetta ei löytynyt tältä tilikaudelta.', 404);
  }

  const companySlug = sanitizeForFilename(settings.name);
  const periodSlug = periodFilenamePart(
    selectedPeriod.start_date,
    selectedPeriod.end_date,
  );

  return zipResponse(zip, `tiliotteet-${companySlug}-${periodSlug}.zip`, {
    noCache: true,
  });
}, 'Tiliotearkiston ZIP-vienti epäonnistui.');
