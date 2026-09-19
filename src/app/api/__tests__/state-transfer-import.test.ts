import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ApiRouteError } from '@/lib/api-helpers';

const { closeDbConnection, resolveDbPath, resolveRequestDataSource } = vi.hoisted(
  () => ({
  closeDbConnection: vi.fn(),
  resolveDbPath: vi.fn(),
    resolveRequestDataSource: vi.fn(),
  }),
);

const { readImportedStateArchive } = vi.hoisted(() => ({
  readImportedStateArchive: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  closeDbConnection,
  resolveDbPath,
  resolveRequestDataSource,
}));

vi.mock('@/lib/state-transfer', () => ({
  readImportedStateArchive,
}));

import { POST } from '../state-transfer/import/route';

function zipRequest(file: File, cookie = 'datasource=demo') {
  const formData = new FormData();
  formData.set('file', file);
  return new NextRequest('http://localhost/api/state-transfer/import', {
    method: 'POST',
    headers: {
      cookie,
    },
    body: formData,
  });
}

describe('POST /api/state-transfer/import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveDbPath.mockReturnValue('/tmp/demo.sqlite');
    resolveRequestDataSource.mockReturnValue('demo');
    readImportedStateArchive.mockResolvedValue({
      fileCount: 3,
      manifest: {
        sourceName: 'Demo Oy',
        createdAt: '2026-04-05T00:00:00.000Z',
      },
    });
  });

  it('rejects requests without a file', async () => {
    const request = new NextRequest(
      'http://localhost/api/state-transfer/import',
      {
        method: 'POST',
        body: new FormData(),
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Send one ZIP file in `file` field',
    });
  });

  it('rejects non-zip uploads', async () => {
    const response = await POST(
      zipRequest(new File(['plain'], 'notes.txt', { type: 'text/plain' })),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Only ZIP packages are allowed',
    });
  });

  it('returns 404 when the active datasource database is missing', async () => {
    resolveDbPath.mockReturnValue(null);

    const response = await POST(
      zipRequest(
        new File([Buffer.from('zip')], 'state.zip', {
          type: 'application/zip',
        }),
      ),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Active datasource SQLite database not found',
    });
    expect(closeDbConnection).not.toHaveBeenCalled();
  });

  it('closes the datasource connection and returns import summary', async () => {
    const response = await POST(
      zipRequest(
        new File([Buffer.from('zip')], 'state.zip', {
          type: 'application/zip',
        }),
      ),
    );

    expect(response.status).toBe(200);
    expect(closeDbConnection).toHaveBeenCalledWith('/tmp/demo.sqlite');
    expect(readImportedStateArchive).toHaveBeenCalledWith(
      expect.any(Buffer),
      'demo',
    );
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      source: 'demo',
      fileCount: 3,
      manifest: {
        sourceName: 'Demo Oy',
      },
    });
  });

  it('maps ApiRouteError failures', async () => {
    readImportedStateArchive.mockRejectedValue(
      new ApiRouteError('Invalid package', 400),
    );

    const response = await POST(
      zipRequest(
        new File([Buffer.from('zip')], 'state.zip', {
          type: 'application/zip',
        }),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid package',
    });
  });
});
