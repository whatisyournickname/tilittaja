import { describe, expect, it, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const { resolveRequestDbPath, runWithRequestDb } = vi.hoisted(() => ({
  resolveRequestDbPath: vi.fn(),
  runWithRequestDb: vi.fn(),
}));
const { revalidatePath } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/db/connection', () => ({
  resolveRequestDbPath,
  runWithRequestDb,
}));
vi.mock('next/cache', () => ({
  revalidatePath,
}));

import { ApiRouteError } from '@/lib/api-helpers';
import { revalidateApp, runDbAction } from './_helpers';

describe('runDbAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveRequestDbPath.mockResolvedValue('/tmp/test.sqlite');
    runWithRequestDb.mockImplementation(
      async (_dbPath: string, action: () => unknown) => action(),
    );
  });

  it('runs the action inside the resolved request database', async () => {
    await expect(runDbAction(() => 'ok', 'fallback')).resolves.toBe('ok');
    expect(resolveRequestDbPath).toHaveBeenCalled();
    expect(runWithRequestDb).toHaveBeenCalledWith(
      '/tmp/test.sqlite',
      expect.any(Function),
    );
  });

  it('formats zod validation errors', async () => {
    const schema = z.object({
      name: z.string().min(1, 'Nimi puuttuu'),
    });

    await expect(
      runDbAction(() => schema.parse({ name: '' }), 'fallback'),
    ).rejects.toThrow('Nimi puuttuu');
  });

  it('returns ApiRouteError messages directly', async () => {
    await expect(
      runDbAction(() => {
        throw new ApiRouteError('Lukittu', 423);
      }, 'fallback'),
    ).rejects.toThrow('Lukittu');
  });

  it('wraps generic Error instances with the fallback message', async () => {
    await expect(
      runDbAction(() => {
        throw new Error('Boom');
      }, 'fallback'),
    ).rejects.toThrow('fallback');
  });

  it('uses the fallback message for unknown error values', async () => {
    await expect(
      runDbAction(() => {
        throw 'mystery';
      }, 'Tuntematon virhe'),
    ).rejects.toThrow('Tuntematon virhe');
  });
});

describe('revalidateApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('revalidates shared app pages and deduplicates extras', () => {
    revalidateApp(['/settings/recurring-rent', '/settings']);

    expect(revalidatePath).toHaveBeenNthCalledWith(1, '/', 'layout');
    expect(revalidatePath).toHaveBeenCalledWith('/documents');
    expect(revalidatePath).toHaveBeenCalledWith('/accounts');
    expect(revalidatePath).toHaveBeenCalledWith('/bank-statements');
    expect(revalidatePath).toHaveBeenCalledWith('/settings');
    expect(revalidatePath).toHaveBeenCalledWith('/settings/recurring-rent');
    expect(revalidatePath).toHaveBeenCalledWith('/vat');
    expect(revalidatePath).toHaveBeenCalledWith('/reports/financial-statement');
    expect(revalidatePath).toHaveBeenCalledTimes(8);
  });
});
