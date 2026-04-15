import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';

export const POST = withAuth(async (request: NextRequest) => {
  const url = new URL('/api/studio-v2/email/preview', request.url);
  const proxiedResponse = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': request.headers.get('content-type') || 'application/json',
      'x-user-id': request.headers.get('x-user-id') || '',
      'x-user-email': request.headers.get('x-user-email') || '',
      'x-user-role': request.headers.get('x-user-role') || '',
      cookie: request.headers.get('cookie') || '',
    },
    body: await request.text(),
  });

  const body = await proxiedResponse.text();
  return new NextResponse(body, {
    status: proxiedResponse.status,
    headers: { 'content-type': proxiedResponse.headers.get('content-type') || 'application/json' },
  });
}, ['admin', 'content_manager']);
