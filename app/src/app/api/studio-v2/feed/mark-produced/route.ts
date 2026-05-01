import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { logInteraction } from '@/lib/interactions';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import {
  normalizeStudioCustomerConcept,
  STUDIO_CUSTOMER_CONCEPT_SELECT,
} from '@/lib/studio/customer-concepts';
import { performMarkProduced } from '@/lib/studio/perform-mark-produced';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/studio-v2/feed/mark-produced
//
// Marks the current nu concept (feed_order 0) as produced and advances
// the planning window. Delegates to performMarkProduced (three-phase logic
// shared with the cron auto-advance path).
// ─────────────────────────────────────────────────────────────────────────────

export const POST = withAuth(async (request, user) => {
  const body = await request.json().catch(() => ({}));
  const supabase = createSupabaseAdmin();
  const conceptId = typeof body?.concept_id === 'string' ? body.concept_id.trim() : '';
  const customerId = typeof body?.customer_id === 'string' ? body.customer_id.trim() : '';
  const clipPublishedAt = typeof body?.published_at === 'string' ? body.published_at : null;
  const now = new Date().toISOString();

  if (!conceptId) {
    return NextResponse.json({ error: 'concept_id is required' }, { status: 400 });
  }

  if (!customerId) {
    return NextResponse.json({ error: 'customer_id is required' }, { status: 400 });
  }

  const result = await performMarkProduced(supabase, {
    customerId,
    conceptId,
    tiktok_url: typeof body?.tiktok_url === 'string' ? body.tiktok_url : null,
    published_at: clipPublishedAt,
    marker_cm_id: user.id,
    now,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  // Fetch the produced row to return a normalized concept in the response.
  const { data, error: fetchError } = await supabase
    .from('customer_concepts')
    .select(STUDIO_CUSTOMER_CONCEPT_SELECT)
    .eq('id', conceptId)
    .eq('customer_profile_id', customerId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Concept assignment not found' }, { status: 404 });
  }

  await logInteraction({
    type: 'customer_updated' as any,
    cmProfileId: user.id,
    customerId,
    metadata: { concept_id: conceptId, action: 'mark_produced' },
    client: supabase,
  });

  return NextResponse.json({
    success: true,
    concept: normalizeStudioCustomerConcept(data),
    letrend_shifted: result.letrend_shifted,
    imported_shifted: result.imported_shifted,
  });
}, ['admin', 'content_manager']);
