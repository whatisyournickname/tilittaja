import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import { resolveDbPath, getDb } from '@/lib/db/connection';
import { getSettings } from '@/lib/db/settings';
import { ApiRouteError } from '@/lib/api-helpers';
import { getDataSourceRoot } from '@/lib/receipt-pdfs';

export const STATE_EXPORT_FORMAT = 'tilittaja-state-export';
export const STATE_EXPORT_VERSION = 1;

const SOURCE_PREFIX = 'source/';

interface StateExportManifestCandidate {
  format?: unknown;
  version?: unknown;
  createdAt?: unknown;
  sourceSlug?: unknown;
  sourceName?: unknown;
  appVersion?: unknown;
  fileCount?: unknown;
}

export interface StateExportManifest {
  format: typeof STATE_EXPORT_FORMAT;
  version: typeof STATE_EXPORT_VERSION;
  createdAt: string;
  sourceSlug: string;
  sourceName: string;
  appVersion: number;
  fileCount: number;
}

export interface StateExportFile {
  absolutePath: string;
  relativePath: string;
}

export interface PreparedStateExport {
  manifest: StateExportManifest;
  files: StateExportFile[];
  sqliteSnapshotPath: string;
  sqliteRelativePath: string;
  cleanup: () => void;
}

export interface ImportedStateSummary {
  manifest: StateExportManifest;
  fileCount: number;
}

function walkFiles(
  rootPath: string,
  currentPath: string,
  files: StateExportFile[],
): void {
  const entries = fs.readdirSync(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(rootPath, absolutePath, files);
      continue;
    }
    if (!entry.isFile()) continue;

    files.push({
      absolutePath,
      relativePath: path.relative(rootPath, absolutePath),
    });
  }
}

function listDataSourceFiles(sourceRoot: string): StateExportFile[] {
  if (!fs.existsSync(sourceRoot)) {
    throw new ApiRouteError('Data source not found.', 404);
  }

  const files: StateExportFile[] = [];
  walkFiles(sourceRoot, sourceRoot, files);
  return files.sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath, 'fi'),
  );
}

function isMainSqliteFile(filePath: string): boolean {
  const name = path.basename(filePath);
  return name.endsWith('.sqlite') && !/-\d{4}-\d{2}-\d{2}T/.test(name);
}

function sanitizeArchivePath(fileName: string): string | null {
  const normalized = path.posix.normalize(fileName);
  if (!normalized || normalized === '.') return null;
  if (normalized.startsWith('../') || normalized.includes('/../')) return null;
  if (normalized.startsWith('/')) return null;
  return normalized;
}

function ensureExpectedManifest(value: unknown): StateExportManifest {
  if (!value || typeof value !== 'object') {
    throw new ApiRouteError('Vientipaketin manifesti puuttuu.', 400);
  }

  const manifest: StateExportManifestCandidate = value;
  if (
    manifest.format !== STATE_EXPORT_FORMAT ||
    manifest.version !== STATE_EXPORT_VERSION
  ) {
    throw new ApiRouteError('Vientipaketin formaatti ei ole tuettu.', 400);
  }
  if (!manifest.sourceSlug || !manifest.sourceName || !manifest.createdAt) {
    throw new ApiRouteError('Vientipaketin tiedot ovat puutteelliset.', 400);
  }
  if (
    typeof manifest.createdAt !== 'string' ||
    typeof manifest.sourceSlug !== 'string' ||
    typeof manifest.sourceName !== 'string'
  ) {
    throw new ApiRouteError('Vientipaketin tiedot ovat puutteelliset.', 400);
  }

  return {
    format: STATE_EXPORT_FORMAT,
    version: STATE_EXPORT_VERSION,
    createdAt: manifest.createdAt,
    sourceSlug: manifest.sourceSlug,
    sourceName: manifest.sourceName,
    appVersion: Number.isFinite(manifest.appVersion)
      ? Number(manifest.appVersion)
      : 0,
    fileCount: Number.isFinite(manifest.fileCount)
      ? Number(manifest.fileCount)
      : 0,
  };
}

function safeRemove(targetPath: string | null): void {
  if (!targetPath) return;
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch {
    // Ignore temp cleanup failures.
  }
}

