import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';

export const POST = withAuth(
  async (
    _request: NextRequest,
    _user: unknown,
    { params }: { params: Promise<{ customerId: string }> }
  ) => {
    await params;
    return NextResponse.json(
      {
        error: 'advance-plan is deprecated. Use /api/studio-v2/feed/mark-produced instead.',
      },
      { status: 410 }
    );
  },
  ['admin', 'content_manager']
);
