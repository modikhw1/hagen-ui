import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export const GET = withAuth(async (request) => {
  const customerId = new URL(request.url).searchParams.get('customer_id');
  if (!customerId) {
    return NextResponse.json({ error: 'customer_id is required' }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('feed_spans')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ spans: data || [] });
}, ['admin', 'content_manager']);

export const POST = withAuth(async (request, user) => {
  const body = await request.json();
  const supabase = createSupabaseAdmin();

  const { data, error } = await supabase
    .from('feed_spans')
    .insert({
      ...body,
      cm_id: body?.cm_id || user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ span: data });
}, ['admin', 'content_manager']);
