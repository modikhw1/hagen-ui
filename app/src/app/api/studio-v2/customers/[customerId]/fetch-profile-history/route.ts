import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { motorSignalNewEvidence } from '@/lib/studio/motor-signal';
import { autoReconcileAndAdvance } from '@/lib/studio/auto-reconcile';
import {
  fetchProviderVideos,
  normalizeVideo,
  type NormalizedHistoryClip,
  type Scraper7Video,
} from '@/lib/studio/tiktok-provider';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/studio-v2/customers/[customerId]/fetch-profile-history
//
// Real customer publication-history ingestion.
// Sources the customer's actual TikTok profile feed via RapidAPI / tiktok-scraper7.
// Provider layer lives in @/lib/studio/tiktok-provider — swap there, not here.
//
// Flow:
//   1. Read customer_profiles.tiktok_profile_url (and derived tiktok_handle)
//   2. Call tiktok-scraper7 GET /user/posts?unique_id=<handle>&count=<n>[&cursor=<c>]
//   3. Normalize response into compact internal shape
//   4. Deduplicate against existing customer_concepts.tiktok_url
//   5. Insert new rows as row_kind='imported_history' at negative feed_order
//   6. Stamp customer_profiles.last_history_sync_at
//   7. Return { fetched, imported, skipped, has_more, cursor }
//
// Request body (optional JSON):
//   count  — number of clips to fetch (default: 10, max: 50)
//   cursor — pagination cursor from a previous response (for "load more")
//
// Required env:
//   RAPIDAPI_KEY — from https://rapidapi.com/tikwm-tikwm-default/api/tiktok-scraper7 (free tier)
//
// Semantics:
//   - This route is for customer PUBLICATION HISTORY only
//   - Never depends on hagen library source_username or analyzed_videos
//   - Imported rows always land at feed_order < 0 (negative = past history)
//   - LeTrend-managed rows with the same tiktok_url are preserved (dedup wins)
// ─────────────────────────────────────────────────────────────────────────────

// ── Route handler ─────────────────────────────────────────────────────────────

const DEFAULT_FETCH_COUNT = 10;
const MAX_FETCH_COUNT = 50;

