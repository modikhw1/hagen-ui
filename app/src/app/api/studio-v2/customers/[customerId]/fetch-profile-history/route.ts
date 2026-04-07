import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/studio-v2/customers/[customerId]/fetch-profile-history
//
// Real customer publication-history ingestion.
// Sources the customer's actual TikTok profile feed via RapidAPI / tiktok-scraper7.
// Provider layer is intentionally swappable — only the provider section below
// is provider-specific. Everything else is product logic.
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
// Budget note:
//   Default count=10 keeps API usage low. Auto-fetch fires only when
//   last_history_sync_at is null (first-time only). Load-more is explicit.
//
// Semantics:
//   - This route is for customer PUBLICATION HISTORY only
//   - Never depends on hagen library source_username or analyzed_videos
//   - Imported rows always land at feed_order < 0 (negative = past history)
//   - LeTrend-managed rows with the same tiktok_url are preserved (dedup wins)
// ─────────────────────────────────────────────────────────────────────────────

// ── Normalized internal shape ─────────────────────────────────────────────────

interface NormalizedHistoryClip {
  tiktok_url: string;
  tiktok_thumbnail_url: string | null;
  tiktok_views: number | null;
  tiktok_likes: number | null;
  tiktok_comments: number | null;
  published_at: string | null;
  description: string | null;
}

// ── PROVIDER: RapidAPI / tiktok-scraper7 (tikwm-tikwm-default) ───────────────
// To swap providers: replace fetchProviderVideos(), normalizeVideo(), and the
// types below only. Everything else is product logic and must not change.
//
// Subscribe: https://rapidapi.com/tikwm-tikwm-default/api/tiktok-scraper7 (free tier)
// Env var: RAPIDAPI_KEY
//
// Response shape verified from live call 2026-04-07:
//   { code: 0, data: { videos: [...], cursor: number, has_more: boolean } }
//   v.video_id       — numeric string, used for TikTok URL construction
//   v.title          — caption (may be empty string)
//   v.cover          — thumbnail URL (top-level)
//   v.origin_cover   — higher-res thumbnail (top-level, preferred)
//   v.create_time    — unix seconds (snake_case)
//   v.play_count     — views (flat, snake_case)
//   v.digg_count     — likes (flat, snake_case)
//   v.comment_count  — comments (flat, snake_case)

interface Scraper7Video {
  video_id?: string;
  title?: string;
  cover?: string;
  origin_cover?: string;
  create_time?: number;
  play_count?: number;
  digg_count?: number;
  comment_count?: number;
}

interface Scraper7Response {
  code?: number;
  data?: {
    videos?: Scraper7Video[];
    cursor?: number;
    has_more?: boolean;
  };
}

function normalizeVideo(v: Scraper7Video, handle: string): NormalizedHistoryClip | null {
  if (!v.video_id) return null;

  const thumbnail =
    (typeof v.origin_cover === 'string' && v.origin_cover ? v.origin_cover : null) ??
    (typeof v.cover === 'string' && v.cover ? v.cover : null);

  const publishedAt =
    typeof v.create_time === 'number' && v.create_time > 0
      ? new Date(v.create_time * 1000).toISOString()
      : null;

  return {
    tiktok_url: `https://www.tiktok.com/@${handle}/video/${v.video_id}`,
    tiktok_thumbnail_url: thumbnail,
    tiktok_views: v.play_count ?? null,
    tiktok_likes: v.digg_count ?? null,
    tiktok_comments: v.comment_count ?? null,
    published_at: publishedAt,
    description: typeof v.title === 'string' && v.title.trim() ? v.title.trim() : null,
  };
}

