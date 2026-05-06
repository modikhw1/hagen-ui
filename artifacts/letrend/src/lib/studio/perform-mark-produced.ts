// ─────────────────────────────────────────────────────────────────────────────
// performMarkProduced
//
// Shared mark-produced logic for the auto-reconcile cron path.
//
// Delegates all business logic (validation + status update + feed timeline
// shift) to the row_kind-aware `advance_customer_feed_plan` RPC introduced in
// migration 20260506132453.  The legacy `shift_feed_order` + manual
// customer_concepts UPDATE approach has been retired.
//
// Phases:
//   1. Set pending_history_advance_at = now() (operation lock for frontend badge).
//   2. Call advance_customer_feed_plan RPC (validation + update + timeline shift).
//   3. Clear pending_history_advance_at (operation complete).
//   4. Clear the motor signal (plan has advanced — nudge is no longer needed).
// ─────────────────────────────────────────────────────────────────────────────

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
  const { customerId, conceptId, tiktok_url, published_at, now } = input;

  // ── Phase 1: mark operation as in-progress ────────────────────────────────
  // Frontend shows a "syncing..." badge if this is set for >60s.
  await supabase
    .from('customer_profiles')
    .update({ pending_history_advance_at: now })
    .eq('id', customerId);

  // ── Phase 2: delegate to row_kind-aware RPC ───────────────────────────────
  // advance_customer_feed_plan validates row_kind, stamps the produced row,
  // and shifts the LeTrend timeline — all inside one DB transaction.
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    'advance_customer_feed_plan',
    {
      p_customer_id: customerId,
      p_concept_id: conceptId,
      p_tiktok_url: tiktok_url ?? null,
      p_published_at: published_at ?? null,
      p_now: now,
    },
  );

  if (rpcError) {
    await supabase
      .from('customer_profiles')
      .update({ pending_history_advance_at: null })
      .eq('id', customerId);
    return { success: false, letrend_shifted: 0, imported_shifted: 0, error: rpcError.message };
  }

  // Check for soft error encoded in returned JSONB.
  const rpcData = rpcResult as Record<string, unknown> | null;
  const errorCode =
    rpcData && typeof rpcData['error_code'] === 'string' ? rpcData['error_code'] : null;

  if (errorCode) {
    await supabase
      .from('customer_profiles')
      .update({ pending_history_advance_at: null })
      .eq('id', customerId);
    const message =
      typeof rpcData?.['message'] === 'string' ? rpcData['message'] : errorCode;
    return { success: false, letrend_shifted: 0, imported_shifted: 0, error: message };
  }

  // ── Phase 3: clear operation lock ─────────────────────────────────────────
  await supabase
    .from('customer_profiles')
    .update({ pending_history_advance_at: null })
    .eq('id', customerId);

  // ── Phase 4: mark any active feed_motor_signals as auto-resolved ──────────
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
