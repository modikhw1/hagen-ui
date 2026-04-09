import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { motorSignalCleared } from '@/lib/studio/motor-signal';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/studio-v2/customers/[customerId]/advance-plan
//
// Advances the CM planning window by one step.
//
// Operation (two phases):
//
// Phase 1 — shift ALL LeTrend rows (concept_id IS NOT NULL, feed_order IS NOT NULL) by -1:
//   - feed_order 0 (nu)  → -1 (enters historik)
//   - feed_order +1      →  0 (becomes new nu)
//   - feed_order +2      → +1 (approaches nu)
//   - feed_order -1 (old LeTrend historik) → -2  (shifts deeper, no pile-up)
//
// Phase 2 — shift imported-history rows (concept_id IS NULL, feed_order < 0) by -1:
//   - feed_order -1 (newest TikTok import) → -2
//   - feed_order -2                        → -3
//   - … and so on
//
// Why both phases shift together:
//   After phase 1, the LeTrend nu row lands at feed_order -1. Without phase 2,
//   imported TikTok historik rows already at -1 would collide. Phase 2 shifts
//   the entire imported-history block one step deeper.
//
//   Phase 1 must shift ALL LeTrend rows (not just feed_order >= 0) so that
//   existing LeTrend historik rows also shift deeper on each advance. If phase 1
//   were restricted to >= 0, the new nu would always land at -1 while prior nu
//   rows pile up at -1 after repeated advances. Shifting everything together keeps
//   LeTrend historik internally ordered by recency across advances.
//
// Trigger: CM confirms advancement after new TikTok clips are fetched and
// indicate that real-world publication has occurred.
// ─────────────────────────────────────────────────────────────────────────────

export const POST = withAuth(
  async (
    _request: NextRequest,
    _user: unknown,
    { params }: { params: Promise<{ customerId: string }> }
  ) => {
    const { customerId } = await params;
    const supabase = createSupabaseAdmin();

    // ── Phase 1: shift ALL LeTrend rows (active plan + LeTrend historik) ──────
    const { data: rows, error: fetchError } = await supabase
      .from('customer_concepts')
      .select('id, feed_order')
      .eq('customer_profile_id', customerId)
      .not('concept_id', 'is', null)
      .not('feed_order', 'is', null);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const placed = (rows ?? []).filter(
      (r): r is { id: string; feed_order: number } =>
        typeof r.id === 'string' && typeof r.feed_order === 'number'
    );

    if (placed.length === 0) {
      return NextResponse.json({ advanced: 0, message: 'No placed LeTrend concepts to advance' });
    }

    const letrEndUpdates = await Promise.all(
      placed.map(r =>
        supabase
          .from('customer_concepts')
          .update({ feed_order: r.feed_order - 1 })
          .eq('id', r.id)
      )
    );

    const letrEndErrors = letrEndUpdates.map(u => u.error).filter(Boolean);
    if (letrEndErrors.length > 0) {
      return NextResponse.json({ error: letrEndErrors[0]?.message ?? 'LeTrend update failed' }, { status: 500 });
    }

    // ── Phase 2: shift imported-history rows (concept_id IS NULL, feed_order < 0)
    // Prevents collision between the LeTrend nu row now at -1 and TikTok imports
    // already occupying -1. Relative order within imported history is preserved.
    const { data: importedRows, error: importedFetchError } = await supabase
      .from('customer_concepts')
      .select('id, feed_order')
      .eq('customer_profile_id', customerId)
      .is('concept_id', null)
      .lt('feed_order', 0);

    if (importedFetchError) {
      return NextResponse.json({ error: importedFetchError.message }, { status: 500 });
    }

    const imported = (importedRows ?? []).filter(
      (r): r is { id: string; feed_order: number } =>
        typeof r.id === 'string' && typeof r.feed_order === 'number'
    );

    if (imported.length > 0) {
      const importedUpdates = await Promise.all(
        imported.map(r =>
          supabase
            .from('customer_concepts')
            .update({ feed_order: r.feed_order - 1 })
            .eq('id', r.id)
        )
      );

      const importedErrors = importedUpdates.map(u => u.error).filter(Boolean);
      if (importedErrors.length > 0) {
        return NextResponse.json({ error: importedErrors[0]?.message ?? 'Imported history update failed' }, { status: 500 });
      }
    }

    // Clear motor signal and acknowledgement — CM has advanced the plan.
    await supabase
      .from('customer_profiles')
      .update(motorSignalCleared())
      .eq('id', customerId);

    return NextResponse.json({ advanced: placed.length, importedShifted: imported.length });
  },
  ['admin', 'content_manager']
);
