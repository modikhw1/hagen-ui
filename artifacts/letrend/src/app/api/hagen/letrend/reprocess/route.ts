import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';

export const POST = withAuth(
  async (request: NextRequest) => {
    const hagenBase = process.env.HAGEN_BASE_URL;
    if (!hagenBase) {
      return NextResponse.json({ error: 'HAGEN_BASE_URL is not configured' }, { status: 503 });
    }

    const body = await request.json();
    const res = await fetch(`${hagenBase}/api/letrend/reprocess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  },
  ['admin', 'content_manager']
);
