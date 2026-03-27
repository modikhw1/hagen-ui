import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export const PATCH = withAuth(async (request, _user, { params }: { params: Promise<{ spanId: string }> }) => {
  const { spanId } = await params;
  const body = await request.json();
  const supabase = createSupabaseAdmin();

  const { data, error } = await supabase
    .from('feed_spans')
    .update({
      ...body,
      updated_at: new Date().toISOString(),
    })
    .eq('id', spanId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ span: data });
}, ['admin', 'content_manager']);

export const DELETE = withAuth(async (_request, _user, { params }: { params: Promise<{ spanId: string }> }) => {
  const { spanId } = await params;
  const supabase = createSupabaseAdmin();

  const { error } = await supabase
    .from('feed_spans')
    .delete()
    .eq('id', spanId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}, ['admin', 'content_manager']);
