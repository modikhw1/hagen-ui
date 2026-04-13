// ─────────────────────────────────────────────────────────────────────────────
// performMarkProduced
//
// Shared three-phase mark-produced logic, extracted so it can be called from
// both the HTTP route (CM action) and the auto-reconcile cron path.
//
// Phases:
//   1. Shift all OTHER LeTrend rows (concept_id IS NOT NULL, id ≠ produced)
//      by -1 so upcoming concepts slide toward nu and historik sits deeper.
//   2. Shift all imported-history rows (concept_id IS NULL, feed_order < 0)
//      by -1 to prevent collision with the produced row that lands at -1.
//   3. Stamp the produced row: status=produced, produced_at, tiktok_url,
//      published_at, feed_order=-1.
//   4. Clear the motor signal (plan has advanced — nudge is no longer needed).
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

  // ── Phase 1: shift all other LeTrend rows by -1 ──────────────────────────
  const { data: letrEndRows, error: letrEndFetchError } = await supabase
    .from('customer_concepts')
    .select('id, feed_order')
    .eq('customer_profile_id', customerId)
    .not('concept_id', 'is', null)
    .neq('id', conceptId)
    .not('feed_order', 'is', null);

  if (letrEndFetchError) {
    return { success: false, letrend_shifted: 0, imported_shifted: 0, error: letrEndFetchError.message };
  }

  const letrEndToShift = (letrEndRows ?? []).filter(
    (r): r is { id: string; feed_order: number } =>
      typeof r.id === 'string' && typeof r.feed_order === 'number'
  );

  if (letrEndToShift.length > 0) {
    const shiftResults = await Promise.all(
      letrEndToShift.map((r) =>
        supabase
          .from('customer_concepts')
          .update({ feed_order: r.feed_order - 1 })
          .eq('id', r.id)
      )
    );
    const shiftErrors = shiftResults.map((r) => r.error).filter(Boolean);
    if (shiftErrors.length > 0) {
      return {
        success: false,
        letrend_shifted: 0,
        imported_shifted: 0,
        error: shiftErrors[0]?.message ?? 'LeTrend shift failed',
      };
    }
  }

  // ── Phase 2: shift imported-history rows by -1 (collision prevention) ────
  const { data: importedRows, error: importedFetchError } = await supabase
    .from('customer_concepts')
    .select('id, feed_order')
    .eq('customer_profile_id', customerId)
    .is('concept_id', null)
    .lt('feed_order', 0);

  if (importedFetchError) {
    return {
      success: false,
      letrend_shifted: letrEndToShift.length,
      imported_shifted: 0,
      error: importedFetchError.message,
    };
  }

  const importedToShift = (importedRows ?? []).filter(
    (r): r is { id: string; feed_order: number } =>
      typeof r.id === 'string' && typeof r.feed_order === 'number'
  );

  if (importedToShift.length > 0) {
    const importedShiftResults = await Promise.all(
      importedToShift.map((r) =>
        supabase
          .from('customer_concepts')
          .update({ feed_order: r.feed_order - 1 })
          .eq('id', r.id)
      )
    );
    const importedShiftErrors = importedShiftResults.map((r) => r.error).filter(Boolean);
    if (importedShiftErrors.length > 0) {
      return {
        success: false,
        letrend_shifted: letrEndToShift.length,
        imported_shifted: 0,
        error: importedShiftErrors[0]?.message ?? 'TikTok history shift failed',
      };
    }
  }

  // ── Phase 3: stamp the produced row at feed_order -1 ─────────────────────
  const { error: produceError } = await supabase
    .from('customer_concepts')
    .update({
      ...buildMarkProducedPayload({
        tiktok_url: tiktok_url ?? null,
        published_at: published_at ?? null,
        now,
      }),
      feed_order: -1,
    })
    .eq('id', conceptId)
    .eq('customer_profile_id', customerId);

  if (produceError) {
    return {
      success: false,
      letrend_shifted: letrEndToShift.length,
      imported_shifted: importedToShift.length,
      error: produceError.message,
    };
  }

  // ── Phase 4: clear the motor signal ──────────────────────────────────────
  await supabase
    .from('customer_profiles')
    .update(motorSignalCleared())
    .eq('id', customerId);

  return {
    success: true,
    letrend_shifted: letrEndToShift.length,
    imported_shifted: importedToShift.length,
  };
}
