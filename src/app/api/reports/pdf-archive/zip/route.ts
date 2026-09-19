import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { NextRequest } from 'next/server';
import { withDb, jsonError } from '@/lib/api-helpers';
import {
  getPeriods,
  getSettings,
  resolveRequestDataSource,
} from '@/lib/db';
import { periodFilenamePart, sanitizeForFilename } from '@/lib/accounting';
import { collectPdfFiles } from '@/lib/receipt-pdfs';
import { zipResponse } from '@/lib/zip-response';

export const runtime = 'nodejs';

const TILINPAATOS_FOLDER = 'financial-statement';
const TOSITTEET_PREFIX = 'tositteet/';
const TILIOTTEET_PREFIX = 'tiliotteet/';

function mapArchiveZipPath(relativePath: string): string | null {
  const normalizedPath = relativePath.split(path.sep).join('/');
  if (normalizedPath.startsWith(TILIOTTEET_PREFIX)) return null;
  if (normalizedPath.startsWith(TOSITTEET_PREFIX)) return normalizedPath;
  if (normalizedPath.startsWith(`${TILINPAATOS_FOLDER}/`))
    return normalizedPath;
  return `${TILINPAATOS_FOLDER}/${normalizedPath}`;
}

export const GET = withDb(async (request: NextRequest) => {
  const source = resolveRequestDataSource(request);
  if (!source) {
    return jsonError('Active datasource not found.', 400);
  }
  const archiveRoot = path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    '..',
    'data',
    source,
    'pdf',
  );

  if (!fs.existsSync(archiveRoot)) {
    return jsonError('PDF-arkistoa ei löydy valitulle tietolähteelle.', 404);
  }

  const relativePdfFiles: string[] = [];
  collectPdfFiles(archiveRoot, archiveRoot, relativePdfFiles);

  if (relativePdfFiles.length === 0) {
    return jsonError('PDF-arkistossa ei ole zipattavia PDF-tiedostoja.', 404);
  }

  const zip = new JSZip();
  for (const relativePath of relativePdfFiles.sort()) {
    const absolutePath = path.resolve(archiveRoot, relativePath);
    if (!absolutePath.startsWith(archiveRoot)) continue;
    const zipPath = mapArchiveZipPath(relativePath);
    if (!zipPath) continue;
    zip.file(zipPath, fs.readFileSync(absolutePath));
  }

  const settings = getSettings();
  const periods = getPeriods();
  const currentPeriod =
    periods.find((p) => p.id === settings.current_period_id) || periods[0];
  const companySlug = sanitizeForFilename(settings.name);
  const periodSlug = currentPeriod
    ? periodFilenamePart(currentPeriod.start_date, currentPeriod.end_date)
    : new Date().toISOString().slice(0, 10);

  return zipResponse(zip, `pdf-arkisto-${companySlug}-${periodSlug}.zip`, {
    noCache: true,
  });
}, 'PDF-arkiston ZIP-vienti epäonnistui.');
