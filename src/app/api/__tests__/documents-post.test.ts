import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { ApiRouteError } from '@/lib/api-helpers';

const { createDocumentAction } = vi.hoisted(() => ({
  createDocumentAction: vi.fn(),
}));

vi.mock('@/actions/app-actions', () => ({
  createDocumentAction,
}));

import { POST } from '../documents/route';

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/documents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when periodId is missing', async () => {
    createDocumentAction.mockRejectedValue(
      new ApiRouteError('Arvon pitää olla positiivinen', 400),
    );

    const res = await POST(
      jsonRequest({
        date: 1,
        entries: [
          { accountNumber: '3000', debit: true, amount: 100, rowNumber: 1 },
        ],
      }) as NextRequest,
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeTruthy();
    expect(createDocumentAction).toHaveBeenCalled();
  });

  it('returns 200 with the action payload', async () => {
    createDocumentAction.mockResolvedValue({ id: 42, number: 7 });

    const body = {
      periodId: 1,
      date: 1_700_000_000_000,
      entries: [
        {
          accountNumber: '3000',
          debit: true,
          amount: 120,
          description: 'Test',
          rowNumber: 1,
        },
      ],
    };
    const res = await POST(
      jsonRequest(body) as NextRequest,
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ id: 42, number: 7 });
    expect(createDocumentAction).toHaveBeenCalledWith(body);
  });

  it('maps business validation errors to 400', async () => {
    createDocumentAction.mockRejectedValue(
      new ApiRouteError('Tiliä 9999 ei löydy', 400),
    );

    const res = await POST(
      jsonRequest({
        periodId: 1,
        date: 1,
        entries: [
          { accountNumber: '9999', debit: true, amount: 50, rowNumber: 1 },
        ],
      }) as NextRequest,
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Tiliä 9999 ei löydy' });
  });

  it('returns 423 when the target period is locked', async () => {
    createDocumentAction.mockRejectedValue(
      new ApiRouteError('Tilikausi on lukittu. Kausi on vain luku -tilassa.', 423),
    );

    const res = await POST(
      jsonRequest({
        periodId: 1,
        date: 1_700_000_000_000,
        entries: [
          { accountNumber: '3000', debit: true, amount: 100, rowNumber: 1 },
        ],
      }) as NextRequest,
    );

    expect(res.status).toBe(423);
    expect(createDocumentAction).toHaveBeenCalled();
  });

  it('returns 500 when database throws', async () => {
    createDocumentAction.mockRejectedValue(
      new Error('Failed to create document'),
    );

    const res = await POST(
      jsonRequest({
        periodId: 1,
        date: 1,
        entries: [
          { accountNumber: '3000', debit: true, amount: 100, rowNumber: 1 },
        ],
      }) as NextRequest,
    );
    expect(res.status).toBe(500);
  });
});
