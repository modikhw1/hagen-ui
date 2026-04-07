import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { buildMarkProducedPayload } from '@/lib/customer-concept-lifecycle';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { normalizeStudioCustomerConcept } from '@/lib/studio/customer-concepts';

export const POST = withAuth(async (request) => {
  const body = await request.json().catch(() => ({}));
  const supabase = createSupabaseAdmin();
  const conceptId = typeof body?.concept_id === 'string' ? body.concept_id.trim() : '';
  const customerId = typeof body?.customer_id === 'string' ? body.customer_id.trim() : '';
  const now = new Date().toISOString();

  if (!conceptId) {
    return NextResponse.json({ error: 'concept_id is required' }, { status: 400 });
  }

  if (!customerId) {
    return NextResponse.json({ error: 'customer_id is required' }, { status: 400 });
  }

  // Determine next available historical slot for this customer.
  // Most-recent history is -1; each older entry is one step further negative.
  const { data: historySlots } = await supabase
    .from('customer_concepts')
    .select('feed_order')
    .eq('customer_profile_id', customerId)
    .lt('feed_order', 0)
    .order('feed_order', { ascending: true })
    .limit(1);
  const currentMostNegative = historySlots?.[0]?.feed_order ?? 0;
  const nextHistoryOrder = Math.min(currentMostNegative - 1, -1);

  // result boundary write: sets produced/published timestamps, TikTok URL,
  // and moves placement to next historical slot (keeping concept in timeline)
  const { data, error } = await supabase
    .from('customer_concepts')
    .update(buildMarkProducedPayload({ tiktok_url: body?.tiktok_url, now, nextHistoryOrder }))
    .eq('id', conceptId)
    .eq('customer_profile_id', customerId)
    .select(`
      id,
      customer_profile_id,
      customer_id,
      concept_id,
      status,
      content_overrides,
      cm_id,
      cm_note,
      match_percentage,
      feed_order,
      tags,
      collection_id,
      added_at,
      sent_at,
      produced_at,
      planned_publish_at,
      content_loaded_at,
      content_loaded_seen_at,
      published_at,
      tiktok_url,
      tiktok_thumbnail_url,
      tiktok_views,
      tiktok_likes,
      tiktok_comments,
      tiktok_watch_time_seconds,
      tiktok_last_synced_at
    `)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Concept assignment not found' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    concept: normalizeStudioCustomerConcept(data),
  });
}, ['admin', 'content_manager']);
