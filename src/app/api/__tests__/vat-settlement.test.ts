import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { ApiRouteError } from '@/lib/api-helpers';

const { createVatSettlementAction } = vi.hoisted(() => ({
  createVatSettlementAction: vi.fn(),
}));

vi.mock('@/actions/app-actions', () => ({
  createVatSettlementAction,
}));

import { POST } from '../vat/settlement/route';

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/vat/settlement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/vat/settlement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with the created settlement document', async () => {
    createVatSettlementAction.mockResolvedValue({ id: 99, number: 15 });

    const res = await POST(
      jsonRequest({ periodId: 1, date: 1_700_000_000_000 }) as NextRequest,
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ id: 99, number: 15 });
    expect(createVatSettlementAction).toHaveBeenCalledWith({
      periodId: 1,
      date: 1_700_000_000_000,
    });
  });

  it('returns 400 when the action rejects with a business error', async () => {
    createVatSettlementAction.mockRejectedValue(
      new ApiRouteError('Ei siirrettävää saldoa', 400),
    );

    const res = await POST(
      jsonRequest({ periodId: 1, date: 1_700_000_000_000 }) as NextRequest,
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('saldoa');
  });

  it('returns 423 when the action rejects with a locked-period error', async () => {
    createVatSettlementAction.mockRejectedValue(
      new ApiRouteError(
        'Tilikausi on lukittu. Kausi on vain luku -tilassa.',
        423,
      ),
    );

    const res = await POST(
      jsonRequest({ periodId: 1, date: 1_700_000_000_000 }) as NextRequest,
    );
    expect(res.status).toBe(423);
    await expect(res.json()).resolves.toEqual({
      error: 'Tilikausi on lukittu. Kausi on vain luku -tilassa.',
    });
  });

  it('returns 500 when the action rejects with the fallback error', async () => {
    createVatSettlementAction.mockRejectedValue(
      new Error('Failed to generate VAT return.'),
    );

    const res = await POST(
      jsonRequest({ periodId: 1, date: 1_700_000_000_000 }) as NextRequest,
    );
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: 'Failed to generate VAT return.',
    });
  });
});
