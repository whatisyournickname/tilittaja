import { NextRequest, NextResponse } from 'next/server';
import { createNewDatabase, linkExternalDatabase } from '@/lib/db/bootstrap';
import { importStateArchiveAsNewSource } from '@/lib/state-transfer';
import { ApiRouteError } from '@/lib/api-helpers';
import { getEnv } from '@/lib/env';
import { slugifyDataSourceName } from '@/lib/datasource-slug';

export const runtime = 'nodejs';

function makeResponse(slug: string) {
  const env = getEnv();
  const response = NextResponse.json({ ok: true, slug });
  response.cookies.set('datasource', slug, {
    path: '/',
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file');

      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: 'Send a ZIP file in the .file. field' },
          { status: 400 },
        );
      }

      if (
        !file.type.includes('zip') &&
        !file.name.toLowerCase().endsWith('.zip')
      ) {
        return NextResponse.json(
          { error: 'Vain ZIP-tiedostot ovat sallittuja' },
          { status: 400 },
        );
      }

      const archiveBuffer = Buffer.from(await file.arrayBuffer());
      const result = await importStateArchiveAsNewSource(archiveBuffer);
      return makeResponse(result.slug);
    }

    const body = await request.json();
    const { mode } = body as { mode: string };

    let slug: string;

    if (mode === 'new') {
      const { companyName, businessId, periodYear } = body as {
        companyName: string;
        businessId?: string;
        periodYear: number;
      };

      if (!companyName?.trim()) {
        return NextResponse.json(
          { error: 'Yrityksen nimi puuttuu' },
          { status: 400 },
        );
      }

      const year = periodYear || new Date().getFullYear();
      const startDate = new Date(year, 0, 1).getTime();
      const endDate = new Date(year, 11, 31).getTime();

      slug = slugifyDataSourceName(companyName);
      createNewDatabase(slug, {
        companyName: companyName.trim(),
        businessId: businessId?.trim(),
        periodStartDate: startDate,
        periodEndDate: endDate,
      });
    } else if (mode === 'external') {
      const { filePath, name } = body as { filePath: string; name?: string };

      if (!filePath?.trim()) {
        return NextResponse.json(
          { error: 'Tiedostopolku puuttuu' },
          { status: 400 },
        );
      }

      slug = slugifyDataSourceName(name || 'ulkoinen');
      linkExternalDatabase(filePath.trim(), slug);
    } else {
      return NextResponse.json({ error: 'Tuntematon tila' }, { status: 400 });
    }

    return makeResponse(slug);
  } catch (error) {
    if (error instanceof ApiRouteError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    const message = error instanceof Error ? error.message : 'Tuntematon virhe';
    console.error('Setup failed:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
