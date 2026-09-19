import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { ApiRouteError } from '@/lib/api-helpers';

const { duplicateDocumentAction } = vi.hoisted(() => ({
  duplicateDocumentAction: vi.fn(),
}));

vi.mock('@/actions/app-actions', () => ({
  duplicateDocumentAction,
}));

import { POST } from '../documents/[id]/duplicate/route';

function postRequest() {
  return new Request('http://localhost/api/documents/42/duplicate', {
    method: 'POST',
  });
}

describe('POST /api/documents/[id]/duplicate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 with invalid id param', async () => {
    const res = await POST(postRequest() as NextRequest, {
      params: Promise.resolve({ id: 'abc' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when document does not exist', async () => {
    duplicateDocumentAction.mockRejectedValue(
      new ApiRouteError('Document not found', 404),
    );

    const res = await POST(postRequest() as NextRequest, {
      params: Promise.resolve({ id: '42' }),
    });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain('not found');
  });

  it('returns 400 when document has no entries', async () => {
    duplicateDocumentAction.mockRejectedValue(
      new ApiRouteError('Document has no entry rows to copy', 400),
    );

    const res = await POST(postRequest() as NextRequest, {
      params: Promise.resolve({ id: '42' }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('entry rows to copy');
  });

  it('returns 200 and duplicates document on success', async () => {
    duplicateDocumentAction.mockResolvedValue({
      document: {
        id: 100,
        number: 8,
        date: 1_700_000_000_000,
      },
    });

    const res = await POST(postRequest() as NextRequest, {
      params: Promise.resolve({ id: '42' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.document.id).toBe(100);
    expect(data.document.number).toBe(8);
    expect(duplicateDocumentAction).toHaveBeenCalledWith(42);
  });

  it('returns 423 when period is locked', async () => {
    duplicateDocumentAction.mockRejectedValue(
      new ApiRouteError('Tilikausi on lukittu. Kausi on vain luku -tilassa.', 423),
    );

    const res = await POST(postRequest() as NextRequest, {
      params: Promise.resolve({ id: '42' }),
    });
    expect(res.status).toBe(423);
    expect(duplicateDocumentAction).toHaveBeenCalledWith(42);
  });
});
