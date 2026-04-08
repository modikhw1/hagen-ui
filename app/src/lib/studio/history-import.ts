// ─────────────────────────────────────────────────────────────────────────────
// importClipsForCustomer
//
// Shared deduplicate → insert → renumber → motor signal helper.
// Used by the automatic sync-history-all route so the new route does not
// duplicate the per-customer insert semantics.
//
// The per-customer fetch-profile-history and import-history routes manage
// their own insert/renumber inline and are not affected by this module.
// ─────────────────────────────────────────────────────────────────────────────

import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { motorSignalNewEvidence } from '@/lib/studio/motor-signal';
import type { NormalizedHistoryClip } from '@/lib/studio/tiktok-provider';

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;

/**
 * Deduplicates, inserts, renumbers, and writes the motor signal for a
 * batch of normalized history clips for one customer.
 *
 * Always stamps `last_history_sync_at` — even when all clips are duplicates.
 * Only writes `motorSignalNewEvidence` when `imported > 0`.
 *
 * Throws on DB errors so the caller can catch and record per-customer failures.
 */
export async function importClipsForCustomer(
  supabase: SupabaseAdmin,
  customerId: string,
  clips: NormalizedHistoryClip[]
): Promise<{ imported: number; skipped: number }> {
  if (clips.length === 0) {
    await supabase
      .from('customer_profiles')
      .update({ last_history_sync_at: new Date().toISOString() })
      .eq('id', customerId);
    return { imported: 0, skipped: 0 };
  }

  // ── Deduplicate against existing tiktok_urls ──────────────────────────────
  const { data: existing } = await supabase
    .from('customer_concepts')
    .select('tiktok_url')
    .eq('customer_profile_id', customerId)
    .not('tiktok_url', 'is', null);

  const existingUrls = new Set((existing ?? []).map((r) => r.tiktok_url as string));
  const newClips = clips.filter((c) => !existingUrls.has(c.tiktok_url));
  const skipped = clips.length - newClips.length;

  if (newClips.length === 0) {
    await supabase
      .from('customer_profiles')
      .update({ last_history_sync_at: new Date().toISOString() })
      .eq('id', customerId);
    return { imported: 0, skipped };
  }

  // ── Sort newest-first for temp insertion order ────────────────────────────
  const sortedNewClips = [...newClips].sort((a, b) => {
    if (!a.published_at && !b.published_at) return 0;
    if (!a.published_at) return 1;
    if (!b.published_at) return -1;
    return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
  });

  // ── Find anchor for temp positions (most-negative existing feed_order) ────
  const { data: existingImportedRows } = await supabase
    .from('customer_concepts')
    .select('feed_order')
    .eq('customer_profile_id', customerId)
    .is('concept_id', null)
    .lt('feed_order', 0)
    .order('feed_order', { ascending: true })
    .limit(1);

  const mostNegativeFeedOrder = (existingImportedRows?.[0]?.feed_order as number | undefined) ?? 0;
  const tempStartOrder = mostNegativeFeedOrder - 1;

  // ── Insert at temporary positions ─────────────────────────────────────────
  const inserts = sortedNewClips.map((clip, i) => ({
    customer_profile_id: customerId,
    customer_id: customerId,
    concept_id: null,
    status: 'produced',
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

  // ── Renumber all imported-history rows chronologically ────────────────────
  //
  // Re-read ALL imported-history rows and assign feed_order = -1, -2, …, -N so
  // that the most-recently-published clip is always closest to "nu".
  // Scope: concept_id IS NULL AND feed_order < 0 (imported profile history only).
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

  // ── Stamp sync time + motor signal ────────────────────────────────────────
  const importedCount = insertedRows?.length ?? 0;
  // sortedNewClips is DESC by published_at — index 0 is the most recently published.
  const latestPublishedAt = sortedNewClips[0]?.published_at ?? null;
  await supabase
    .from('customer_profiles')
    .update({
      last_history_sync_at: new Date().toISOString(),
      ...(importedCount > 0 ? motorSignalNewEvidence(importedCount, latestPublishedAt) : {}),
    })
    .eq('id', customerId);

  return { imported: importedCount, skipped };
}
