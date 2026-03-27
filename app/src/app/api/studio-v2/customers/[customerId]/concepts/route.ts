import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

function normalizeConcept(row: Record<string, unknown>) {
  const rawStatus = String(row.status || 'draft');
  const status =
    rawStatus === 'active' ? 'draft' :
    rawStatus === 'paused' ? 'sent' :
    rawStatus === 'completed' ? 'produced' :
    rawStatus;

  return {
    id: row.id,
    customer_id: row.customer_id || row.customer_profile_id,
    concept_id: row.concept_id,
    cm_id: row.cm_id ?? null,
    status,
    custom_script: row.custom_script ?? null,
    why_it_fits: row.why_it_fits ?? row.custom_why_it_works ?? null,
    filming_instructions: row.filming_instructions ?? row.custom_instructions ?? null,
    tiktok_url: row.tiktok_url ?? null,
    tiktok_thumbnail_url: row.tiktok_thumbnail_url ?? null,
    tiktok_views: row.tiktok_views ?? null,
    tiktok_likes: row.tiktok_likes ?? null,
    tiktok_comments: row.tiktok_comments ?? null,
    tiktok_watch_time_seconds: row.tiktok_watch_time_seconds ?? null,
    tiktok_last_synced_at: row.tiktok_last_synced_at ?? null,
    content_overrides: row.content_overrides ?? {
      headline: row.custom_headline ?? null,
      script: row.custom_script ?? null,
      why_it_fits: row.custom_why_it_works ?? null,
      filming_instructions: row.custom_instructions ?? null,
      target_audience: row.custom_target_audience ?? null,
    },
    feed_order: row.feed_order ?? null,
    feed_slot: row.feed_slot ?? null,
    tags: row.tags ?? [],
    collection_id: row.collection_id ?? null,
    cm_note: row.cm_note ?? row.notes ?? null,
    added_at: row.added_at,
    sent_at: row.sent_at ?? null,
    produced_at: row.produced_at ?? null,
    planned_publish_at: row.planned_publish_at ?? null,
    content_loaded_at: row.content_loaded_at ?? null,
    content_loaded_seen_at: row.content_loaded_seen_at ?? null,
    published_at: row.published_at ?? null,
  };
}

export const GET = withAuth(async (_request, _user, { params }: { params: Promise<{ customerId: string }> }) => {
  const { customerId } = await params;
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('customer_concepts')
    .select('*')
    .eq('customer_profile_id', customerId)
    .order('added_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ concepts: (data || []).map((row) => normalizeConcept(row)) });
}, ['admin', 'content_manager']);

export const POST = withAuth(async (request, user, { params }: { params: Promise<{ customerId: string }> }) => {
  const { customerId } = await params;
  const body = await request.json();
  const supabase = createSupabaseAdmin();

  const insertPayload = {
    customer_profile_id: customerId,
    customer_id: customerId,
    concept_id: body?.concept_id,
    cm_id: user.id,
    status: 'draft',
    feed_order: null,
    tags: [],
    content_overrides: {},
  };

  const { data, error } = await supabase
    .from('customer_concepts')
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ concept: normalizeConcept(data) });
}, ['admin', 'content_manager']);

export const DELETE = withAuth(async (request, _user, { params }: { params: Promise<{ customerId: string }> }) => {
  const { customerId } = await params;
  const conceptId = new URL(request.url).searchParams.get('concept_id');
  if (!conceptId) {
    return NextResponse.json({ error: 'concept_id is required' }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from('customer_concepts')
    .delete()
    .eq('id', conceptId)
    .eq('customer_profile_id', customerId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}, ['admin', 'content_manager']);
