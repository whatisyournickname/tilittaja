import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { getDataSourceRoot } = vi.hoisted(() => ({
  getDataSourceRoot: vi.fn(),
}));

vi.mock('@/lib/receipt-pdfs', () => ({
  getDataSourceRoot,
}));

const { getDb, getSettings, resolveDbPath } = vi.hoisted(() => ({
  getDb: vi.fn(),
  getSettings: vi.fn(),
  resolveDbPath: vi.fn(),
}));

vi.mock('@/lib/db/connection', () => ({
  getDb,
  resolveDbPath,
}));

vi.mock('@/lib/db/settings', () => ({
  getSettings,
}));

import {
  importStateArchiveAsNewSource,
  prepareStateExport,
  readImportedStateArchive,
  STATE_EXPORT_FORMAT,
  STATE_EXPORT_VERSION,
} from './state-transfer';

function createArchive(
  sourceSlug: string,
  files: Record<string, string | Buffer>,
) {
  const zip = new JSZip();
  zip.file(
    'manifest.json',
    JSON.stringify({
      format: STATE_EXPORT_FORMAT,
      version: STATE_EXPORT_VERSION,
      createdAt: '2026-04-04T10:00:00.000Z',
      sourceSlug,
      sourceName: 'Testiyhtio',
      appVersion: 7,
      fileCount: Object.keys(files).length,
    }),
  );

  for (const [filePath, value] of Object.entries(files)) {
    zip.file(`source/${filePath}`, value);
  }

  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('readImportedStateArchive', () => {
  const tempPaths: string[] = [];

  afterEach(() => {
    vi.clearAllMocks();
    for (const tempPath of tempPaths.splice(0)) {
      fs.rmSync(tempPath, { recursive: true, force: true });
    }
  });

  it('prepares a snapshot export with sorted datasource files', async () => {
    const rootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'tilittaja-state-export-'),
    );
    const sourceRoot = path.join(rootDir, 'manolos');
    const sqlitePath = path.join(sourceRoot, 'kirjanpito.sqlite');
    const nestedFile = path.join(sourceRoot, 'pdf/tositteet/MU1.pdf');
    const walSnapshot = path.join(
      sourceRoot,
      'kirjanpito.sqlite-2026-04-05T10-00',
    );
    tempPaths.push(rootDir);

    fs.mkdirSync(path.dirname(nestedFile), { recursive: true });
    fs.writeFileSync(sqlitePath, 'live-db');
    fs.writeFileSync(nestedFile, 'receipt');
    fs.writeFileSync(walSnapshot, 'shadow');

    getDataSourceRoot.mockReturnValue(sourceRoot);
    resolveDbPath.mockReturnValue(sqlitePath);
    getSettings.mockReturnValue({
      name: 'Manolos Oy',
      version: 9,
    });
    getDb.mockReturnValue({
      backup: vi.fn(async (targetPath: string) => {
        fs.copyFileSync(sqlitePath, targetPath);
      }),
    });

    const prepared = await prepareStateExport('manolos');

    expect(prepared.manifest.sourceSlug).toBe('manolos');
    expect(prepared.manifest.sourceName).toBe('Manolos Oy');
    expect(prepared.manifest.appVersion).toBe(9);
    expect(prepared.manifest.fileCount).toBe(2);
    expect(prepared.files.map((file) => file.relativePath)).toEqual([
      'kirjanpito.sqlite',
      'kirjanpito.sqlite-2026-04-05T10-00',
      'pdf/tositteet/MU1.pdf',
    ]);
    expect(prepared.sqliteRelativePath).toBe('kirjanpito.sqlite');
    expect(fs.readFileSync(prepared.sqliteSnapshotPath, 'utf8')).toBe(
      'live-db',
    );

    const snapshotDir = path.dirname(prepared.sqliteSnapshotPath);
    prepared.cleanup();
    expect(fs.existsSync(snapshotDir)).toBe(false);
  });

  it('rejects export when sqlite path cannot be resolved', async () => {
    const rootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'tilittaja-state-export-'),
    );
    const sourceRoot = path.join(rootDir, 'manolos');
    tempPaths.push(rootDir);
    fs.mkdirSync(sourceRoot, { recursive: true });

    getDataSourceRoot.mockReturnValue(sourceRoot);
    resolveDbPath.mockReturnValue(null);

    await expect(prepareStateExport('manolos')).rejects.toMatchObject({
      message: 'Datasource SQLite database not found.',
    });
  });

  it('imports an archive as a brand new datasource', async () => {
    const rootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'tilittaja-state-transfer-'),
    );
    const sourceRoot = path.join(rootDir, 'fresh-source');
    tempPaths.push(rootDir);
    getDataSourceRoot.mockReturnValue(sourceRoot);

    const archive = await createArchive('fresh-source', {
      'kirjanpito.sqlite': 'fresh-db',
      'pdf/tositteet/MU1.pdf': 'receipt',
    });

    const result = await importStateArchiveAsNewSource(archive);

    expect(result.slug).toBe('fresh-source');
    expect(result.fileCount).toBe(2);
    expect(
      fs.readFileSync(path.join(sourceRoot, 'kirjanpito.sqlite'), 'utf8'),
    ).toBe('fresh-db');
    expect(
      fs.readFileSync(path.join(sourceRoot, 'pdf/tositteet/MU1.pdf'), 'utf8'),
    ).toBe('receipt');
  });

  it('rejects import-as-new when datasource already exists', async () => {
    const rootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'tilittaja-state-transfer-'),
    );
    const sourceRoot = path.join(rootDir, 'existing');
    tempPaths.push(rootDir);
    fs.mkdirSync(sourceRoot, { recursive: true });
    getDataSourceRoot.mockReturnValue(sourceRoot);

    const archive = await createArchive('existing', {
      'kirjanpito.sqlite': 'db',
    });

    await expect(importStateArchiveAsNewSource(archive)).rejects.toMatchObject({
      message:
        'Tietolähde "existing" on jo olemassa. Poista se ensin tai käytä tuontia asetuksista.',
    });
  });

  it('rejects archive for another datasource', async () => {
    const rootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'tilittaja-state-transfer-'),
    );
    tempPaths.push(rootDir);
    getDataSourceRoot.mockReturnValue(path.join(rootDir, 'manolos'));

    const archive = await createArchive('other-source', {
      'kirjanpito.sqlite': 'db',
    });

    await expect(
      readImportedStateArchive(archive, 'manolos'),
    ).rejects.toMatchObject({
      message:
        'Vientipaketti kuuluu tietolähteelle other-source, mutta aktiivinen tietolähde on manolos.',
    });
  });

  it('restores datasource files from archive', async () => {
    const rootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'tilittaja-state-transfer-'),
    );
    const sourceRoot = path.join(rootDir, 'manolos');
    tempPaths.push(rootDir);

    fs.mkdirSync(sourceRoot, { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, 'obsolete.txt'), 'old');

    getDataSourceRoot.mockReturnValue(sourceRoot);

    const archive = await createArchive('manolos', {
      'kirjanpito.sqlite': 'sqlite-snapshot',
      'pdf/tositteet/MU1.pdf': Buffer.from('receipt'),
    });

    const result = await readImportedStateArchive(archive, 'manolos');

    expect(result.fileCount).toBe(2);
    expect(fs.existsSync(path.join(sourceRoot, 'obsolete.txt'))).toBe(false);
    expect(
      fs.readFileSync(path.join(sourceRoot, 'kirjanpito.sqlite'), 'utf8'),
    ).toBe('sqlite-snapshot');
    expect(
      fs.readFileSync(path.join(sourceRoot, 'pdf/tositteet/MU1.pdf'), 'utf8'),
    ).toBe('receipt');
  });

  it('rejects archive without manifest', async () => {
    const rootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'tilittaja-state-transfer-'),
    );
    tempPaths.push(rootDir);
    getDataSourceRoot.mockReturnValue(path.join(rootDir, 'test'));

    const zip = new JSZip();
    zip.file('source/file.txt', 'data');
    const archive = await zip.generateAsync({ type: 'nodebuffer' });

    await expect(
      readImportedStateArchive(archive, 'test'),
    ).rejects.toMatchObject({
      message: 'Vientipaketista puuttuu manifest.json.',
    });
  });

  it('rejects archive with wrong format', async () => {
    const rootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'tilittaja-state-transfer-'),
    );
    tempPaths.push(rootDir);
    getDataSourceRoot.mockReturnValue(path.join(rootDir, 'test'));

    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({
        format: 'wrong-format',
        version: 1,
        sourceSlug: 'test',
        sourceName: 'Test',
        createdAt: '2026-01-01',
      }),
    );
    zip.file('source/file.sqlite', 'db');
    const archive = await zip.generateAsync({ type: 'nodebuffer' });

    await expect(
      readImportedStateArchive(archive, 'test'),
    ).rejects.toMatchObject({
      message: 'Vientipaketin formaatti ei ole tuettu.',
    });
  });

  it('rejects archive with incomplete manifest', async () => {
    const rootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'tilittaja-state-transfer-'),
    );
    tempPaths.push(rootDir);
    getDataSourceRoot.mockReturnValue(path.join(rootDir, 'test'));

    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({
        format: STATE_EXPORT_FORMAT,
        version: STATE_EXPORT_VERSION,
      }),
    );
    zip.file('source/file.sqlite', 'db');
    const archive = await zip.generateAsync({ type: 'nodebuffer' });

    await expect(
      readImportedStateArchive(archive, 'test'),
    ).rejects.toMatchObject({
      message: 'Vientipaketin tiedot ovat puutteelliset.',
    });
  });

  it('rejects archive without source files', async () => {
    const rootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'tilittaja-state-transfer-'),
    );
    tempPaths.push(rootDir);
    getDataSourceRoot.mockReturnValue(path.join(rootDir, 'test'));

    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({
        format: STATE_EXPORT_FORMAT,
        version: STATE_EXPORT_VERSION,
        sourceSlug: 'test',
        sourceName: 'Test',
        createdAt: '2026-01-01',
      }),
    );
    const archive = await zip.generateAsync({ type: 'nodebuffer' });

    await expect(
      readImportedStateArchive(archive, 'test'),
    ).rejects.toMatchObject({
      message: 'Vientipaketissa ei ole palautettavia tiedostoja.',
    });
  });

  it('rejects archive without SQLite file', async () => {
    const rootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'tilittaja-state-transfer-'),
    );
    tempPaths.push(rootDir);
    getDataSourceRoot.mockReturnValue(path.join(rootDir, 'test'));

    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({
        format: STATE_EXPORT_FORMAT,
        version: STATE_EXPORT_VERSION,
        sourceSlug: 'test',
        sourceName: 'Test',
        createdAt: '2026-01-01',
      }),
    );
    zip.file('source/readme.txt', 'hello');
    const archive = await zip.generateAsync({ type: 'nodebuffer' });

    await expect(
      readImportedStateArchive(archive, 'test'),
    ).rejects.toMatchObject({
      message: 'Vientipaketista puuttuu SQLite-kanta.',
    });
  });

  it('rejects archive with path traversal in file names', async () => {
    const rootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'tilittaja-state-transfer-'),
    );
    tempPaths.push(rootDir);
    getDataSourceRoot.mockReturnValue(path.join(rootDir, 'test'));

    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({
        format: STATE_EXPORT_FORMAT,
        version: STATE_EXPORT_VERSION,
        sourceSlug: 'test',
        sourceName: 'Test',
        createdAt: '2026-01-01',
      }),
    );
    zip.file('source/../../../etc/passwd', 'evil');
    const archive = await zip.generateAsync({ type: 'nodebuffer' });

    await expect(readImportedStateArchive(archive, 'test')).rejects.toThrow();
  });

  it('creates fresh datasource directory when it does not exist', async () => {
    const rootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'tilittaja-state-transfer-'),
    );
    const sourceRoot = path.join(rootDir, 'fresh-source');
    tempPaths.push(rootDir);

    getDataSourceRoot.mockReturnValue(sourceRoot);

    const archive = await createArchive('fresh-source', {
      'data.sqlite': 'fresh-db',
    });

    const result = await readImportedStateArchive(archive, 'fresh-source');
    expect(result.fileCount).toBe(1);
    expect(fs.readFileSync(path.join(sourceRoot, 'data.sqlite'), 'utf8')).toBe(
      'fresh-db',
    );
  });

  it('restores the previous datasource when replacement fails after backup', async () => {
    const rootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'tilittaja-state-transfer-'),
    );
    const sourceRoot = path.join(rootDir, 'manolos');
    tempPaths.push(rootDir);

    fs.mkdirSync(sourceRoot, { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, 'old.txt'), 'old-data');
    getDataSourceRoot.mockReturnValue(sourceRoot);

    const archive = await createArchive('manolos', {
      'kirjanpito.sqlite': 'sqlite-snapshot',
    });

    const originalRenameSync = fs.renameSync;
    const renameSpy = vi
      .spyOn(fs, 'renameSync')
      .mockImplementation((fromPath, toPath) => {
        const from = path.resolve(String(fromPath));
        const to = path.resolve(String(toPath));
        if (
          to === path.resolve(sourceRoot) &&
          from.includes('-import-') &&
          from.endsWith(path.sep + 'manolos')
        ) {
          throw new Error('disk full');
        }
        return originalRenameSync(fromPath, toPath);
      });

    await expect(
      readImportedStateArchive(archive, 'manolos'),
    ).rejects.toMatchObject({
      message: 'Vientipaketin palautus epäonnistui.',
    });
    expect(fs.readFileSync(path.join(sourceRoot, 'old.txt'), 'utf8')).toBe(
      'old-data',
    );

    renameSpy.mockRestore();
  });
});