export const POST = withAuth(
  async (
    request: NextRequest,
    _user: unknown,
    { params }: { params: Promise<{ customerId: string }> }
  ) => {
    const { customerId } = await params;
    const supabase = createSupabaseAdmin();

    // ── 0. Parse request options ───────────────────────────────────────────
    let fetchCount = DEFAULT_FETCH_COUNT;
    let fetchCursor: number | undefined;
    try {
      const body = await request.json() as { count?: unknown; cursor?: unknown };
      if (typeof body?.count === 'number' && body.count > 0) {
        fetchCount = Math.min(Math.floor(body.count), MAX_FETCH_COUNT);
      }
      if (typeof body?.cursor === 'number') {
        fetchCursor = body.cursor;
      }
    } catch {
      // No body or invalid JSON — use defaults
    }

    // ── 1. Read profile identity ───────────────────────────────────────────
    const { data: profile, error: profileError } = await supabase
      .from('customer_profiles')
      .select('tiktok_profile_url, tiktok_handle')
      .eq('id', customerId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Customer profile not found' }, { status: 404 });
    }

    const { tiktok_profile_url, tiktok_handle } = profile as {
      tiktok_profile_url?: string | null;
      tiktok_handle?: string | null;
    };

    if (!tiktok_handle?.trim()) {
      return NextResponse.json(
        {
          error: tiktok_profile_url
            ? 'tiktok_handle could not be derived from the saved profile URL'
            : 'tiktok_profile_url is not set on this customer profile',
        },
        { status: 400 }
      );
    }

    const handle = tiktok_handle.trim().replace(/^@/, '');

    // ── 2. Check provider config ───────────────────────────────────────────
    const rapidApiKey = process.env.RAPIDAPI_KEY;
    if (!rapidApiKey) {
      return NextResponse.json(
        { error: 'RAPIDAPI_KEY is not configured' },
        { status: 503 }
      );
    }

    // ── 3. Fetch from provider ─────────────────────────────────────────────
    let rawVideos: Scraper7Video[];
    let providerHasMore: boolean;
    let providerCursor: number | null;
    try {
      const result = await fetchProviderVideos(handle, rapidApiKey, fetchCount, fetchCursor);
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 502 });
      }
      rawVideos = result.videos;
      providerHasMore = result.has_more;
      providerCursor = result.cursor;
    } catch (err) {
      return NextResponse.json(
        { error: `Could not reach provider: ${(err as Error).message}` },
        { status: 502 }
      );
    }

    // ── 4. Normalize ───────────────────────────────────────────────────────
    const clips: NormalizedHistoryClip[] = rawVideos
      .map((v) => normalizeVideo(v, handle))
      .filter((c): c is NormalizedHistoryClip => c !== null);

    const fetched = clips.length;

    if (fetched === 0) {
      await supabase
        .from('customer_profiles')
        .update({ last_history_sync_at: new Date().toISOString() })
        .eq('id', customerId);

      return NextResponse.json({ fetched: 0, imported: 0, skipped: 0, has_more: providerHasMore, cursor: providerCursor, message: 'No videos returned by provider' });
    }

    // ── 5. Deduplicate against existing customer history ───────────────────
    const { data: existing } = await supabase
      .from('customer_concepts')
      .select('id, tiktok_url')
      .eq('customer_profile_id', customerId)
      .not('tiktok_url', 'is', null);

    const existingByUrl = new Map(
      (existing ?? []).map((r) => [r.tiktok_url as string, r.id as string])
    );
    const newClips = clips.filter((c) => !existingByUrl.has(c.tiktok_url));
    const duplicateClips = clips.filter((c) => existingByUrl.has(c.tiktok_url));
    const skipped = fetched - newClips.length;

    // ── 5a. Refresh stats on already-imported rows ─────────────────────────
    // Views, likes, and comments grow over time. Re-stamp them on each manual
    // fetch so the CM sees current engagement without needing a new clip.
    if (duplicateClips.length > 0) {
      const now = new Date().toISOString();
      await Promise.all(
        duplicateClips.map((clip) => {
          const rowId = existingByUrl.get(clip.tiktok_url)!;
          return supabase
            .from('customer_concepts')
            .update({
              tiktok_views: clip.tiktok_views,
              tiktok_likes: clip.tiktok_likes,
              tiktok_comments: clip.tiktok_comments,
              tiktok_last_synced_at: now,
            })
            .eq('id', rowId);
        })
      );
    }

    if (newClips.length === 0) {
      await supabase
        .from('customer_profiles')
        .update({ last_history_sync_at: new Date().toISOString() })
        .eq('id', customerId);

      return NextResponse.json({ fetched, imported: 0, skipped, has_more: providerHasMore, cursor: providerCursor, message: 'All fetched videos already present' });
    }

    // ── 6. Read anchor for temp insertion positions ────────────────────────
    // Query ALL historik rows (not just imported concept_id IS NULL) so that
    // provisional temp positions don't collide with existing LeTrend historik rows.
    const { data: allHistorikAnchorRows } = await supabase
      .from('customer_concepts')
      .select('feed_order')
      .eq('customer_profile_id', customerId)
      .lt('feed_order', 0)
      .order('feed_order', { ascending: true })
      .limit(1);

    // Most-negative (oldest) feed_order across ALL historik — used as the
    // temporary insertion anchor so new rows land safely below everything.
    const mostNegativeFeedOrder = (allHistorikAnchorRows?.[0]?.feed_order as number | undefined) ?? 0;

    // ── 7. Sort new clips newest-first ─────────────────────────────────────
    const sortedNewClips = [...newClips].sort((a, b) => {
      if (!a.published_at && !b.published_at) return 0;
      if (!a.published_at) return 1;
      if (!b.published_at) return -1;
      return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
    });

    // ── 8. Insert new clips at temporary positions below existing oldest ────
    //
    // Exact positions don't matter — a full chronological renumber follows.
    // Using mostNegativeFeedOrder as the anchor keeps all inserts in negative
    // territory (historik zone) without colliding with existing rows.
    //
    const makeRow = (clip: NormalizedHistoryClip, feedOrder: number) => ({
      customer_profile_id: customerId,
      customer_id: customerId,
      concept_id: null,
      status: 'produced',
      feed_order: feedOrder,
      tiktok_url: clip.tiktok_url,
      tiktok_thumbnail_url: clip.tiktok_thumbnail_url,
      tiktok_views: clip.tiktok_views,
      tiktok_likes: clip.tiktok_likes,
      tiktok_comments: clip.tiktok_comments,
      published_at: clip.published_at,
      tags: [] as string[],
      content_overrides: clip.description ? { script: clip.description } : {},
    });

    const tempStartOrder = mostNegativeFeedOrder - 1;
    const inserts = sortedNewClips.map((clip, i) => makeRow(clip, tempStartOrder - i));

    const { data: insertedRows, error: insertError } = await supabase
      .from('customer_concepts')
      .insert(inserts)
      .select('id, feed_order, tiktok_url');

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // ── 9. Renumber all imported-history rows in chronological order ──────────
    //
    // After any insert — whether newer clips, backfill, or gap-fill — re-read
    // ALL imported-history rows and assign feed_order = -(offset+1), …, -(offset+N)
    // where offset = |deepest LeTrend historik row| so TikTok rows never collide
    // with LeTrend historik rows that also occupy negative feed_orders.
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

    // ── 10. Stamp last_history_sync_at and persist motor signal ───────────
    const importedCount = insertedRows?.length ?? 0;
    // sortedNewClips is DESC by published_at — index 0 is the most recently published clip in this batch.
    const latestPublishedAt = sortedNewClips[0]?.published_at ?? null;

    // Accumulate rather than overwrite the motor signal count so that a manual fetch
    // and a cron run finding clips on the same customer both contribute to "N nya klipp".
    // Without this read+add, a manual fetch finding M clips would silently reset a
    // cron-written count of N to M, losing evidence of the earlier batch.
    let motorFields = {};
    if (importedCount > 0) {
      const { data: currentProfile } = await supabase
        .from('customer_profiles')
        .select('pending_history_advance, pending_history_advance_published_at')
        .eq('id', customerId)
        .maybeSingle();

      const existingCount = (currentProfile?.pending_history_advance as number | null) ?? 0;
      const existingPublishedAt = (currentProfile?.pending_history_advance_published_at as string | null) ?? null;
      const accumulatedPublishedAt =
        latestPublishedAt && existingPublishedAt
          ? (latestPublishedAt > existingPublishedAt ? latestPublishedAt : existingPublishedAt)
          : (latestPublishedAt ?? existingPublishedAt);

      motorFields = motorSignalNewEvidence(existingCount + importedCount, accumulatedPublishedAt);
    }

    await supabase
      .from('customer_profiles')
      .update({ last_history_sync_at: new Date().toISOString(), ...motorFields })
      .eq('id', customerId);

    // Auto-match: link newest imported clip to nu-slot concept and advance plan.
    // Same logic as the cron path — ensures first-visit fetch behaves identically.
    if (importedCount > 0) {
      await autoReconcileAndAdvance(supabase, customerId);
    }

    return NextResponse.json({
      fetched,
      imported: importedCount,
      skipped,
      has_more: providerHasMore,
      cursor: providerCursor,
      slots: finalSlots,
    });
  },
  ['admin', 'content_manager']
);
