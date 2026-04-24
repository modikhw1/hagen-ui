import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { fetchCustomerTikTokStatsServer } from '@/lib/admin/server/customer-overview';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth(
  async (_request: NextRequest, _user, { params }: RouteParams) => {
    const { id } = await params;
    return NextResponse.json(await fetchCustomerTikTokStatsServer(id));
  },
  ['admin'],
);
