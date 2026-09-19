import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { getBankStatement, resolveRequestDataSource } from '@/lib/db';
import { withDb, requireResource, jsonError } from '@/lib/api-helpers';
import { resolveBankStatementPdfAbsolutePath } from '@/lib/receipt-pdfs';
import { pdfResponse } from '@/lib/pdf/pdf-response';

export const GET = withDb(async (request: NextRequest) => {
  const statementIdParam = request.nextUrl.searchParams.get('statementId');
  const statementId = Number(statementIdParam);

  if (!Number.isInteger(statementId) || statementId <= 0) {
    return jsonError('Invalid bank statement', 400);
  }

  const statement = requireResource(
    getBankStatement(statementId),
    'Bank statement not found',
  );

  if (!statement.source_file) {
    return jsonError('Tiliotteelle ei ole lahdetiedostoa', 404);
  }

  const source = resolveRequestDataSource(request);
  if (!source) {
    return jsonError('Active datasource not found.', 400);
  }
  const absolutePath = resolveBankStatementPdfAbsolutePath(
    source,
    statement.source_file,
  );

  if (!absolutePath) {
    return jsonError(`Tiliotteen PDF puuttuu: ${statement.source_file}`, 404);
  }

  const file = fs.readFileSync(absolutePath);
  return pdfResponse(file, path.basename(absolutePath), { noCache: true });
}, 'Tiliotteen PDF:n lataus epaonnistui');