export async function prepareStateExport(
  source: string,
): Promise<PreparedStateExport> {
  const sourceRoot = getDataSourceRoot(source);
  const files = listDataSourceFiles(sourceRoot);
  const dbPath = resolveDbPath(source);
  if (!dbPath) {
    throw new ApiRouteError('Datasource SQLite database not found.', 404);
  }

  const sqliteFile = files.find(
    (file) => path.resolve(file.absolutePath) === path.resolve(dbPath),
  );
  if (!sqliteFile) {
    throw new ApiRouteError('SQLite database not found for export.', 404);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tilittaja-export-'));
  const sqliteSnapshotPath = path.join(tmpDir, path.basename(dbPath));
  await getDb().backup(sqliteSnapshotPath);

  const manifest: StateExportManifest = {
    format: STATE_EXPORT_FORMAT,
    version: STATE_EXPORT_VERSION,
    createdAt: new Date().toISOString(),
    sourceSlug: source,
    sourceName: getSettings().name,
    appVersion: getSettings().version,
    fileCount: files.filter(
      (file) => !file.relativePath.startsWith(`${path.basename(dbPath)}-`),
    ).length,
  };

  return {
    manifest,
    files,
    sqliteSnapshotPath,
    sqliteRelativePath: sqliteFile.relativePath,
    cleanup: () => safeRemove(tmpDir),
  };
}

/** Imports a state-export ZIP into a new data source directory. */
export async function importStateArchiveAsNewSource(
  archiveBuffer: Buffer,
): Promise<ImportedStateSummary & { slug: string }> {
  const zip = await JSZip.loadAsync(archiveBuffer);
  const manifestText = await zip.file('manifest.json')?.async('string');
  if (!manifestText) {
    throw new ApiRouteError('Vientipaketista puuttuu manifest.json.', 400);
  }

  const manifest = ensureExpectedManifest(JSON.parse(manifestText));
  const slug = manifest.sourceSlug;
  const dataSourceRoot = getDataSourceRoot(slug);

  if (fs.existsSync(dataSourceRoot)) {
    throw new ApiRouteError(
      `Data source "${slug}" already exists. Remove it first or use import from settings.`,
      409,
    );
  }

  const parentDir = path.dirname(dataSourceRoot);
  fs.mkdirSync(parentDir, { recursive: true });

  const stageRoot = fs.mkdtempSync(path.join(parentDir, `${slug}-import-`));
  const extractedRoot = path.join(stageRoot, slug);
  fs.mkdirSync(extractedRoot, { recursive: true });

  try {
    const sourceEntries = Object.values(zip.files)
      .filter((entry) => !entry.dir && entry.name.startsWith(SOURCE_PREFIX))
      .sort((a, b) => a.name.localeCompare(b.name, 'fi'));

    if (sourceEntries.length === 0) {
      throw new ApiRouteError(
        'Vientipaketissa ei ole palautettavia tiedostoja.',
        400,
      );
    }

    let extractedCount = 0;
    let hasSqliteFile = false;

    for (const entry of sourceEntries) {
      const relativePath = sanitizeArchivePath(
        entry.name.slice(SOURCE_PREFIX.length),
      );
      if (!relativePath) {
        throw new ApiRouteError(
          `Vientipaketissa on virheellinen tiedostopolku: ${entry.name}`,
          400,
        );
      }

      const outputPath = path.join(extractedRoot, relativePath);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, await entry.async('nodebuffer'));
      extractedCount += 1;
      if (isMainSqliteFile(relativePath)) {
        hasSqliteFile = true;
      }
    }

    if (!hasSqliteFile) {
      throw new ApiRouteError('Vientipaketista puuttuu SQLite-kanta.', 400);
    }

    fs.renameSync(extractedRoot, dataSourceRoot);
    safeRemove(stageRoot);

    return { manifest, fileCount: extractedCount, slug };
  } catch (error) {
    safeRemove(stageRoot);
    safeRemove(dataSourceRoot);
    if (error instanceof ApiRouteError) throw error;
    throw new ApiRouteError('Failed to restore export archive.', 500);
  }
}

export async function readImportedStateArchive(
  archiveBuffer: Buffer,
  expectedSource: string,
): Promise<ImportedStateSummary> {
  const zip = await JSZip.loadAsync(archiveBuffer);
  const manifestText = await zip.file('manifest.json')?.async('string');
  if (!manifestText) {
    throw new ApiRouteError('Vientipaketista puuttuu manifest.json.', 400);
  }

  const manifest = ensureExpectedManifest(JSON.parse(manifestText));
  if (manifest.sourceSlug !== expectedSource) {
    throw new ApiRouteError(
      `Export archive belongs to data source ${manifest.sourceSlug}, but active data source is ${expectedSource}.`,
      400,
    );
  }

  const dataSourceRoot = getDataSourceRoot(expectedSource);
  const parentDir = path.dirname(dataSourceRoot);
  fs.mkdirSync(parentDir, { recursive: true });

  const stageRoot = fs.mkdtempSync(
    path.join(parentDir, `${expectedSource}-import-`),
  );
  const extractedRoot = path.join(stageRoot, expectedSource);
  fs.mkdirSync(extractedRoot, { recursive: true });

  let backupPath: string | null = null;

  try {
    const sourceEntries = Object.values(zip.files)
      .filter((entry) => !entry.dir && entry.name.startsWith(SOURCE_PREFIX))
      .sort((a, b) => a.name.localeCompare(b.name, 'fi'));

    if (sourceEntries.length === 0) {
      throw new ApiRouteError(
        'Vientipaketissa ei ole palautettavia tiedostoja.',
        400,
      );
    }

    let extractedCount = 0;
    let hasSqliteFile = false;

    for (const entry of sourceEntries) {
      const relativePath = sanitizeArchivePath(
        entry.name.slice(SOURCE_PREFIX.length),
      );
      if (!relativePath) {
        throw new ApiRouteError(
          `Vientipaketissa on virheellinen tiedostopolku: ${entry.name}`,
          400,
        );
      }

      const outputPath = path.join(extractedRoot, relativePath);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, await entry.async('nodebuffer'));
      extractedCount += 1;
      if (isMainSqliteFile(relativePath)) {
        hasSqliteFile = true;
      }
    }

    if (!hasSqliteFile) {
      throw new ApiRouteError('Vientipaketista puuttuu SQLite-kanta.', 400);
    }

    if (fs.existsSync(dataSourceRoot)) {
      backupPath = path.join(
        parentDir,
        `${expectedSource}-backup-${Date.now()}`,
      );
      fs.renameSync(dataSourceRoot, backupPath);
    }

    fs.renameSync(extractedRoot, dataSourceRoot);
    safeRemove(backupPath);
    backupPath = null;
    safeRemove(stageRoot);

    return {
      manifest,
      fileCount: extractedCount,
    };
  } catch (error) {
    if (
      backupPath &&
      !fs.existsSync(dataSourceRoot) &&
      fs.existsSync(backupPath)
    ) {
      fs.renameSync(backupPath, dataSourceRoot);
    }
    safeRemove(stageRoot);
    if (error instanceof ApiRouteError) {
      throw error;
    }
    throw new ApiRouteError('Failed to restore export archive.', 500);
  }
}
