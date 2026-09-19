import { NextRequest, NextResponse } from 'next/server';
import { getDataSources, resolveDbPath } from '@/lib/db';
import { cookies } from 'next/headers';
import { getEnv } from '@/lib/env';

export async function GET() {
  const dataSources = getDataSources();
  const cookieStore = await cookies();
  const current = cookieStore.get('datasource')?.value ?? dataSources[0]?.slug ?? null;
  return NextResponse.json({ dataSources, current });
}

export async function POST(request: NextRequest) {
  const env = getEnv();
  const { slug } = await request.json();
  const dbPath = resolveDbPath(slug);
  if (!dbPath) {
    return NextResponse.json(
      { error: 'Invalid datasource' },
      { status: 400 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set('datasource', slug, {
    path: '/',
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}
