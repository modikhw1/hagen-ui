import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { importClipsForCustomer } from '@/lib/studio/history-import';
import { autoReconcileAndAdvance } from '@/lib/studio/auto-reconcile';
import {
  fetchProviderVideos,
  normalizeVideo,
  type Scraper7Video,
} from '@/lib/studio/tiktok-provider';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/studio-v2/customers/[customerId]/fetch-profile-history
//
// Real customer publication-history ingestion.
// Sources the customer's actual TikTok profile feed via RapidAPI / tiktok-scraper7.
//
// Flow:
//   1. Fetch clips from provider (with optional cursor for load-more pagination)
//   2. Normalize
//   3. Delegate dedup / insert / renumber / motor signal to importClipsForCustomer
//   4. On fresh fetches (no cursor): run autoReconcileAndAdvance so the newest
//      imported clip is matched to the nu-slot concept and the plan advances.
//      Load-more fetches (cursor present) load historical clips that predate the
//      current plan — no reconcile trigger.
//
// Request body (optional JSON):
//   count  — clips to fetch (default 10, max 50)
//   cursor — provider pagination cursor for load-more
//
// Required env:
//   RAPIDAPI_KEY
// ─────────────────────────────────────────────────────────────────────────────

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

    // ── 1. Parse options ──────────────────────────────────────────────────
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

    // Fresh fetch (no cursor) = initial load or manual refresh of recent clips.
    // Load-more (cursor present) = paginating into older history — no reconcile.
    const isInitialFetch = fetchCursor === undefined;

    // ── 2. Read profile identity ──────────────────────────────────────────
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

    // ── 3. Provider key ───────────────────────────────────────────────────
    const rapidApiKey = process.env.RAPIDAPI_KEY;
    if (!rapidApiKey) {
      return NextResponse.json({ error: 'RAPIDAPI_KEY is not configured' }, { status: 503 });
    }

    // ── 4. Fetch from provider ────────────────────────────────────────────
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

    // ── 5. Normalize ──────────────────────────────────────────────────────
    const clips = rawVideos
      .map((v) => normalizeVideo(v, handle))
      .filter((c): c is NonNullable<typeof c> => c !== null);

    const fetched = clips.length;

    // ── 6. Import (dedup / insert / renumber / motor signal / sync stamp) ─
    const { imported, skipped } = await importClipsForCustomer(supabase, customerId, clips);

    // ── 7. Auto-reconcile on fresh fetches ────────────────────────────────
    if (imported > 0 && isInitialFetch) {
      await autoReconcileAndAdvance(supabase, customerId);
    }

    return NextResponse.json({
      fetched,
      imported,
      skipped,
      has_more: providerHasMore,
      cursor: providerCursor,
    });
  },
  ['admin', 'content_manager']
);
