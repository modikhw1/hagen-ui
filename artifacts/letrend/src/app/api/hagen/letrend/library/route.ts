import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';

export const GET = withAuth(
  async (request: NextRequest) => {
    const hagenBase = process.env.HAGEN_BASE_URL;
    if (!hagenBase) {
      return NextResponse.json({ error: 'HAGEN_BASE_URL is not configured' }, { status: 503 });
    }

    const url = new URL(request.url);
    const query = url.searchParams.toString();
    const res = await fetch(`${hagenBase}/api/letrend/library${query ? `?${query}` : ''}`, {
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  },
  ['admin', 'content_manager']
);
