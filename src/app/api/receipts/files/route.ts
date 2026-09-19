import { NextRequest, NextResponse } from 'next/server';
import { jsonError } from '@/lib/api-helpers';
import { resolveRequestDataSource } from '@/lib/db';
import { getPdfRoot, listPdfFiles } from '@/lib/receipt-pdfs';

export async function GET(request: NextRequest) {
  try {
    const source = resolveRequestDataSource(request);
    if (!source) {
      return jsonError('Active datasource not found.', 400);
    }
    const pdfRoot = getPdfRoot(source);
    const files = listPdfFiles(pdfRoot);

    return NextResponse.json({ files });
  } catch (error) {
    console.error('Error listing receipt PDFs:', error);
    return jsonError('PDF file listing failed');
  }
}
