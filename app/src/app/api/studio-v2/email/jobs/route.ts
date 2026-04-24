import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export const GET = withAuth(async (request) => {
  const url = new URL(request.url);
  const customerId = url.searchParams.get('customer_id');
  const limit = Number(url.searchParams.get('limit') || '10');
  const supabase = createSupabaseAdmin();

  let query = supabase
    .from('email_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (customerId) {
    query = query.eq('customer_id', customerId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ jobs: data || [] });
}, ['admin', 'content_manager']);
