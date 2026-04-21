// ─────────────────────────────────────────────────────────────────────────────
// history-import.ts
//
// importClipsForCustomer: shared deduplicate → insert → renumber → sync stamp.
// updateClipStats: update engagement stats on already-imported clips (cheap, runs every cron).
// importNewClips: fetch and insert clips not yet in DB (heavier, gated by last_history_sync_at).
//
// normalizeTikTokUrl: strips tracking params, normalises scheme/host/path for dedup.
// ─────────────────────────────────────────────────────────────────────────────

import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import type { NormalizedHistoryClip } from '@/lib/studio/tiktok-provider';

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;

const PAGE_SIZE = 1000;

// ── normalizeTikTokUrl ────────────────────────────────────────────────────────
/**
 * Strips tracking query params, normalises www-prefix, lowercase, trailing slash.
 * Used for deduplication when comparing incoming clips to existing DB rows.
 *
 * Handles:
 *   https://www.tiktok.com/@brand/video/123?_r=1 → https://tiktok.com/@brand/video/123
 *   https://tiktok.com/@brand/video/123/         → https://tiktok.com/@brand/video/123
 */
export function normalizeTikTokUrl(url: string): string {
  try {
    const u = new URL(url.toLowerCase());
    // Remove all query params (tracking, referral, etc.)
    u.search = '';
    // Remove trailing slash from path
    u.pathname = u.pathname.replace(/\/+$/, '');
    // Normalise www: tiktok.com and www.tiktok.com are the same profile
    const host = u.hostname.replace(/^www\./, '');
    return `https://${host}${u.pathname}`;
  } catch {
    // Fallback for malformed URLs
    return url.toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '');
  }
}

// ── updateClipStats ───────────────────────────────────────────────────────────
/**
 * Updates engagement stats (views, likes, comments, watch time) for all clips
 * that are already in the DB. Fast and cheap — runs every cron cycle.
 *
 * @param clips  Normalised clips from the provider (can include known + new).
 * @returns      Number of rows updated.
 */
export async function updateClipStats(
  supabase: SupabaseAdmin,
  customerId: string,
  clips: NormalizedHistoryClip[]
): Promise<number> {
  if (clips.length === 0) return 0;

  // Fetch existing clips with pagination
  const existingByUrl = await fetchExistingClipUrlMap(supabase, customerId);
  const now = new Date().toISOString();

  const updates = clips.filter((c) => existingByUrl.has(normalizeTikTokUrl(c.tiktok_url)));

  if (updates.length === 0) return 0;

  await Promise.all(
    updates.map((clip) => {
      const rowId = existingByUrl.get(normalizeTikTokUrl(clip.tiktok_url))!;
      const patch: {
        tiktok_views: number | null;
        tiktok_likes: number | null;
        tiktok_comments: number | null;
        tiktok_last_synced_at: string;
        tiktok_thumbnail_url?: string;
      } = {
        tiktok_views: clip.tiktok_views,
        tiktok_likes: clip.tiktok_likes,
        tiktok_comments: clip.tiktok_comments,
        tiktok_last_synced_at: now,
      };

      if (clip.tiktok_thumbnail_url) {
        patch.tiktok_thumbnail_url = clip.tiktok_thumbnail_url;
      }

      return supabase
        .from('customer_concepts')
        .update(patch)
        .eq('id', rowId);
    })
  );

  return updates.length;
}

// ── importNewClips ────────────────────────────────────────────────────────────
/**
 * Imports clips that are not yet in the DB as new rows with status='history_import'.
 * Heavier than updateClipStats — only called when last_history_sync_at is stale.
 *
 * @returns { imported, skipped }
 */
