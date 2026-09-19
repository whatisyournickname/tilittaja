import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  isMultipartRequest,
  isPdfFile,
  jsonError,
  readRequestFormData,
  withDb,
} from '@/lib/api-helpers';
import type { OpeningBalanceImportApiSuccess } from '@/lib/import-types';
import { applyImportedOpeningBalance } from '@/lib/opening-balance-import';

export const runtime = 'nodejs';

const uploadSchema = z.object({
  periodId: z.coerce
    .number({ error: 'Valitse tilikausi' })
    .int({ error: 'Valitse tilikausi' })
    .positive({ error: 'Valitse tilikausi' }),
});

export const POST = withDb(async (request: NextRequest) => {
  if (!isMultipartRequest(request)) {
    return jsonError('Send PDFs as multipart form', 400);
  }

  const formData = await readRequestFormData(request);

  const files = formData
    .getAll('files')
    .filter((file): file is File => file instanceof File);

  if (files.length === 0) {
    return jsonError('Send at least one PDF file in the .files. field', 400);
  }

  if (files.length > 10) {
    return jsonError('You can send at most 10 PDF files', 400);
  }

  if (files.some((file) => !isPdfFile(file))) {
    return jsonError('Vain PDF-tiedostot ovat sallittuja', 400);
  }

  const parsedForm = uploadSchema.parse({
    periodId: formData.get('periodId'),
  });

  const result = await applyImportedOpeningBalance({
    periodId: parsedForm.periodId,
    files: await Promise.all(
      files.map(async (file) => ({
        fileName: file.name,
        buffer: Buffer.from(await file.arrayBuffer()),
      })),
    ),
  });

  const response: OpeningBalanceImportApiSuccess = {
    ok: true,
    ...result,
  };
  return NextResponse.json(response);
}, 'Opening balance PDF import failed');
