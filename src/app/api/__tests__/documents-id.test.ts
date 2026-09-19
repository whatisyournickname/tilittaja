import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { ApiRouteError } from '@/lib/api-helpers';

const { updateDocumentAction, deleteDocumentAction } = vi.hoisted(() => ({
  updateDocumentAction: vi.fn(),
  deleteDocumentAction: vi.fn(),
}));

vi.mock('@/actions/app-actions', () => ({
  updateDocumentAction,
  deleteDocumentAction,
}));

import { DELETE, PATCH } from '../documents/[id]/route';

function patchRequest(id: string, body: unknown) {
  return new Request(`http://localhost/api/documents/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function routeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/documents/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for non-numeric id', async () => {
    const res = await PATCH(
      patchRequest('abc', { date: 1 }) as NextRequest,
      routeParams('abc'),
    );
    expect(res.status).toBe(400);
    expect(updateDocumentAction).not.toHaveBeenCalled();
  });

  it('returns 400 for id zero', async () => {
    const res = await PATCH(
      patchRequest('0', { date: 1 }) as NextRequest,
      routeParams('0'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when document does not exist', async () => {
    updateDocumentAction.mockRejectedValue(
      new ApiRouteError('Document not found', 404),
    );
    const res = await PATCH(
      patchRequest('99', { date: 1 }) as NextRequest,
      routeParams('99'),
    );
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('Document not found');
  });

  it('returns 400 when body has no valid date or metadata fields', async () => {
    updateDocumentAction.mockRejectedValue(
      new ApiRouteError('Invalid document update', 400),
    );

    const res = await PATCH(
      patchRequest('5', { foo: 1 }) as NextRequest,
      routeParams('5'),
    );
    expect(res.status).toBe(400);
    expect(updateDocumentAction).toHaveBeenCalledWith(5, { foo: 1 });
  });

  it('updates date and returns merged JSON shape', async () => {
    updateDocumentAction.mockResolvedValue({
      id: 5,
      date: 2_000_000_000_000,
      category: 'kulut',
      name: 'Lasku',
    });

    const res = await PATCH(
      patchRequest('5', { date: 2_000_000_000_000 }) as NextRequest,
      routeParams('5'),
    );
    expect(res.status).toBe(200);
    expect(updateDocumentAction).toHaveBeenCalledWith(5, {
      date: 2_000_000_000_000,
    });
    const data = await res.json();
    expect(data).toEqual({
      id: 5,
      date: 2_000_000_000_000,
      category: 'kulut',
      name: 'Lasku',
    });
  });

  it('returns 423 when the document period is locked', async () => {
    updateDocumentAction.mockRejectedValue(
      new ApiRouteError('Tilikausi on lukittu. Kausi on vain luku -tilassa.', 423),
    );

    const res = await PATCH(
      patchRequest('5', { category: 'MU', name: 'Lukittu' }) as NextRequest,
      routeParams('5'),
    );

    expect(res.status).toBe(423);
    expect(updateDocumentAction).toHaveBeenCalled();
  });

  it('updates category and name when both are strings', async () => {
    updateDocumentAction.mockResolvedValue({
      id: 5,
      date: 1_700_000_000_000,
      category: 'other',
      name: 'Tosite',
    });

    const res = await PATCH(
      patchRequest('5', { category: 'other', name: 'Tosite' }) as NextRequest,
      routeParams('5'),
    );
    expect(res.status).toBe(200);
    expect(updateDocumentAction).toHaveBeenCalledWith(5, {
      category: 'other',
      name: 'Tosite',
    });
    const data = await res.json();
    expect(data.id).toBe(5);
    expect(data.category).toBe('other');
    expect(data.name).toBe('Tosite');
  });

  it('returns 500 when database throws', async () => {
    updateDocumentAction.mockRejectedValue(
      new Error('Failed to update document'),
    );

    const res = await PATCH(
      patchRequest('5', { date: 1 }) as NextRequest,
      routeParams('5'),
    );
    expect(res.status).toBe(500);
  });
});

describe('DELETE /api/documents/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when document is missing', async () => {
    deleteDocumentAction.mockRejectedValue(
      new ApiRouteError('Document not found', 404),
    );
    const req = new Request('http://localhost/api/documents/3', {
      method: 'DELETE',
    });
    const res = await DELETE(req as NextRequest, routeParams('3'));
    expect(res.status).toBe(404);
    expect(deleteDocumentAction).toHaveBeenCalledWith(3);
  });

  it('returns 200 and deletes existing document', async () => {
    deleteDocumentAction.mockResolvedValue({ ok: true });
    const req = new Request('http://localhost/api/documents/5', {
      method: 'DELETE',
    });
    const res = await DELETE(req as NextRequest, routeParams('5'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true });
    expect(deleteDocumentAction).toHaveBeenCalledWith(5);
  });

  it('returns 423 when deleting a document from a locked period', async () => {
    deleteDocumentAction.mockRejectedValue(
      new ApiRouteError('Tilikausi on lukittu. Kausi on vain luku -tilassa.', 423),
    );

    const req = new Request('http://localhost/api/documents/5', {
      method: 'DELETE',
    });
    const res = await DELETE(req as NextRequest, routeParams('5'));

    expect(res.status).toBe(423);
    expect(deleteDocumentAction).toHaveBeenCalledWith(5);
  });
});
