import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { motorSignalCleared } from '@/lib/studio/motor-signal';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/studio-v2/customers/[customerId]/advance-plan
//
// Advances the CM planning window by one step.
//
// Operation: decrements feed_order by 1 for all LeTrend-managed
// customer_concepts (concept_id IS NOT NULL) for this customer.
//
// Effect:
//   - feed_order 0 (nu) → -1 (becomes recent history)
//   - feed_order +1      → 0  (becomes new nu)
//   - feed_order +2      → +1 (approaches nu)
//   - etc.
//
// This models the real-world scenario where a production cycle has completed:
// a real TikTok clip was published, so the planning window should move forward.
// Only LeTrend-managed rows are touched; imported-history rows (concept_id IS NULL)
// retain their chronological positions.
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

    // Fetch all LeTrend-managed rows with a placed feed_order
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

    // Decrement feed_order by 1 for each placed concept
    const updates = await Promise.all(
      placed.map(r =>
        supabase
          .from('customer_concepts')
          .update({ feed_order: r.feed_order - 1 })
          .eq('id', r.id)
      )
    );

    const errors = updates.map(u => u.error).filter(Boolean);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0]?.message ?? 'Update failed' }, { status: 500 });
    }

    // Clear motor signal and acknowledgement — CM has advanced the plan.
    await supabase
      .from('customer_profiles')
      .update(motorSignalCleared())
      .eq('id', customerId);

    return NextResponse.json({ advanced: placed.length });
  },
  ['admin', 'content_manager']
);
