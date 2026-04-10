import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { buildMarkProducedPayload } from '@/lib/customer-concept-lifecycle';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { normalizeStudioCustomerConcept } from '@/lib/studio/customer-concepts';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/studio-v2/feed/mark-produced
//
// Marks the current nu concept (feed_order 0) as produced and advances
// the planning window. Uses the same two-phase strategy as advance-plan:
//
//   Phase 1 — shift ALL other LeTrend rows (concept_id IS NOT NULL,
//              id != produced_id, feed_order IS NOT NULL) by -1:
//     +1 (kommande)  →  0  (new nu)
//     +2             → +1
//     -1 (historik)  → -2  (pushed deeper, no pile-up)
//
//   Phase 2 — shift ALL imported-history rows (concept_id IS NULL,
//              feed_order < 0) by -1:
//     -1 (newest TikTok) → -2
//     -2                 → -3
//     (prevents collision: Phase 1 produced row lands at -1;
//      without Phase 2 the TikTok row already at -1 would collide)
//
//   Phase 3 — update the produced row: set metadata + feed_order = -1
//     (most-recent historik position, directly adjacent to the new nu)
//
// This guarantees LeTrend historik always sits closer to nu than imported
// TikTok history — the same invariant maintained by advance-plan.
// ─────────────────────────────────────────────────────────────────────────────

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

  // ── Phase 1: shift all other LeTrend rows by -1 ──────────────────────────
  // Scope: concept_id IS NOT NULL (LeTrend-managed), id != produced row,
  //        feed_order IS NOT NULL (placed in timeline).
  // Includes both kommande/nu (≥0) and existing LeTrend historik (<0) so that
  // historik remains internally ordered across repeated advances.
  const { data: letrEndRows, error: letrEndFetchError } = await supabase
    .from('customer_concepts')
    .select('id, feed_order')
    .eq('customer_profile_id', customerId)
    .not('concept_id', 'is', null)
    .neq('id', conceptId)
    .not('feed_order', 'is', null);

  if (letrEndFetchError) {
    return NextResponse.json({ error: letrEndFetchError.message }, { status: 500 });
  }

  const letrEndToShift = (letrEndRows ?? []).filter(
    (r): r is { id: string; feed_order: number } =>
      typeof r.id === 'string' && typeof r.feed_order === 'number'
  );

  if (letrEndToShift.length > 0) {
    const shiftResults = await Promise.all(
      letrEndToShift.map((r) =>
        supabase
          .from('customer_concepts')
          .update({ feed_order: r.feed_order - 1 })
          .eq('id', r.id)
      )
    );
    const shiftErrors = shiftResults.map((r) => r.error).filter(Boolean);
    if (shiftErrors.length > 0) {
      return NextResponse.json(
        { error: shiftErrors[0]?.message ?? 'LeTrend shift failed' },
        { status: 500 }
      );
    }
  }

  // ── Phase 2: shift imported-history rows by -1 ────────────────────────────
  // Prevents collision with the produced row that is about to land at -1.
  const { data: importedRows, error: importedFetchError } = await supabase
    .from('customer_concepts')
    .select('id, feed_order')
    .eq('customer_profile_id', customerId)
    .is('concept_id', null)
    .lt('feed_order', 0);

  if (importedFetchError) {
    return NextResponse.json({ error: importedFetchError.message }, { status: 500 });
  }

  const importedToShift = (importedRows ?? []).filter(
    (r): r is { id: string; feed_order: number } =>
      typeof r.id === 'string' && typeof r.feed_order === 'number'
  );

  if (importedToShift.length > 0) {
    const importedShiftResults = await Promise.all(
      importedToShift.map((r) =>
        supabase
          .from('customer_concepts')
          .update({ feed_order: r.feed_order - 1 })
          .eq('id', r.id)
      )
    );
    const importedShiftErrors = importedShiftResults.map((r) => r.error).filter(Boolean);
    if (importedShiftErrors.length > 0) {
      return NextResponse.json(
        { error: importedShiftErrors[0]?.message ?? 'TikTok history shift failed' },
        { status: 500 }
      );
    }
  }

  // ── Phase 3: stamp the produced row at feed_order -1 ─────────────────────
  // feed_order -1 = most-recent historik slot, adjacent to the new nu (0).
  const { data, error } = await supabase
    .from('customer_concepts')
    .update({
      ...buildMarkProducedPayload({ tiktok_url: body?.tiktok_url, published_at: clipPublishedAt, now }),
      feed_order: -1,
    })
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
    letrend_shifted: letrEndToShift.length,
    imported_shifted: importedToShift.length,
  });
}, ['admin', 'content_manager']);
