import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { EMAIL_TEMPLATE_DEFINITIONS } from '@/lib/email/service';

async function proxyToStudioV2(request: NextRequest, path: string): Promise<NextResponse> {
  const url = new URL(path, request.url);
  const proxiedResponse = await fetch(url, {
    method: request.method,
    headers: {
      'content-type': request.headers.get('content-type') || 'application/json',
      'x-user-id': request.headers.get('x-user-id') || '',
      'x-user-email': request.headers.get('x-user-email') || '',
      'x-user-role': request.headers.get('x-user-role') || '',
      cookie: request.headers.get('cookie') || '',
    },
    body: request.method === 'GET' ? undefined : await request.text(),
  });

  const body = await proxiedResponse.text();
  return new NextResponse(body, {
    status: proxiedResponse.status,
    headers: { 'content-type': proxiedResponse.headers.get('content-type') || 'application/json' },
  });
}

export const POST = withAuth(
  async (request: NextRequest) => proxyToStudioV2(request, '/api/studio-v2/email/send'),
  ['admin', 'content_manager']
);

export async function GET() {
  return NextResponse.json({
    templates: EMAIL_TEMPLATE_DEFINITIONS,
  });
}
