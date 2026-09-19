import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { ApiRouteError } from '@/lib/api-helpers';

const {
  updateCompanyInfoAction,
  updateEntryDescriptionAction,
  updateEntryAccountAction,
} = vi.hoisted(() => ({
  updateCompanyInfoAction: vi.fn(),
  updateEntryDescriptionAction: vi.fn(),
  updateEntryAccountAction: vi.fn(),
}));

vi.mock('@/actions/app-actions', () => ({
  updateCompanyInfoAction,
  updateEntryDescriptionAction,
  updateEntryAccountAction,
}));

import { PATCH as patchEntry } from '../entries/[id]/route';
import { POST as postCompany } from '../settings/company/route';

function routeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/settings/company', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when name is whitespace-only', async () => {
    updateCompanyInfoAction.mockRejectedValue(
      new ApiRouteError('Yrityksen nimi on pakollinen', 400),
    );
    const req = new Request('http://localhost/api/settings/company', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '   ', businessId: '123' }),
    }) as NextRequest;
    const res = await postCompany(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Yrityksen nimi on pakollinen');
    expect(updateCompanyInfoAction).toHaveBeenCalledWith({
      name: '   ',
      businessId: '123',
    });
  });

  it('returns 200 and forwards company info to the action', async () => {
    updateCompanyInfoAction.mockResolvedValue({ ok: true });
    const req = new Request('http://localhost/api/settings/company', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: ' Oy Testi ', businessId: ' 556677-8 ' }),
    }) as NextRequest;
    const res = await postCompany(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true });
    expect(updateCompanyInfoAction).toHaveBeenCalledWith({
      name: ' Oy Testi ',
      businessId: ' 556677-8 ',
    });
  });

  it('forwards a payload without businessId when omitted', async () => {
    updateCompanyInfoAction.mockResolvedValue({ ok: true });
    const req = new Request('http://localhost/api/settings/company', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Firma' }),
    }) as NextRequest;
    const res = await postCompany(req);
    expect(res.status).toBe(200);
    expect(updateCompanyInfoAction).toHaveBeenCalledWith({ name: 'Firma' });
  });

  it('returns 500 when database throws', async () => {
    updateCompanyInfoAction.mockRejectedValue(
      new Error('Failed to save company info'),
    );

    const req = new Request('http://localhost/api/settings/company', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test' }),
    }) as NextRequest;
    const res = await postCompany(req);
    expect(res.status).toBe(500);
  });
});

describe('PATCH /api/entries/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for invalid entry id', async () => {
    const req = new Request('http://localhost/api/entries/x', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'x' }),
    }) as NextRequest;
    const res = await patchEntry(req, routeParams('x'));
    expect(res.status).toBe(400);
    expect(updateEntryDescriptionAction).not.toHaveBeenCalled();
    expect(updateEntryAccountAction).not.toHaveBeenCalled();
  });

  it('returns 400 when neither description nor accountId is valid', async () => {
    const req = new Request('http://localhost/api/entries/1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }) as NextRequest;
    const res = await patchEntry(req, routeParams('1'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Anna joko kuvaus tai tili');
  });

  it('returns 404 when entry is missing', async () => {
    updateEntryDescriptionAction.mockRejectedValue(
      new ApiRouteError('Entry row not found', 404),
    );
    const req = new Request('http://localhost/api/entries/99', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'New' }),
    }) as NextRequest;
    const res = await patchEntry(req, routeParams('99'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when accountId is set but account does not exist', async () => {
    updateEntryAccountAction.mockRejectedValue(
      new ApiRouteError('Account not found', 404),
    );
    const req = new Request('http://localhost/api/entries/10', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: 999 }),
    }) as NextRequest;
    const res = await patchEntry(req, routeParams('10'));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('Account not found');
    expect(updateEntryAccountAction).toHaveBeenCalledWith(10, { accountId: 999 });
  });

  it('updates description and returns JSON shape', async () => {
    updateEntryDescriptionAction.mockResolvedValue({
      id: 10,
      description: 'Updated text',
    });

    const req = new Request('http://localhost/api/entries/10', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'Updated text' }),
    }) as NextRequest;
    const res = await patchEntry(req, routeParams('10'));
    expect(res.status).toBe(200);
    expect(updateEntryDescriptionAction).toHaveBeenCalledWith(10, {
      description: 'Updated text',
    });
    const data = await res.json();
    expect(data).toEqual({
      id: 10,
      description: 'Updated text',
    });
  });

  it('updates account and includes account fields in response', async () => {
    updateEntryAccountAction.mockResolvedValue({
      id: 10,
      accountId: 2,
      accountNumber: '4000',
      accountName: 'Aineet',
    });

    const req = new Request('http://localhost/api/entries/10', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: 2 }),
    }) as NextRequest;
    const res = await patchEntry(req, routeParams('10'));
    expect(res.status).toBe(200);
    expect(updateEntryAccountAction).toHaveBeenCalledWith(10, { accountId: 2 });
    const data = await res.json();
    expect(data).toEqual({
      id: 10,
      accountId: 2,
      accountNumber: '4000',
      accountName: 'Aineet',
    });
  });

  it('returns 423 when the entry belongs to a locked period', async () => {
    updateEntryDescriptionAction.mockRejectedValue(
      new ApiRouteError('Tilikausi on lukittu. Kausi on vain luku -tilassa.', 423),
    );

    const req = new Request('http://localhost/api/entries/10', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'Updated text' }),
    }) as NextRequest;
    const res = await patchEntry(req, routeParams('10'));

    expect(res.status).toBe(423);
    expect(updateEntryDescriptionAction).toHaveBeenCalledWith(10, {
      description: 'Updated text',
    });
    expect(updateEntryAccountAction).not.toHaveBeenCalled();
  });

  it('returns 500 when database throws', async () => {
    updateEntryDescriptionAction.mockRejectedValue(
      new Error('Failed to update entry row'),
    );

    const req = new Request('http://localhost/api/entries/10', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'test' }),
    }) as NextRequest;
    const res = await patchEntry(req, routeParams('10'));
    expect(res.status).toBe(500);
  });
});
