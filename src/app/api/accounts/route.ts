import { NextRequest, NextResponse } from 'next/server';
import { createAccountAction } from '@/actions/app-actions';
import { jsonActionError, jsonError } from '@/lib/api-helpers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const account = await createAccountAction(body);
    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      return jsonError(error.message, 409);
    }
    return jsonActionError(error, 'Failed to create account');
  }
}
