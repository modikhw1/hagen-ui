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

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;

export type AutoReconcileResult =
  | { advanced: true; nuConceptId: string; importedClipId: string }
  | {
      advanced: false;
      reason: 'no_nu_slot' | 'no_unreconciled_clip' | 'reconcile_failed' | 'produce_failed';
      detail?: string;
    };

export async function autoReconcileAndAdvance(
  supabase: SupabaseAdmin,
  customerId: string
): Promise<AutoReconcileResult> {
  const now = new Date().toISOString();

  // ── 1. Find nu-slot ───────────────────────────────────────────────────────
  const { data: nuRow, error: nuError } = await supabase
    .from('customer_concepts')
    .select('id')
    .eq('customer_profile_id', customerId)
    .eq('feed_order', 0)
    .not('concept_id', 'is', null)
    .maybeSingle();

  if (nuError || !nuRow) {
    return { advanced: false, reason: 'no_nu_slot' };
  }

  // ── 2. Newest unreconciled imported clip ──────────────────────────────────
  // Ordered by feed_order DESC: the clip at -1 is the most recently published
  // (importClipsForCustomer renumbers newest → most-negative +1 position).
  const { data: importedRow, error: importedError } = await supabase
    .from('customer_concepts')
    .select('id, tiktok_url, published_at')
    .eq('customer_profile_id', customerId)
    .is('concept_id', null)
    .is('reconciled_customer_concept_id', null)
    .lt('feed_order', 0)
    .order('feed_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (importedError || !importedRow) {
    return { advanced: false, reason: 'no_unreconciled_clip' };
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

  return { advanced: true, nuConceptId: nuRow.id, importedClipId: importedRow.id };
}
