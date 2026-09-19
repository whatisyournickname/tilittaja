import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const { getDataSources, resolveDbPath } = vi.hoisted(() => ({
  getDataSources: vi.fn(),
  resolveDbPath: vi.fn(),
}));

const { cookieGet } = vi.hoisted(() => ({
  cookieGet: vi.fn(),
}));

const { getEnv } = vi.hoisted(() => ({
  getEnv: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getDataSources,
  resolveDbPath,
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: cookieGet,
  })),
}));

vi.mock('@/lib/env', () => ({
  getEnv,
}));

import { GET, POST } from '../datasources/route';

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/datasources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('datasources route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDataSources.mockReturnValue([
      { slug: 'demo', name: 'Demo Oy' },
      { slug: 'archive', name: 'Archive Oy' },
    ]);
    cookieGet.mockReturnValue({ value: 'demo' });
    resolveDbPath.mockReturnValue('/tmp/demo.sqlite');
    getEnv.mockReturnValue({ NODE_ENV: 'test' });
  });

  it('returns datasources and current cookie value', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      dataSources: [
        { slug: 'demo', name: 'Demo Oy' },
        { slug: 'archive', name: 'Archive Oy' },
      ],
      current: 'demo',
    });
  });

  it('falls back to the default datasource slug', async () => {
    cookieGet.mockReturnValue(undefined);

    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      dataSources: [
        { slug: 'demo', name: 'Demo Oy' },
        { slug: 'archive', name: 'Archive Oy' },
      ],
      current: 'demo',
    });
  });

  it('rejects invalid datasource slugs', async () => {
    resolveDbPath.mockReturnValue(null);

    const response = await POST(
      jsonRequest({ slug: 'missing' }) as NextRequest,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid datasource',
    });
  });

  it('sets the datasource cookie on success', async () => {
    const response = await POST(jsonRequest({ slug: 'demo' }) as NextRequest);

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('datasource=demo');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('SameSite=lax');
  });
});
