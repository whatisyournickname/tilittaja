import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { NextRequest } from 'next/server';
import { withDb, jsonError } from '@/lib/api-helpers';
import {
  getBankStatements,
  getPeriods,
  getSettings,
  resolveRequestDataSource,
} from '@/lib/db';
import { periodFilenamePart, sanitizeForFilename } from '@/lib/accounting';
import { resolveBankStatementPdfAbsolutePath } from '@/lib/receipt-pdfs';
import { collectReceiptsForPeriod } from '@/lib/receipt-resolution';
import { buildMaterialPdf, MaterialKind } from '@/lib/financial-statement-materials';
import { zipResponse } from '@/lib/zip-response';

export const runtime = 'nodejs';

const TILINPAATOS_FOLDER = 'financial-statement';

const ALL_MATERIAL_KINDS: MaterialKind[] = [
  'general-ledger',
  'journal',
  'balance-sheet-detailed',
  'balance-sheet-broad',
  'income-statement-broad',
];

function periodsOverlap(
  range: { start: number; end: number },
  target: { start: number; end: number },
): boolean {
  return range.start <= target.end && range.end >= target.start;
}

async function fetchPdfFromRoute(
  origin: string,
  routePath: string,
  cookieHeader: string,
): Promise<{ buffer: Buffer; filename: string } | null> {
  try {
    const response = await fetch(`${origin}${routePath}`, {
      headers: { Cookie: cookieHeader },
    });
    if (!response.ok) return null;
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const filenameMatch = disposition.match(/filename="([^"]+)"/);
    const filename = filenameMatch?.[1] ?? 'document.pdf';
    const buffer = Buffer.from(await response.arrayBuffer());
    return { buffer, filename };
  } catch {
    return null;
  }
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

  const zip = new JSZip();
  const origin = request.nextUrl.origin;
  const cookieHeader = request.headers.get('cookie') ?? '';

  const [annualMeeting, financialStatement] = await Promise.all([
    fetchPdfFromRoute(
      origin,
      `/api/reports/annual-meeting/pdf?period=${selectedPeriod.id}`,
      cookieHeader,
    ),
    fetchPdfFromRoute(
      origin,
      `/api/reports/financial-statement/pdf?period=${selectedPeriod.id}`,
      cookieHeader,
    ),
  ]);

  if (annualMeeting) {
    zip.file(
      `${TILINPAATOS_FOLDER}/${annualMeeting.filename}`,
      annualMeeting.buffer,
    );
  }
  if (financialStatement) {
    zip.file(
      `${TILINPAATOS_FOLDER}/${financialStatement.filename}`,
      financialStatement.buffer,
    );
  }

  for (const kind of ALL_MATERIAL_KINDS) {
    try {
      const { buffer, filename } = await buildMaterialPdf(
        kind,
        selectedPeriod.id,
      );
      zip.file(`${TILINPAATOS_FOLDER}/${filename}`, buffer);
    } catch (error) {
      console.error(`Failed to build material PDF for ${kind}`, error);
    }
  }

  const statementNames = new Set<string>();
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

  for (const statement of statements) {
    if (!statement.source_file) continue;

    const absolutePath = resolveBankStatementPdfAbsolutePath(
      source,
      statement.source_file,
    );
    if (!absolutePath) continue;

    const parsedName = path.parse(path.basename(absolutePath));
    let fileName = `${parsedName.name}.pdf`;
    if (statementNames.has(fileName.toLowerCase())) {
      let counter = 2;
      while (
        statementNames.has(`${parsedName.name}-${counter}.pdf`.toLowerCase())
      ) {
        counter++;
      }
      fileName = `${parsedName.name}-${counter}.pdf`;
    }

    statementNames.add(fileName.toLowerCase());
    zip.file(`tiliotteet/${fileName}`, fs.readFileSync(absolutePath));
  }

  const receipts = collectReceiptsForPeriod(selectedPeriod.id, source);
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

  return zipResponse(
    zip,
    `financialStatement-arkisto-${companySlug}-${periodSlug}.zip`,
    { noCache: true },
  );
}, 'Arkiston ZIP-vienti epäonnistui.');
