import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { resolveRequestDbPath, runWithRequestDb } from '@/lib/db/connection';
import { ApiRouteError } from '@/lib/api-helpers';

type ActionError = Error & { status?: number };

const baseRevalidationPaths = [
  '/documents',
  '/accounts',
  '/bank-statements',
  '/settings',
  '/vat',
  '/reports/financial-statement',
] as const;

function formatZodError(error: z.ZodError): string {
  return error.issues[0]?.message || 'Invalid input.';
}

function withStatus(message: string, status: number): ActionError {
  const wrapped = new Error(message) as ActionError;
  wrapped.status = status;
  return wrapped;
}

function formatActionError(error: unknown, fallbackMessage: string): ActionError {
  if (error instanceof ApiRouteError) {
    return withStatus(error.message, error.status);
  }

  if (error instanceof z.ZodError) {
    return withStatus(formatZodError(error), 400);
  }

  return withStatus(fallbackMessage, 500);
}

export async function runDbAction<T>(
  action: () => Promise<T> | T,
  fallbackMessage: string,
): Promise<T> {
  try {
    const dbPath = await resolveRequestDbPath();
    return await runWithRequestDb(dbPath, () => action());
  } catch (error) {
    throw formatActionError(error, fallbackMessage);
  }
}

export function revalidateApp(extraPaths: string[] = []): void {
  revalidatePath('/', 'layout');

  for (const path of new Set([...baseRevalidationPaths, ...extraPaths])) {
    revalidatePath(path);
  }
}
