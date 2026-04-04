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

  // result boundary write: sets produced/published timestamps, TikTok URL,
  // and clears placement (feed_order: null — removes concept from active plan)
  const { data, error } = await supabase
    .from('customer_concepts')
    .update(buildMarkProducedPayload({ tiktok_url: body?.tiktok_url, now }))
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