async function fetchProviderVideos(
  handle: string,
  apiKey: string,
  count: number,
  cursor?: number
): Promise<{ videos: Scraper7Video[]; has_more: boolean; cursor: number | null; error?: string }> {
  const RAPIDAPI_HOST = 'tiktok-scraper7.p.rapidapi.com';
  const url = new URL(`https://${RAPIDAPI_HOST}/user/posts`);
  url.searchParams.set('unique_id', handle);
  url.searchParams.set('count', String(count));
  if (cursor !== undefined) url.searchParams.set('cursor', String(cursor));

  const res = await fetch(url.toString(), {
    headers: {
      'x-rapidapi-key': apiKey,
      'x-rapidapi-host': RAPIDAPI_HOST,
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { videos: [], has_more: false, cursor: null, error: `tiktok-scraper7 returned ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}` };
  }

  const data = (await res.json()) as Scraper7Response;

  if (data.code !== 0) {
    return { videos: [], has_more: false, cursor: null, error: `tiktok-scraper7 response code ${data.code}` };
  }

  return {
    videos: data.data?.videos ?? [],
    has_more: data.data?.has_more ?? false,
    cursor: data.data?.cursor ?? null,
  };
}

// ── END PROVIDER ──────────────────────────────────────────────────────────────

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
      .select('tiktok_url')
      .eq('customer_profile_id', customerId)
      .not('tiktok_url', 'is', null);

    const existingUrls = new Set((existing ?? []).map((r) => r.tiktok_url as string));
    const newClips = clips.filter((c) => !existingUrls.has(c.tiktok_url));
    const skipped = fetched - newClips.length;

    if (newClips.length === 0) {
      await supabase
        .from('customer_profiles')
        .update({ last_history_sync_at: new Date().toISOString() })
        .eq('id', customerId);

      return NextResponse.json({ fetched, imported: 0, skipped, has_more: providerHasMore, cursor: providerCursor, message: 'All fetched videos already present' });
    }

    // ── 6. Read existing imported-history timeline context ─────────────────
    // Needed to place new clips correctly relative to what is already known.
    // concept_id IS NULL = imported rows (LeTrend-managed rows carry a concept_id).
    const { data: existingImportedRows } = await supabase
      .from('customer_concepts')
      .select('id, feed_order, published_at')
      .eq('customer_profile_id', customerId)
      .is('concept_id', null)
      .lt('feed_order', 0)
      .order('feed_order', { ascending: false }); // least-negative (most recent) first

    const importedRows = existingImportedRows ?? [];

    // Most-negative (oldest) feed_order among existing imported rows — used as
    // the temporary insertion anchor so new rows land safely in negative territory.
    const mostNegativeFeedOrder = importedRows.length > 0
      ? Math.min(...importedRows.map((r) => r.feed_order as number))
      : 0;

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
    // ALL imported-history rows and assign feed_order = -1, -2, …, -N so that:
    //   - the clip closest to "nu" always has feed_order = -1
    //   - deeper historik contains progressively older clips
    //   - gap-fill clips inserted between already-loaded rows land correctly
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

    const chronological = (allImported ?? []).sort((a, b) => {
      const dateA = a.published_at ? new Date(a.published_at as string).getTime() : 0;
      const dateB = b.published_at ? new Date(b.published_at as string).getTime() : 0;
      if (dateB !== dateA) return dateB - dateA;
      return (a.tiktok_url as string).localeCompare(b.tiktok_url as string);
    });

    const renumberUpdates = chronological
      .map((row, i) => ({ id: row.id as string, from: row.feed_order as number, to: -(i + 1) }))
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
    const finalFeedOrders = new Map(chronological.map((row, i) => [row.id as string, -(i + 1)]));
    const insertedIdSet = new Set((insertedRows ?? []).map(r => r.id as string));
    const finalSlots = chronological
      .filter(row => insertedIdSet.has(row.id as string))
      .map(row => ({ id: row.id, tiktok_url: row.tiktok_url, feed_order: finalFeedOrders.get(row.id as string) }));

    // ── 10. Stamp last_history_sync_at ─────────────────────────────────────
    await supabase
      .from('customer_profiles')
      .update({ last_history_sync_at: new Date().toISOString() })
      .eq('id', customerId);

    return NextResponse.json({
      fetched,
      imported: insertedRows?.length ?? 0,
      skipped,
      has_more: providerHasMore,
      cursor: providerCursor,
      slots: finalSlots,
    });
  },
  ['admin', 'content_manager']
);
