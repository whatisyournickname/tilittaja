import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ApiRouteError } from '@/lib/api-helpers';

const { createNewDatabase, linkExternalDatabase } = vi.hoisted(() => ({
  createNewDatabase: vi.fn(),
  linkExternalDatabase: vi.fn(),
}));

const { importStateArchiveAsNewSource } = vi.hoisted(() => ({
  importStateArchiveAsNewSource: vi.fn(),
}));

const { getEnv } = vi.hoisted(() => ({
  getEnv: vi.fn(),
}));

vi.mock('@/lib/db/bootstrap', () => ({
  createNewDatabase,
  linkExternalDatabase,
}));

vi.mock('@/lib/state-transfer', () => ({
  importStateArchiveAsNewSource,
}));

vi.mock('@/lib/env', () => ({
  getEnv,
}));

import { POST } from '../setup/route';

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function zipRequest(file: File) {
  const formData = new FormData();
  formData.set('file', file);
  return new NextRequest('http://localhost/api/setup', {
    method: 'POST',
    body: formData,
  });
}

describe('POST /api/setup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEnv.mockReturnValue({ NODE_ENV: 'test' });
    importStateArchiveAsNewSource.mockResolvedValue({
      slug: 'tuotu',
      fileCount: 1,
    });
  });

  it('rejects new setup without company name', async () => {
    const response = await POST(
      jsonRequest({
        mode: 'new',
        companyName: '   ',
        periodYear: 2025,
      }) as NextRequest,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Yrityksen nimi puuttuu',
    });
    expect(createNewDatabase).not.toHaveBeenCalled();
  });

  it('creates a new database and sets cookie', async () => {
    const response = await POST(
      jsonRequest({
        mode: 'new',
        companyName: 'Ääliö Oy',
        businessId: '1234567-8',
        periodYear: 2025,
      }) as NextRequest,
    );

    expect(response.status).toBe(200);
    expect(createNewDatabase).toHaveBeenCalledWith('aalio-oy', {
      companyName: 'Ääliö Oy',
      businessId: '1234567-8',
      periodStartDate: new Date(2025, 0, 1).getTime(),
      periodEndDate: new Date(2025, 11, 31).getTime(),
    });
    expect(response.headers.get('set-cookie')).toContain('datasource=aalio-oy');
  });

  it('rejects external setup without file path', async () => {
    const response = await POST(
      jsonRequest({ mode: 'external', filePath: '   ' }) as NextRequest,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Tiedostopolku puuttuu',
    });
  });

  it('links an external database using the provided slug name', async () => {
    const response = await POST(
      jsonRequest({
        mode: 'external',
        filePath: ' /tmp/app.sqlite ',
        name: 'Mökki Öy',
      }) as NextRequest,
    );

    expect(response.status).toBe(200);
    expect(linkExternalDatabase).toHaveBeenCalledWith(
      '/tmp/app.sqlite',
      'mokki-oy',
    );
    expect(response.headers.get('set-cookie')).toContain('datasource=mokki-oy');
  });

  it('rejects unknown setup modes', async () => {
    const response = await POST(
      jsonRequest({ mode: 'mystery' }) as NextRequest,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Tuntematon tila',
    });
  });

  it('imports a zip archive from multipart form data', async () => {
    const file = new File([Buffer.from('zip')], 'state.zip', {
      type: 'application/zip',
    });

    const response = await POST(zipRequest(file) as NextRequest);

    expect(response.status).toBe(200);
    expect(importStateArchiveAsNewSource).toHaveBeenCalled();
    expect(response.headers.get('set-cookie')).toContain('datasource=tuotu');
  });

  it('rejects non-zip multipart uploads', async () => {
    const file = new File(['plain'], 'notes.txt', { type: 'text/plain' });

    const response = await POST(zipRequest(file) as NextRequest);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Only ZIP files are allowed',
    });
  });

  it('maps ApiRouteError failures to their status code', async () => {
    importStateArchiveAsNewSource.mockRejectedValue(
      new ApiRouteError('Tietolähde on jo olemassa', 409),
    );

    const file = new File([Buffer.from('zip')], 'state.zip', {
      type: 'application/zip',
    });

    const response = await POST(zipRequest(file) as NextRequest);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'Tietolähde on jo olemassa',
    });
  });
});
