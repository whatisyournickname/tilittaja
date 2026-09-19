import fs from 'fs';
import JSZip from 'jszip';
import { NextRequest } from 'next/server';
import { jsonError, withDb } from '@/lib/api-helpers';
import { sanitizeForFilename } from '@/lib/accounting';
import { resolveRequestDataSource } from '@/lib/db';
import { prepareStateExport } from '@/lib/state-transfer';
import { zipResponse } from '@/lib/zip-response';

export const runtime = 'nodejs';

export const GET = withDb(async (request: NextRequest) => {
  const source = resolveRequestDataSource(request);
  if (!source) {
    return jsonError('Active datasource not found.', 400);
  }
  const prepared = await prepareStateExport(source);

  try {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(prepared.manifest, null, 2));

    for (const file of prepared.files) {
      const isMainSqlite = file.relativePath === prepared.sqliteRelativePath;
      const isSqliteSidecar =
        file.relativePath === `${prepared.sqliteRelativePath}-wal` ||
        file.relativePath === `${prepared.sqliteRelativePath}-shm`;

      if (isSqliteSidecar) continue;

      zip.file(
        `source/${file.relativePath}`,
        isMainSqlite
          ? fs.readFileSync(prepared.sqliteSnapshotPath)
          : fs.readFileSync(file.absolutePath),
      );
    }

    const companySlug =
      sanitizeForFilename(prepared.manifest.sourceName || source) || source;
    const timestamp = prepared.manifest.createdAt.replaceAll(':', '-');

    return zipResponse(
      zip,
      `tilittaja-vienti-${companySlug}-${timestamp}.zip`,
      { noCache: true },
    );
  } finally {
    prepared.cleanup();
  }
}, 'Failed to export Tilittaja full state.');
