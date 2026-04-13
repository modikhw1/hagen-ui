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

  // ── 6. Renumber unreconciled imported clips to fill the gap ───────────────
  // Finds the deepest LeTrend historik row (after the produce shift), derives
  // the offset, and assigns consecutive feed_orders to unreconciled clips so
  // they sit flush below the LeTrend historik block with no empty slots.
  const { data: letrEndHistorik } = await supabase
    .from('customer_concepts')
    .select('feed_order')
    .eq('customer_profile_id', customerId)
    .not('concept_id', 'is', null)
    .lt('feed_order', 0)
    .order('feed_order', { ascending: true })
    .limit(1);

  const letrEndFloor = (letrEndHistorik?.[0]?.feed_order as number | undefined) ?? -1;
  const renumberOffset = Math.abs(letrEndFloor);

  const { data: unreconciled } = await supabase
    .from('customer_concepts')
    .select('id, feed_order, published_at, tiktok_url')
    .eq('customer_profile_id', customerId)
    .is('concept_id', null)
    .is('reconciled_customer_concept_id', null)
    .not('feed_order', 'is', null)
    .lt('feed_order', 0);

  const sorted = (unreconciled ?? []).sort((a, b) => {
    const dateA = a.published_at ? new Date(a.published_at as string).getTime() : 0;
    const dateB = b.published_at ? new Date(b.published_at as string).getTime() : 0;
    if (dateB !== dateA) return dateB - dateA;
    return (a.tiktok_url as string).localeCompare(b.tiktok_url as string);
  });

  const renumberUpdates = sorted
    .map((row, i) => ({
      id: row.id as string,
      from: row.feed_order as number,
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

  return { advanced: true, nuConceptId: nuRow.id, importedClipId: importedRow.id };
}
