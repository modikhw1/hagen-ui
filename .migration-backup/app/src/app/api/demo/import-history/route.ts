import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface TikTokClipInput {
  tiktok_url: string;
  tiktok_thumbnail_url?: string | null;
  tiktok_views?: number | null;
  tiktok_likes?: number | null;
  tiktok_comments?: number | null;
  description?: string | null;
  published_at?: string | null;
}

// ─────────────────────────────────────────────
// POST /api/demo/import-history
//
// Imports an array of TikTok clips as produced history slots
// in the feed planner (negative feed_order values).
//
// Assigns feed_order starting from the most negative existing
// history slot, so new imports always go further back.
//
// Body: { customerId: string; clips: TikTokClipInput[]; replace?: boolean }
//   replace: if true, deletes existing history slots before importing
// ─────────────────────────────────────────────

export const POST = withAuth(async (request: NextRequest) => {
  const body = await request.json();
  const { customerId, clips, replace = false } = body as {
    customerId: string;
    clips: TikTokClipInput[];
    replace?: boolean;
  };

  if (!customerId) {
    return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
  }
  if (!Array.isArray(clips) || clips.length === 0) {
    return NextResponse.json({ error: 'clips must be a non-empty array' }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();

  if (replace) {
    // Remove existing history slots (concept_id IS NULL = history imports)
    await supabase
      .from('customer_concepts')
      .delete()
      .eq('customer_profile_id', customerId)
      .is('concept_id', null)
      .lt('feed_order', 0);
  }

  // Find the current most-negative feed_order for this customer
  const { data: existing } = await supabase
    .from('customer_concepts')
    .select('feed_order')
    .eq('customer_profile_id', customerId)
    .lt('feed_order', 0)
    .order('feed_order', { ascending: true })
    .limit(1);

  // Start from one step further back than the current oldest slot
  // Most recent clip gets feed_order -1, older clips get -2, -3, …
  const currentMostNegative = existing?.[0]?.feed_order ?? 0;
  const startOrder = Math.min(currentMostNegative - 1, -1);

  // Clips are ordered most-recent-first in the input array.
  // feed_order -1 = most recent, -2 = next, etc.
  const inserts = clips.map((clip, i) => ({
    customer_profile_id: customerId,
    customer_id: customerId,
    concept_id: null,
    status: 'produced',
    feed_order: replace ? -(i + 1) : startOrder - i,
    tiktok_url: clip.tiktok_url ?? null,
    tiktok_thumbnail_url: clip.tiktok_thumbnail_url ?? null,
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
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    imported: data?.length ?? 0,
    slots: data,
  });
}, ['admin', 'content_manager']);
