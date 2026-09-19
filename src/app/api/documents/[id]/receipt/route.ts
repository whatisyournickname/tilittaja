import { NextRequest, NextResponse } from 'next/server';
import {
  jsonActionError,
  isMultipartRequest,
  isPdfFile,
  jsonError,
  readOptionalRequestJson,
  readRequestFormData,
  requireRouteId,
  withDb,
} from '@/lib/api-helpers';
import type { RouteIdParams } from '@/lib/types';
import {
  deleteDocumentReceiptAction,
  updateDocumentReceiptAction,
  uploadDocumentReceiptAction,
} from '@/actions/app-actions';

export const runtime = 'nodejs';

export const PATCH = withDb(
  async (request: NextRequest, { params }: RouteIdParams) => {
    try {
      const documentId = await requireRouteId(params, 'tositteen tunniste');
      const body = (await readOptionalRequestJson(request)) as {
        receiptPath?: string | null;
      } | null;
      const result = await updateDocumentReceiptAction(documentId, {
        receiptPath: body?.receiptPath,
      });
      return NextResponse.json(result);
    } catch (error) {
      return jsonActionError(error, 'Failed to save PDF link');
    }
  },
  'Failed to save PDF link',
);

export const POST = withDb(
  async (request: NextRequest, { params }: RouteIdParams) => {
    try {
      const documentId = await requireRouteId(params, 'tositteen tunniste');
      if (!isMultipartRequest(request)) {
        return jsonError('Send PDF as multipart form', 400);
      }

      const formData = await readRequestFormData(request);

      const file = formData.get('file');
      if (!(file instanceof File)) {
        return jsonError('Send one PDF file in the .file. field', 400);
      }
      if (!isPdfFile(file)) {
        return jsonError('Vain PDF-tiedostot ovat sallittuja', 400);
      }

      const result = await uploadDocumentReceiptAction(documentId, file);
      return NextResponse.json(result);
    } catch (error) {
      return jsonActionError(error, 'PDF upload failed');
    }
  },
  'PDF upload failed',
);

export const DELETE = withDb(
  async (request: NextRequest, { params }: RouteIdParams) => {
    void request;
    try {
      const documentId = await requireRouteId(params, 'tositteen tunniste');
      const result = await deleteDocumentReceiptAction(documentId);
      return NextResponse.json(result);
    } catch (error) {
      return jsonActionError(error, 'Failed to remove PDF attachment');
    }
  },
  'Failed to remove PDF attachment',
);
