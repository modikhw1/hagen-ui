import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { motorSignalNewEvidence } from '@/lib/studio/motor-signal';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface TikTokClipInput {
  tiktok_url: string;
  /** Primary thumbnail field. */
  tiktok_thumbnail_url?: string | null;
  /** Alias accepted for compatibility with hagen export format (analyzed_videos.metadata.thumbnail_url). */
  thumbnail_url?: string | null;
  tiktok_views?: number | null;
  tiktok_likes?: number | null;
  tiktok_comments?: number | null;
  description?: string | null;
  published_at?: string | null;
}

// ─────────────────────────────────────────────
// POST /api/studio-v2/customers/[customerId]/import-history
//
// Imports an array of TikTok clips as imported_history slots in the feed
// planner (negative feed_order values). Clips already present for this
// customer (matched by tiktok_url) are silently skipped — idempotent.
//
// Body: { clips: TikTokClipInput[]; replace?: boolean }
//   replace: if true, deletes all existing imported_history slots for this
//            customer before inserting (full refresh mode). Deduplication is
//            not applied in replace mode since the table is wiped first.
// ─────────────────────────────────────────────

export const POST = withAuth(
  async (
    request: NextRequest,
    _user: unknown,
    { params }: { params: Promise<{ customerId: string }> }
  ) => {
    const { customerId } = await params;
    const body = await request.json().catch(() => ({}));
    const { clips, replace = false } = body as {
      clips: TikTokClipInput[];
      replace?: boolean;
    };

    if (!Array.isArray(clips) || clips.length === 0) {
      return NextResponse.json({ error: 'clips must be a non-empty array' }, { status: 400 });
    }

    // Validate that each clip has a tiktok_url
    const validClips = clips.filter(
      (c): c is TikTokClipInput => typeof c.tiktok_url === 'string' && c.tiktok_url.trim() !== ''
    );
    if (validClips.length === 0) {
      return NextResponse.json({ error: 'No clips with valid tiktok_url provided' }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();

    if (replace) {
      // Full-refresh mode: remove all existing imported_history rows for this customer
      await supabase
        .from('customer_concepts')
        .delete()
        .eq('customer_profile_id', customerId)
        .is('concept_id', null)
        .lt('feed_order', 0);
    } else {
      // Incremental mode: fetch existing tiktok_urls to deduplicate
      const { data: existing } = await supabase
        .from('customer_concepts')
        .select('tiktok_url')
        .eq('customer_profile_id', customerId)
        .not('tiktok_url', 'is', null);

      const existingUrls = new Set((existing ?? []).map((r) => r.tiktok_url as string));
      const before = validClips.length;
      const dedupedClips = validClips.filter((c) => !existingUrls.has(c.tiktok_url.trim()));

      if (dedupedClips.length === 0) {
        return NextResponse.json({ imported: 0, skipped: before, message: 'All clips already present' });
      }

      // Continue with deduplicated set
      return insertClips(supabase, customerId, dedupedClips, false, before - dedupedClips.length);
    }

    return insertClips(supabase, customerId, validClips, replace, 0);
  },
  ['admin', 'content_manager']
);

// ─────────────────────────────────────────────
// Shared insert helper
// ─────────────────────────────────────────────

async function insertClips(
  supabase: ReturnType<typeof import('@/lib/server/supabase-admin').createSupabaseAdmin>,
  customerId: string,
  clips: TikTokClipInput[],
  replace: boolean,
  skipped: number
): Promise<NextResponse> {
  // Find current most-negative feed_order for this customer (anchor for temp positions)
  const { data: existingHistory } = await supabase
    .from('customer_concepts')
    .select('feed_order')
    .eq('customer_profile_id', customerId)
    .lt('feed_order', 0)
    .order('feed_order', { ascending: true })
    .limit(1);

  const currentMostNegative = existingHistory?.[0]?.feed_order ?? 0;
  const tempStartOrder = replace ? -1 : Math.min(currentMostNegative - 1, -1);

  // Sort newest-first before inserting so temp positions are consistent.
  // Exact positions don't matter — the chronological renumber below is the
  // source of truth for final feed_order assignment.
  const sortedClips = [...clips].sort((a, b) => {
    if (!a.published_at && !b.published_at) return 0;
    if (!a.published_at) return 1;
    if (!b.published_at) return -1;
    return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
  });

  const inserts = sortedClips.map((clip, i) => ({
    customer_profile_id: customerId,
    customer_id: customerId,
    concept_id: null,
    status: 'produced',
    feed_order: tempStartOrder - i,
    tiktok_url: clip.tiktok_url.trim(),
    tiktok_thumbnail_url: clip.tiktok_thumbnail_url ?? clip.thumbnail_url ?? null,
    tiktok_views: clip.tiktok_views ?? null,
    tiktok_likes: clip.tiktok_likes ?? null,
    tiktok_comments: clip.tiktok_comments ?? null,
    published_at: clip.published_at ?? null,
    tags: [] as string[],
    content_overrides: clip.description ? { script: clip.description } : {},
  }));

  const { data: insertedRows, error } = await supabase
    .from('customer_concepts')
    .insert(inserts)
    .select('id, feed_order, tiktok_url');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ── Chronological renumber ────────────────────────────────────────────────
  //
  // Re-read ALL imported-history rows and assign feed_order = -(offset+1), …, -(offset+N)
  // where offset = |deepest LeTrend historik row| so TikTok rows never collide with
  // LeTrend historik rows that also live at negative feed_orders.
  //
  // Scope: concept_id IS NULL AND feed_order < 0 (imported profile history only).
  // LeTrend-managed rows (concept_id NOT NULL) are never touched.
  //
  // Sort rule:
  //   Primary:   published_at DESC NULLS LAST (most recent = closest to nu)
  //   Secondary: tiktok_url ASC (deterministic tiebreaker for same-timestamp clips)
  //
  const { data: allImported } = await supabase
    .from('customer_concepts')
    .select('id, feed_order, published_at, tiktok_url')
    .eq('customer_profile_id', customerId)
    .is('concept_id', null)
    .lt('feed_order', 0);

  // Find deepest LeTrend historik row to establish floor for TikTok renumbering
  const { data: letrEndHistorikRows } = await supabase
    .from('customer_concepts')
    .select('feed_order')
    .eq('customer_profile_id', customerId)
    .not('concept_id', 'is', null)
    .lt('feed_order', 0)
    .order('feed_order', { ascending: true })
    .limit(1);

  const letrEndFloor = (letrEndHistorikRows?.[0]?.feed_order as number | undefined) ?? 0;
  const renumberOffset = letrEndFloor < 0 ? Math.abs(letrEndFloor) : 0;

  const chronological = (allImported ?? []).sort((a, b) => {
    const dateA = a.published_at ? new Date(a.published_at as string).getTime() : 0;
    const dateB = b.published_at ? new Date(b.published_at as string).getTime() : 0;
    if (dateB !== dateA) return dateB - dateA;
    return (a.tiktok_url as string).localeCompare(b.tiktok_url as string);
  });

  const renumberUpdates = chronological
    .map((row, i) => ({ id: row.id as string, from: row.feed_order as number, to: -(renumberOffset + i + 1) }))
    .filter(u => u.from !== u.to);

  if (renumberUpdates.length > 0) {
    await Promise.all(
      renumberUpdates.map(u =>
        supabase
          .from('customer_concepts')
          .update({ feed_order: u.to })
          .eq('id', u.id)
      )
    );
  }

  // Build final feed_orders for the response (post-renumber)
  const finalFeedOrders = new Map(chronological.map((row, i) => [row.id as string, -(renumberOffset + i + 1)]));
  const insertedIdSet = new Set((insertedRows ?? []).map(r => r.id as string));
  const finalSlots = chronological
    .filter(row => insertedIdSet.has(row.id as string))
    .map(row => ({ id: row.id, tiktok_url: row.tiktok_url, feed_order: finalFeedOrders.get(row.id as string) }));

  const importedCount = insertedRows?.length ?? 0;

  if (importedCount > 0) {
    // sortedClips is DESC by published_at — index 0 is the most recently published clip in this batch.
    const latestPublishedAt = sortedClips[0]?.published_at ?? null;
    await supabase
      .from('customer_profiles')
      .update(motorSignalNewEvidence(importedCount, latestPublishedAt))
      .eq('id', customerId);
  }

  return NextResponse.json({
    imported: importedCount,
    skipped,
    slots: finalSlots,
  });
}
