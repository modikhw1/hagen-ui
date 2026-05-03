import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';

export const GET = withAuth(
  async (
    _request: NextRequest,
    _user: unknown,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    const { id } = await params;
    const hagenBase = process.env.HAGEN_BASE_URL;
    if (!hagenBase) {
      return NextResponse.json({ error: 'HAGEN_BASE_URL is not configured' }, { status: 503 });
    }

    const res = await fetch(`${hagenBase}/api/letrend/video/${id}`, {
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  },
  ['admin', 'content_manager']
);

export const PATCH = withAuth(
  async (
    request: NextRequest,
    _user: unknown,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    const { id } = await params;
    const hagenBase = process.env.HAGEN_BASE_URL;
    if (!hagenBase) {
      return NextResponse.json({ error: 'HAGEN_BASE_URL is not configured' }, { status: 503 });
    }

    const body = await request.json();
    const res = await fetch(`${hagenBase}/api/letrend/video/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  },
  ['admin', 'content_manager']
);
