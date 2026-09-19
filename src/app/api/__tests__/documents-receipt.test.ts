import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ApiRouteError } from '@/lib/api-helpers';

const { resolveRequestDbPath, runWithRequestDb } = vi.hoisted(() => ({
  resolveRequestDbPath: vi.fn(),
  runWithRequestDb: vi.fn(),
}));

vi.mock('@/lib/db/connection', () => ({
  resolveRequestDbPath,
  runWithRequestDb,
}));

const { updateDocumentReceiptAction, uploadDocumentReceiptAction } = vi.hoisted(
  () => ({
    updateDocumentReceiptAction: vi.fn(),
    uploadDocumentReceiptAction: vi.fn(),
  }),
);

vi.mock('@/actions/app-actions', () => ({
  updateDocumentReceiptAction,
  uploadDocumentReceiptAction,
  deleteDocumentReceiptAction: vi.fn(),
}));

import { PATCH, POST } from '../documents/[id]/receipt/route';

function routeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(id: string, body: unknown) {
  return new NextRequest(`http://localhost/api/documents/${id}/receipt`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'datasource=demo',
    },
    body: JSON.stringify(body),
  });
}

function uploadRequest(id: string, file?: File, withMultipartHeader = true) {
  const formData = new FormData();
  if (file) {
    formData.set('file', file);
  }

  return new NextRequest(`http://localhost/api/documents/${id}/receipt`, {
    method: 'POST',
    headers: withMultipartHeader
      ? { Cookie: 'datasource=demo' }
      : { 'Content-Type': 'application/json' },
    body: withMultipartHeader ? formData : JSON.stringify({}),
  });
}

describe('document receipt route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveRequestDbPath.mockResolvedValue('/fake/path');
    runWithRequestDb.mockImplementation(
      (_path: string, fn: () => unknown) => fn(),
    );
  });

  it('clears the manual receipt link through PATCH', async () => {
    updateDocumentReceiptAction.mockResolvedValue({
      receiptPath: null,
      receiptSource: null,
    });

    const response = await PATCH(
      patchRequest('5', { receiptPath: null }) as NextRequest,
      routeParams('5'),
    );

    expect(response.status).toBe(200);
    expect(updateDocumentReceiptAction).toHaveBeenCalledWith(5, {
      receiptPath: null,
    });
    await expect(response.json()).resolves.toEqual({
      receiptPath: null,
      receiptSource: null,
    });
  });

  it('rejects uploads that are not sent as multipart form data', async () => {
    const response = await POST(
      uploadRequest('5', undefined, false) as NextRequest,
      routeParams('5'),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Send PDF as multipart form',
    });
  });

  it('rejects non-pdf uploads', async () => {
    const file = new File(['plain'], 'notes.txt', { type: 'text/plain' });

    const response = await POST(
      uploadRequest('5', file) as NextRequest,
      routeParams('5'),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Vain PDF-tiedostot ovat sallittuja',
    });
    expect(uploadDocumentReceiptAction).not.toHaveBeenCalled();
  });

  it('stores uploaded pdf files and returns the resolved receipt payload', async () => {
    uploadDocumentReceiptAction.mockResolvedValue({
      receiptPath: 'tositteet/2025-2025/MU-7.pdf',
      receiptSource: 'manual',
    });
    const file = new File([Buffer.from('%PDF-1.4')], 'receipt.pdf', {
      type: 'application/pdf',
    });

    const response = await POST(
      uploadRequest('5', file) as NextRequest,
      routeParams('5'),
    );

    expect(response.status).toBe(200);
    expect(uploadDocumentReceiptAction).toHaveBeenCalledWith(5, file);
    await expect(response.json()).resolves.toEqual({
      receiptPath: 'tositteet/2025-2025/MU-7.pdf',
      receiptSource: 'manual',
    });
  });

  it('maps locked-period failures to 423 responses', async () => {
    uploadDocumentReceiptAction.mockRejectedValue(
      new ApiRouteError('Tilikausi on lukittu. Kausi on vain luku -tilassa.', 423),
    );

    const file = new File([Buffer.from('%PDF-1.4')], 'receipt.pdf', {
      type: 'application/pdf',
    });

    const response = await POST(
      uploadRequest('5', file) as NextRequest,
      routeParams('5'),
    );

    expect(response.status).toBe(423);
    await expect(response.json()).resolves.toEqual({
      error: 'Tilikausi on lukittu. Kausi on vain luku -tilassa.',
    });
  });
});
