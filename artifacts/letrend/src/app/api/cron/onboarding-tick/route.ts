import { NextRequest } from 'next/server';
import { proxySupabaseFunction } from '@/lib/server/cron';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return proxySupabaseFunction(request, 'onboarding-tick');
}

export async function POST(request: NextRequest) {
  return GET(request);
}
