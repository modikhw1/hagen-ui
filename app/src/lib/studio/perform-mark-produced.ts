// ─────────────────────────────────────────────────────────────────────────────
// performMarkProduced
//
// Shared three-phase mark-produced logic, extracted so it can be called from
// both the HTTP route (CM action) and the auto-reconcile cron path.
//
// Phases:
//   1. Set pending_history_advance_at = now() (operation lock for frontend badge).
//   2. Atomically shift ALL feed_order values via shift_feed_order RPC.
//   3. Stamp the produced row: status=produced, produced_at, tiktok_url,
//      published_at, feed_order=-1.
//   4. Clear pending_history_advance_at (operation complete).
//   5. Clear the motor signal (plan has advanced — nudge is no longer needed).
// ─────────────────────────────────────────────────────────────────────────────

import { buildMarkProducedPayload } from '@/lib/customer-concept-lifecycle';
import { motorSignalCleared } from '@/lib/studio/motor-signal';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;

export interface PerformMarkProducedInput {
  customerId: string;
  conceptId: string;
  tiktok_url?: string | null;
  published_at?: string | null;
  marker_cm_id?: string | null;
  now: string;
}

export interface PerformMarkProducedResult {
  success: boolean;
  letrend_shifted: number;
  imported_shifted: number;
  error?: string;
}

export async function performMarkProduced(
  supabase: SupabaseAdmin,
  input: PerformMarkProducedInput
): Promise<PerformMarkProducedResult> {
  const { customerId, conceptId, tiktok_url, published_at, marker_cm_id, now } = input;

  // ── Phase 1: mark operation as in-progress ────────────────────────────────
  // Frontend shows a "syncing..." badge if this is set for >60s.
  await supabase
    .from('customer_profiles')
    .update({ pending_history_advance_at: now })
    .eq('id', customerId);

  // ── Phase 2: atomically shift all feed_order values ───────────────────────
  // Replaces the previous JS-loop approach (Phases 1 + 2) with a single
  // PL/pgSQL RPC call that runs inside an implicit transaction.
  const { error: shiftError } = await supabase.rpc('shift_feed_order', {
    p_customer_id: customerId,
    p_advance_count: 1,
  });

  if (shiftError) {
    // Clear the lock even on failure so the frontend badge doesn't get stuck.
    await supabase
      .from('customer_profiles')
      .update({ pending_history_advance_at: null })
      .eq('id', customerId);
    return { success: false, letrend_shifted: 0, imported_shifted: 0, error: shiftError.message };
  }

  // ── Phase 3: stamp the produced row at feed_order -1 ─────────────────────
  // shift_feed_order already moved the nu-slot (feed_order 0) to -1.
  // We re-set it explicitly here alongside the status/timestamp changes.
  const { error: produceError } = await supabase
    .from('customer_concepts')
    .update({
      ...buildMarkProducedPayload({
        tiktok_url: tiktok_url ?? null,
        published_at: published_at ?? null,
        now,
      }),
      ...(marker_cm_id ? { cm_id: marker_cm_id } : {}),
      feed_order: -1,
    })
    .eq('id', conceptId)
    .eq('customer_profile_id', customerId);

  if (produceError) {
    await supabase
      .from('customer_profiles')
      .update({ pending_history_advance_at: null })
      .eq('id', customerId);
    return {
      success: false,
      letrend_shifted: 0,
      imported_shifted: 0,
      error: produceError.message,
    };
  }

  // ── Phase 4: clear operation lock + motor signal ──────────────────────────
  await supabase
    .from('customer_profiles')
    .update({
      pending_history_advance_at: null,
      ...motorSignalCleared(),
    })
    .eq('id', customerId);

  // ── Phase 5: mark any active feed_motor_signals as auto-resolved ──────────
  // The plan has advanced — active nudges are no longer actionable.
  await supabase
    .from('feed_motor_signals')
    .update({ auto_resolved_at: now })
    .eq('customer_id', customerId)
    .is('acknowledged_at', null)
    .is('auto_resolved_at', null);

  return {
    success: true,
    letrend_shifted: 0,
    imported_shifted: 0,
  };
}
