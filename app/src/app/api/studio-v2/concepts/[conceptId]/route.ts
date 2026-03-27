import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

function toLegacyStatus(status: string | undefined) {
  if (status === 'draft') return 'active';
  if (status === 'sent') return 'paused';
  if (status === 'produced') return 'completed';
  return status;
}

export const PATCH = withAuth(async (request, _user, { params }: { params: Promise<{ conceptId: string }> }) => {
  const { conceptId } = await params;
  const body = await request.json();
  const supabase = createSupabaseAdmin();

  const contentOverrides = body?.content_overrides || {};
  const updates = {
    ...body,
    status: toLegacyStatus(body?.status),
    custom_script: body?.custom_script ?? contentOverrides.script,
    custom_why_it_works: body?.why_it_fits ?? contentOverrides.why_it_fits,
    custom_instructions: body?.filming_instructions ?? contentOverrides.filming_instructions,
    custom_target_audience: contentOverrides.target_audience,
    custom_headline: contentOverrides.headline,
    notes: body?.cm_note,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('customer_concepts')
    .update(updates)
    .eq('id', conceptId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ concept: data });
}, ['admin', 'content_manager']);
