'use server';

import { cookies } from 'next/headers';
import {
  closeDbConnection,
  requireCurrentDataSource,
  resolveDbPath,
} from '@/lib/db';
import { datasourceSchema } from '@/lib/validation';
import { createNewDatabase, linkExternalDatabase } from '@/lib/db/bootstrap';
import type { StateTransferImportSuccess } from '@/lib/import-types';
import {
  importStateArchiveAsNewSource,
  readImportedStateArchive,
} from '@/lib/state-transfer';
import {
  setupExternalDatabaseSchema,
  setupNewDatabaseSchema,
} from '@/lib/validation';
import { getEnv } from '@/lib/env';
import { slugifyDataSourceName } from '@/lib/datasource-slug';
import { revalidateApp } from '@/actions/_helpers';

async function setDatasourceCookie(slug: string): Promise<void> {
  const env = getEnv();
  const cookieStore = await cookies();

  cookieStore.set('datasource', slug, {
    path: '/',
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function setDatasourceAction(input: unknown) {
  const parsed = datasourceSchema.parse(
    typeof input === 'string' ? { slug: input } : input,
  );
  const dbPath = resolveDbPath(parsed.slug);

  if (!dbPath) {
    throw new Error('Invalid datasource');
  }

  await setDatasourceCookie(parsed.slug);
  revalidateApp();
  return { ok: true };
}

export async function importStateTransferAction(
  file: File,
): Promise<StateTransferImportSuccess> {
  if (!(file instanceof File)) {
    throw new Error('Select a ZIP package.');
  }

  const source = await requireCurrentDataSource();
  const dbPath = resolveDbPath(source);
  if (!dbPath) {
    throw new Error('Active datasource SQLite database not found');
  }

  closeDbConnection(dbPath);

  const archiveBuffer = Buffer.from(await file.arrayBuffer());
  const imported = await readImportedStateArchive(archiveBuffer, source);
  revalidateApp();

  return {
    ok: true,
    source,
    fileCount: imported.fileCount,
    restoredAt: new Date().toISOString(),
    manifest: imported.manifest,
  };
}

export async function setupCreateNewDatabaseAction(input: unknown) {
  const parsed = setupNewDatabaseSchema.parse(input);
  const year = parsed.periodYear || new Date().getFullYear();
  const startDate = new Date(year, 0, 1).getTime();
  const endDate = new Date(year, 11, 31).getTime();
  const slug = slugifyDataSourceName(parsed.companyName);

  createNewDatabase(slug, {
    companyName: parsed.companyName.trim(),
    businessId: parsed.businessId?.trim(),
    periodStartDate: startDate,
    periodEndDate: endDate,
  });

  await setDatasourceCookie(slug);
  revalidateApp();
  return { ok: true, slug };
}

export async function setupLinkExternalDatabaseAction(input: unknown) {
  const parsed = setupExternalDatabaseSchema.parse(input);
  const slug = slugifyDataSourceName(parsed.name || 'ulkoinen');

  linkExternalDatabase(parsed.filePath.trim(), slug);
  await setDatasourceCookie(slug);
  revalidateApp();
  return { ok: true, slug };
}

export async function setupImportArchiveAction(file: File) {
  if (!(file instanceof File)) {
    throw new Error('Send ZIP file in `file` field');
  }

  if (!file.type.includes('zip') && !file.name.toLowerCase().endsWith('.zip')) {
    throw new Error('Only ZIP files are allowed');
  }

  const archiveBuffer = Buffer.from(await file.arrayBuffer());
  const result = await importStateArchiveAsNewSource(archiveBuffer);
  await setDatasourceCookie(result.slug);
  revalidateApp();
  return { ok: true, slug: result.slug };
}
