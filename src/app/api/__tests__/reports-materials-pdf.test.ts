import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { resolveRequestDbPath, runWithRequestDb } = vi.hoisted(() => ({
  resolveRequestDbPath: vi.fn(),
  runWithRequestDb: vi.fn(),
}));

vi.mock('@/lib/db/connection', () => ({
  resolveRequestDbPath,
  runWithRequestDb,
}));

const { buildMaterialPdf, isMaterialKind } = vi.hoisted(() => ({
  buildMaterialPdf: vi.fn(),
  isMaterialKind: vi.fn(),
}));

vi.mock('@/lib/financial-statement-materials', () => ({
  buildMaterialPdf,
  isMaterialKind,
}));

const { pdfResponse: pdfResponseMock } = vi.hoisted(() => ({
  pdfResponse: vi.fn(),
}));

vi.mock('@/lib/pdf/pdf-response', () => ({
  pdfResponse: pdfResponseMock,
}));

import { GET } from '../reports/materials/pdf/route';

describe('GET /api/reports/materials/pdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveRequestDbPath.mockResolvedValue('/fake/path');
    runWithRequestDb.mockImplementation(
      (_: string, fn: () => unknown) => fn(),
    );
  });

  it('returns 400 for invalid material kind', async () => {
    isMaterialKind.mockReturnValue(false);

    const request = new NextRequest(
      'http://localhost/api/reports/materials/pdf?kind=invalid',
    );
    const response = await GET(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Virheellinen materiaali');
  });

  it('builds material PDF and returns response', async () => {
    isMaterialKind.mockReturnValue(true);

    const buffer = Buffer.from('pdf-content');
    const filename = 'general-ledger.pdf';
    buildMaterialPdf.mockResolvedValue({ buffer, filename });
    pdfResponseMock.mockReturnValue(new Response('ok'));

    const request = new NextRequest(
      'http://localhost/api/reports/materials/pdf?kind=general-ledger',
    );
    const response = await GET(request);

    expect(response).toBeDefined();
    expect(buildMaterialPdf).toHaveBeenCalledWith('general-ledger', undefined);
    expect(pdfResponseMock).toHaveBeenCalledWith(buffer, filename, {
      inline: false,
    });
  });

  it('passes period param to buildMaterialPdf', async () => {
    isMaterialKind.mockReturnValue(true);

    const buffer = Buffer.from('pdf-content');
    const filename = 'general-ledger.pdf';
    buildMaterialPdf.mockResolvedValue({ buffer, filename });
    pdfResponseMock.mockReturnValue(new Response('ok'));

    const request = new NextRequest(
      'http://localhost/api/reports/materials/pdf?kind=general-ledger&period=2',
    );
    await GET(request);

    expect(buildMaterialPdf).toHaveBeenCalledWith('general-ledger', 2);
  });
});