export async function importNewClips(
  supabase: SupabaseAdmin,
  customerId: string,
  clips: NormalizedHistoryClip[]
): Promise<{ imported: number; skipped: number; latestImportedPublishedAt: string | null }> {
  if (clips.length === 0) return { imported: 0, skipped: 0, latestImportedPublishedAt: null };

  const existingByUrl = await fetchExistingClipUrlMap(supabase, customerId);

  const newClips = clips.filter((c) => !existingByUrl.has(normalizeTikTokUrl(c.tiktok_url)));
  const skipped = clips.length - newClips.length;

  if (newClips.length === 0) return { imported: 0, skipped, latestImportedPublishedAt: null };

  // Sort newest-first for temp insertion order
  const sortedNewClips = [...newClips].sort((a, b) => {
    if (!a.published_at && !b.published_at) return 0;
    if (!a.published_at) return 1;
    if (!b.published_at) return -1;
    return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
  });

  // Find anchor: most-negative existing feed_order so temp positions don't collide
  const { data: allHistorikRows } = await supabase
    .from('customer_concepts')
    .select('feed_order')
    .eq('customer_profile_id', customerId)
    .lt('feed_order', 0)
    .order('feed_order', { ascending: true })
    .limit(1);

  const mostNegativeFeedOrder = (allHistorikRows?.[0]?.feed_order as number | undefined) ?? 0;
  const tempStartOrder = mostNegativeFeedOrder - 1;

  // Insert at temporary positions
  const inserts = sortedNewClips.map((clip, i) => ({
    customer_profile_id: customerId,
    customer_id: customerId,
    concept_id: null,
    status: 'history_import',
    feed_order: tempStartOrder - i,
    tiktok_url: clip.tiktok_url,
    tiktok_thumbnail_url: clip.tiktok_thumbnail_url,
    tiktok_views: clip.tiktok_views,
    tiktok_likes: clip.tiktok_likes,
    tiktok_comments: clip.tiktok_comments,
    published_at: clip.published_at,
    tags: [] as string[],
    content_overrides: clip.description ? { script: clip.description } : {},
  }));

  const { data: insertedRows, error: insertError } = await supabase
    .from('customer_concepts')
    .insert(inserts)
    .select('id');

  if (insertError) throw new Error(insertError.message);

  // Renumber all imported-history rows chronologically
  await renumberImportedRows(supabase, customerId);

  return {
    imported: insertedRows?.length ?? 0,
    skipped,
    latestImportedPublishedAt: sortedNewClips[0]?.published_at ?? null,
  };
}

// ── importClipsForCustomer ────────────────────────────────────────────────────
/**
 * Full pipeline: dedup → insert → renumber → sync stamp.
 * Used by the sync-history-all cron (legacy entry point, calls importNewClips
 * internally so both paths stay in sync).
 *
 * Always stamps last_history_sync_at.
 */
export async function importClipsForCustomer(
  supabase: SupabaseAdmin,
  customerId: string,
  clips: NormalizedHistoryClip[],
  options?: { tiktokHandle?: string | null }
): Promise<{ imported: number; skipped: number; skippedReason?: string }> {
  // Guard: no TikTok handle — nothing to import
  if (options?.tiktokHandle !== undefined && !options.tiktokHandle) {
    console.warn(`[importClips] customer ${customerId} skipped: no_tiktok_handle`);
    return { imported: 0, skipped: 0, skippedReason: 'no_tiktok_handle' };
  }

  if (clips.length === 0) {
    // API returned 0 clips — stamp sync time but don't crash
    console.info(`[importClips] customer ${customerId}: clips_found=0, stamping last_history_sync_at`);
    await supabase
      .from('customer_profiles')
      .update({ last_history_sync_at: new Date().toISOString() })
      .eq('id', customerId);
    return { imported: 0, skipped: 0 };
  }

  // Update stats on existing clips (always runs, cheap)
  await updateClipStats(supabase, customerId, clips);

  // Import new clips
  const { imported, skipped } = await importNewClips(supabase, customerId, clips);

  await supabase
    .from('customer_profiles')
    .update({ last_history_sync_at: new Date().toISOString() })
    .eq('id', customerId);

  return { imported, skipped };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Fetches all existing tiktok_url values for a customer with full pagination
 * (handles >1000 rows). Returns a Map of normalized URL → row id.
 */
async function fetchExistingClipUrlMap(
  supabase: SupabaseAdmin,
  customerId: string
): Promise<Map<string, string>> {
  const allExisting: Array<{ id: string; tiktok_url: string }> = [];
  let page = 0;

  while (true) {
    const { data } = await supabase
      .from('customer_concepts')
      .select('id, tiktok_url')
      .eq('customer_profile_id', customerId)
      .not('tiktok_url', 'is', null)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    const rows = (data ?? []) as Array<{ id: string; tiktok_url: string }>;
    allExisting.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    page++;
  }

  return new Map(allExisting.map((r) => [normalizeTikTokUrl(r.tiktok_url), r.id]));
}

/**
 * Re-reads all imported-history rows for a customer and assigns sequential
 * feed_orders below the deepest LeTrend historik row, sorted by published_at DESC.
 */
export async function renumberImportedRows(
  supabase: SupabaseAdmin,
  customerId: string
): Promise<void> {
  const { data: allImported } = await supabase
    .from('customer_concepts')
    .select('id, feed_order, published_at, tiktok_url')
    .eq('customer_profile_id', customerId)
    .is('concept_id', null)
    .is('reconciled_customer_concept_id', null);

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
    .map((row, i) => ({
      id: row.id as string,
      from: typeof row.feed_order === 'number' ? row.feed_order : null,
      to: -(renumberOffset + i + 1),
    }))
    .filter((u) => u.from !== u.to);

  if (renumberUpdates.length > 0) {
    await Promise.all(
      renumberUpdates.map((u) =>
        supabase
          .from('customer_concepts')
          .update({ feed_order: u.to })
          .eq('id', u.id)
      )
    );
  }
}
