import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

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
  // Find current most-negative feed_order for this customer
  const { data: existingHistory } = await supabase
    .from('customer_concepts')
    .select('feed_order')
    .eq('customer_profile_id', customerId)
    .lt('feed_order', 0)
    .order('feed_order', { ascending: true })
    .limit(1);

  const currentMostNegative = existingHistory?.[0]?.feed_order ?? 0;
  const startOrder = replace ? -1 : Math.min(currentMostNegative - 1, -1);

  // Most-recent clip gets the least-negative order (closest to 0 in history)
  const inserts = clips.map((clip, i) => ({
    customer_profile_id: customerId,
    customer_id: customerId,
    concept_id: null,
    status: 'produced',
    feed_order: startOrder - i,
    tiktok_url: clip.tiktok_url.trim(),
    tiktok_thumbnail_url: clip.tiktok_thumbnail_url ?? clip.thumbnail_url ?? null,
    tiktok_views: clip.tiktok_views ?? null,
    tiktok_likes: clip.tiktok_likes ?? null,
    tiktok_comments: clip.tiktok_comments ?? null,
    published_at: clip.published_at ?? null,
    tags: [],
    content_overrides: clip.description ? { script: clip.description } : {},
  }));

  const { data, error } = await supabase
    .from('customer_concepts')
    .insert(inserts)
    .select('id, feed_order, tiktok_url');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    imported: data?.length ?? 0,
    skipped,
    slots: data,
  });
}
