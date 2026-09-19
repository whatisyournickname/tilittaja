import { NextRequest, NextResponse } from 'next/server';
import { ApiRouteError, jsonError } from '@/lib/api-helpers';
import {
  closeDbConnection,
  resolveDbPath,
  resolveRequestDataSource,
} from '@/lib/db';
import type { StateTransferImportSuccess } from '@/lib/import-types';
import { readImportedStateArchive } from '@/lib/state-transfer';

export const runtime = 'nodejs';

function isZipFile(file: File): boolean {
  return (
    file.type === 'application/zip' ||
    file.type === 'application/x-zip-compressed' ||
    file.name.toLowerCase().endsWith('.zip')
  );
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return jsonError('Send one ZIP file in `file` field', 400);
    }

    if (!isZipFile(file)) {
      return jsonError('Only ZIP packages are allowed', 400);
    }

    const source = resolveRequestDataSource(request);
    if (!source) {
      return jsonError('Active datasource not found.', 400);
    }
    const dbPath = resolveDbPath(source);
    if (!dbPath) {
      return jsonError(
        'Active datasource SQLite database not found',
        404,
      );
    }

    closeDbConnection(dbPath);

    const archiveBuffer = Buffer.from(await file.arrayBuffer());
    const imported = await readImportedStateArchive(archiveBuffer, source);

    const response: StateTransferImportSuccess = {
      ok: true,
      source,
      fileCount: imported.fileCount,
      restoredAt: new Date().toISOString(),
      manifest: imported.manifest,
    };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof ApiRouteError) {
      return jsonError(error.message, error.status);
    }
    console.error('Ledgerly state restore failed.', error);
    return jsonError('State restore failed.');
  }
}
