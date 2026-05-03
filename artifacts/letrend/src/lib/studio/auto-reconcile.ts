// ─────────────────────────────────────────────────────────────────────────────
// autoReconcileAndAdvance
//
// Called by the cron route after importClipsForCustomer when new clips were
// imported. Assumes that active LeTrend customers follow the curated plan, so
// the newest unreconciled imported clip is treated as the output of the current
// nu-slot concept.
//
// What it does:
//   1. Find the nu-slot concept (feed_order = 0, concept_id IS NOT NULL).
//   2. Find the newest unreconciled imported clip (feed_order closest to 0
//      among negative orders, i.e. most-recently-published).
//   3. Reconcile: set reconciled_customer_concept_id on the imported clip.
//   4. Advance the plan: call performMarkProduced (3-phase shift + clear signal).
//
// The concepts API GET enriches LeTrend history cards with TikTok stats from
// their reconciled imported clips at read-time, so no stats are copied here.
//
// CM override: "Markera som TikTok" un-reconciles the clip (DELETE reconciliation
// endpoint). The auto-advance itself is not reversible — adding a new concept
// assignment restores a nu-slot.
// ─────────────────────────────────────────────────────────────────────────────

import { performMarkProduced } from '@/lib/studio/perform-mark-produced';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { renumberImportedRows } from '@/lib/studio/history-import';

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;

export type AutoReconcileResult =
  | { advanced: true; nuConceptId: string; importedClipId: string }
  | {
      advanced: false;
      reason:
        | 'no_nu_slot'
        | 'no_unreconciled_clip'
        | 'reconcile_failed'
        | 'produce_failed'
        | 'empty_feed'
        | 'no_published_at';
      detail?: string;
      skipped?: boolean;
    };

export async function autoReconcileAndAdvance(
  supabase: SupabaseAdmin,
  customerId: string
): Promise<AutoReconcileResult> {
  const now = new Date().toISOString();

  // ── 0. Guard: empty feed ──────────────────────────────────────────────────
  // Skip reconciliation if no concepts have a feed_order (empty feed).
  const { count: feedCount } = await supabase
    .from('customer_concepts')
    .select('id', { count: 'exact', head: true })
    .eq('customer_profile_id', customerId)
    .not('feed_order', 'is', null)
    .not('concept_id', 'is', null);

  if (!feedCount || feedCount === 0) {
    return { advanced: false, reason: 'empty_feed', skipped: true };
  }

  // ── 1. Find nu-slot ───────────────────────────────────────────────────────
  const { data: nuRow, error: nuError } = await supabase
    .from('customer_concepts')
    .select('id, sent_at')
    .eq('customer_profile_id', customerId)
    .eq('feed_order', 0)
    .not('concept_id', 'is', null)
    .maybeSingle();

  if (nuError || !nuRow) {
    return { advanced: false, reason: 'no_nu_slot' };
  }

  // ── 2. Newest unreconciled imported clip ──────────────────────────────────
  // Order by published_at DESC for reliable matching: feed_order is unreliable
  // for TikTok-imported clips that may not have been assigned a correct value.
  // Falls back to skipping if all candidates lack published_at.
  const { data: importedRow, error: importedError } = await supabase
    .from('customer_concepts')
    .select('id, tiktok_url, published_at')
    .eq('customer_profile_id', customerId)
    .is('concept_id', null)
    .is('reconciled_customer_concept_id', null)
    .not('tiktok_url', 'is', null)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (importedError || !importedRow) {
    return { advanced: false, reason: 'no_unreconciled_clip' };
  }

  // Fallback: if no published_at on this clip, skip reconciliation
  if (!importedRow.published_at) {
    console.warn(`[autoReconcile] skipping customer ${customerId}: no published_at on newest clip`);
    return { advanced: false, reason: 'no_unreconciled_clip' };
  }

  // Confidence check: if the clip is >48h older than the nu-slot's sent_at, log a warning
  // but reconcile anyway (flagged with low confidence in logs).
  const nuSlotSentAt = typeof nuRow.sent_at === 'string'
    ? new Date(nuRow.sent_at as string).getTime()
    : null;
  const clipPublishedAt = new Date(importedRow.published_at as string).getTime();
  if (nuSlotSentAt !== null) {
    const diffMs = nuSlotSentAt - clipPublishedAt;
    const diffH = diffMs / (1000 * 60 * 60);
    if (diffH > 48) {
      console.warn(
        `[autoReconcile] low confidence for customer ${customerId}: clip published_at is ${Math.round(diffH)}h before nu-slot sent_at`
      );
    }
  }

  // ── 3. Reconcile: link imported clip to nu-slot concept ───────────────────
  const { error: reconcileError } = await supabase
    .from('customer_concepts')
    .update({
      reconciled_customer_concept_id: nuRow.id,
      reconciled_by_cm_id: null, // system-initiated; no CM actor
      reconciled_at: now,
    })
    .eq('id', importedRow.id);

  if (reconcileError) {
    return { advanced: false, reason: 'reconcile_failed', detail: reconcileError.message };
  }

  // ── 4. Advance plan: mark nu as produced ─────────────────────────────────
  const result = await performMarkProduced(supabase, {
    customerId,
    conceptId: nuRow.id,
    tiktok_url: typeof importedRow.tiktok_url === 'string' ? importedRow.tiktok_url : null,
    published_at: typeof importedRow.published_at === 'string' ? importedRow.published_at : null,
    now,
  });

  if (!result.success) {
    return { advanced: false, reason: 'produce_failed', detail: result.error };
  }

  // ── 5. Remove reconciled clip from the grid sequence ─────────────────────
  // After performMarkProduced, the reconciled clip sits at -2 (Phase 2 shifted
  // it there). The concepts API hides it, but the gap at -2 would leave an
  // empty slot between the new LeTrend card at -1 and the next TikTok card.
  // Setting feed_order = null takes it out of the numbered sequence entirely
  // while keeping it available for the in-memory stats join in the concepts API.
  await supabase
    .from('customer_concepts')
    .update({ feed_order: null })
    .eq('id', importedRow.id);

  await renumberImportedRows(supabase, customerId);

  return { advanced: true, nuConceptId: nuRow.id, importedClipId: importedRow.id };
}
