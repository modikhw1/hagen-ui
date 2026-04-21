import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { EMAIL_TEMPLATE_DEFINITIONS } from '@/lib/email/service';

async function proxyToStudioV2(request: NextRequest, path: string): Promise<NextResponse> {
  const url = new URL(path, request.url);
  const proxiedResponse = await fetch(url, {
    method: request.method,
    headers: {
      'content-type': request.headers.get('content-type') || 'application/json',
      cookie: request.headers.get('cookie') || '',
    },
    body: request.method === 'GET' ? undefined : await request.text(),
  });

  const body = await proxiedResponse.text();
  return new NextResponse(body, {
    status: proxiedResponse.status,
    headers: {
      'content-type': proxiedResponse.headers.get('content-type') || 'application/json',
      'x-letrend-deprecated': 'Use /api/studio-v2/email/send',
    },
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
