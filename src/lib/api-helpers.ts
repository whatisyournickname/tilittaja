import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveRequestDbPath, runWithRequestDb } from '@/lib/db/connection';

export class ApiRouteError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ApiRouteError';
    this.status = status;
  }
}

export function jsonError(message: string, status = 500): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function jsonActionError(
  error: unknown,
  fallbackMessage: string,
  businessStatus = 400,
): NextResponse {
  if (error instanceof z.ZodError) {
    const message = error.issues[0]?.message || 'Invalid input';
    return jsonError(message, 400);
  }

  if (error instanceof Error) {
    const status =
      typeof (error as Error & { status?: number }).status === 'number'
        ? (error as Error & { status?: number }).status
        : error.message === fallbackMessage
          ? 500
          : businessStatus;
    return jsonError(
      error.message || fallbackMessage,
      status,
    );
  }

  return jsonError(fallbackMessage);
}

export async function requireRouteId(
  params: Promise<{ id: string }>,
  label = 'tunniste',
): Promise<number> {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    throw new ApiRouteError(`Virheellinen ${label}`, 400);
  }
  return numId;
}

export function requireResource<T>(
  resource: T | undefined | null,
  message: string,
): T {
  if (resource == null) {
    throw new ApiRouteError(message, 404);
  }
  return resource;
}

export function isMultipartRequest(request: Request): boolean {
  return (request.headers.get('content-type') || '').includes(
    'multipart/form-data',
  );
}

export function isPdfFile(file: File): boolean {
  return (
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  );
}

export async function readRequestJson<T = unknown>(
  request: Request,
  invalidMessage = 'Virheellinen JSON-data',
): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiRouteError(invalidMessage, 400);
  }
}

export async function readOptionalRequestJson(
  request: Request,
): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function readRequestFormData(
  request: Request,
  invalidMessage = 'Virheellinen lomakedata',
): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    throw new ApiRouteError(invalidMessage, 400);
  }
}

export async function readJsonResponse<T = unknown>(
  response: Response,
  invalidMessage: string,
  status = 502,
): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    if (!response.ok) {
      return null;
    }
    throw new ApiRouteError(invalidMessage, status);
  }
}

export function jsonActionRoute<TArgs extends unknown[], TResult>(
  handler: (...args: TArgs) => Promise<TResult>,
  fallbackMessage: string,
  responseInit?: ResponseInit,
): (...args: TArgs) => Promise<NextResponse> {
  return async (...args: TArgs) => {
    try {
      const result = await handler(...args);
      return NextResponse.json(result, responseInit);
    } catch (error) {
      return jsonActionError(error, fallbackMessage);
    }
  };
}

/**
 * Wraps an API route handler with request-scoped DB initialization and
 * centralized error handling. Resolves the datasource from the request
 * cookie and makes it available to `getDb()` via AsyncLocalStorage.
 *
 * Catches `ApiRouteError` (business-rule violations) and `ZodError`
 * (input validation failures) and maps them to structured JSON errors.
 *
 * **When to use API routes vs server actions:**
 * - API routes: binary responses (PDF/ZIP), endpoints consumed by
 *   non-React clients, or GET endpoints that return JSON.
 * - Server actions (`src/actions/`): mutations triggered from React
 *   client components. They use `runDbAction` for the same DB scoping
 *   and call `revalidatePath` to refresh server-rendered data.
 */
export function withDb<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<NextResponse>,
  errorMessage = 'Odottamaton virhe',
): (...args: TArgs) => Promise<NextResponse> {
  const wrapped = async (...args: TArgs) => {
    try {
      const dbPath = await resolveRequestDbPath();
      return await runWithRequestDb(dbPath, () => handler(...args));
    } catch (error) {
      if (error instanceof ApiRouteError) {
        return jsonError(error.message, error.status);
      }
      if (error instanceof z.ZodError) {
        const message = error.issues[0]?.message || 'Invalid input';
        return jsonError(message, 400);
      }
      console.error(errorMessage, error);
      return jsonError(errorMessage);
    }
  };
  return wrapped;
}
