import JSZip from 'jszip';
import { NextRequest } from 'next/server';
import { withDb, jsonError } from '@/lib/api-helpers';
import { getPeriods, getSettings } from '@/lib/db';
import { periodFilenamePart, sanitizeForFilename } from '@/lib/accounting';
import {
  buildMaterialPdf,
  isMaterialKind,
  MaterialKind,
} from '@/lib/financial-statement-materials';
import { zipResponse } from '@/lib/zip-response';

export const runtime = 'nodejs';

const TILINPAATOS_FOLDER = 'financial-statement';

const ALL_KINDS: MaterialKind[] = [
  'general-ledger',
  'journal',
  'balance-sheet-detailed',
  'balance-sheet-broad',
  'income-statement-broad',
];

function parseKinds(searchParams: URLSearchParams): MaterialKind[] {
  const directKinds = searchParams.getAll('kind');
  const groupedKinds = searchParams
    .getAll('kinds')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  const requestedKinds = [...directKinds, ...groupedKinds];
  if (requestedKinds.length === 0) return ALL_KINDS;

  const uniqueKinds = Array.from(new Set(requestedKinds));
  const invalidKinds = uniqueKinds.filter((kind) => !isMaterialKind(kind));
  if (invalidKinds.length > 0) {
    throw new Error(`Virheelliset materiaalit: ${invalidKinds.join(', ')}`);
  }

  return uniqueKinds as MaterialKind[];
}

export const GET = withDb(async (request: NextRequest) => {
  const periodParam = request.nextUrl.searchParams.get('period') || '';
  const periodId = periodParam ? Number(periodParam) : undefined;

  let selectedKinds: MaterialKind[];
  try {
    selectedKinds = parseKinds(request.nextUrl.searchParams);
  } catch {
    return jsonError('Materials ZIP export failed.', 400);
  }

  const zip = new JSZip();

  for (const kind of selectedKinds) {
    const { buffer, filename } = await buildMaterialPdf(kind, periodId);
    zip.file(`${TILINPAATOS_FOLDER}/${filename}`, buffer);
  }

  const settings = getSettings();
  const periods = getPeriods();
  const selectedPeriod =
    (periodId ? periods.find((p) => p.id === periodId) : undefined) ||
    periods.find((p) => p.id === settings.current_period_id) ||
    periods[0];
  const companySlug = sanitizeForFilename(settings.name);
  const periodSlug = selectedPeriod
    ? periodFilenamePart(selectedPeriod.start_date, selectedPeriod.end_date)
    : 'tilikausi';

  return zipResponse(
    zip,
    `financialStatement-materiaalit-${companySlug}-${periodSlug}.zip`,
  );
}, 'Materials ZIP export failed.');
