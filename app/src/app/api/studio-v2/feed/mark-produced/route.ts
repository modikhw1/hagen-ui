import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export const POST = withAuth(async (request) => {
  const body = await request.json();
  const supabase = createSupabaseAdmin();
  const conceptId = body?.concept_id;

  if (!conceptId) {
    return NextResponse.json({ error: 'concept_id is required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('customer_concepts')
    .update({
      status: 'completed',
      produced_at: new Date().toISOString(),
      tiktok_url: body?.tiktok_url || null,
      feed_order: null,
    })
    .eq('id', conceptId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}, ['admin', 'content_manager']);
