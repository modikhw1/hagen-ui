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
  const clipPublishedAt = typeof body?.published_at === 'string' ? body.published_at : null;
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
    .update(buildMarkProducedPayload({ tiktok_url: body?.tiktok_url, published_at: clipPublishedAt, now, nextHistoryOrder }))
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

  // ── Advance planning window ───────────────────────────────────────────────
  // Advance the active LeTrend plan window: decrement feed_order by 1 for
  // kommande/nu assignment rows so the next kommande concept becomes nu.
  //
  // Scope: concept_id IS NOT NULL   — LeTrend-managed rows only
  //        feed_order >= 0          — active plan (kommande + nu) only
  //        id != conceptId          — exclude the row we just produced
  //
  // Why feed_order >= 0 (not all placed rows):
  //   nextHistoryOrder is computed as most-negative - 1, so the produced row A
  //   lands directly below the deepest existing historik row (e.g. C at -1
  //   means A lands at -2). If we also shifted C by -1, C would move to -2 and
  //   collide with A. Restricting the advance to feed_order >= 0 avoids this:
  //   A lands at (most-negative - 1) and C stays where it is — no collision.
  //   LeTrend historik rows are already in the past and do not need to shift
  //   when the active plan advances one cycle.
  //
  // Why concept_id IS NOT NULL:
  //   Imported profile-history rows (concept_id IS NULL) are ordered by their
  //   own chronological renumber pass and must never be touched here.
  //
  // Note: neq(id) is defense-in-depth. After step 2, the produced row already
  //   has a negative feed_order so gte(0) would exclude it anyway.
  const { data: planRows, error: planFetchError } = await supabase
    .from('customer_concepts')
    .select('id, feed_order')
    .eq('customer_profile_id', customerId)
    .not('concept_id', 'is', null)
    .neq('id', conceptId)
    .gte('feed_order', 0);

  let advanceApplied = false;
  let advanceError: string | null = null;

  if (planFetchError) {
    advanceError = planFetchError.message;
  } else {
    const toShift = (planRows ?? []).filter(
      (r): r is { id: string; feed_order: number } =>
        typeof r.id === 'string' && typeof r.feed_order === 'number'
    );

    if (toShift.length > 0) {
      const shiftResults = await Promise.all(
        toShift.map((r) =>
          supabase
            .from('customer_concepts')
            .update({ feed_order: r.feed_order - 1 })
            .eq('id', r.id)
        )
      );
      const shiftErrors = shiftResults.map((r) => r.error).filter(Boolean);
      if (shiftErrors.length > 0) {
        advanceError = shiftErrors[0]?.message ?? 'Plan advance partially failed';
      } else {
        advanceApplied = true;
      }
    } else {
      // No other placed LeTrend rows — nothing to advance, still a success
      advanceApplied = true;
    }
  }

  return NextResponse.json({
    success: true,
    concept: normalizeStudioCustomerConcept(data),
    advance_applied: advanceApplied,
    ...(advanceError ? { advance_error: advanceError } : {}),
  });
}, ['admin', 'content_manager']);
