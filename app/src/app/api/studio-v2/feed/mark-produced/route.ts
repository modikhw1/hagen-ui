import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { serializeCustomerConceptAssignmentStatus } from '@/lib/customer-concept-lifecycle';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { normalizeStudioCustomerConcept } from '@/lib/studio/customer-concepts';

export const POST = withAuth(async (request) => {
  const body = await request.json().catch(() => ({}));
  const supabase = createSupabaseAdmin();
  const conceptId = typeof body?.concept_id === 'string' ? body.concept_id.trim() : '';
  const customerId = typeof body?.customer_id === 'string' ? body.customer_id.trim() : '';
  const now = new Date().toISOString();

  if (!conceptId) {
    return NextResponse.json({ error: 'concept_id is required' }, { status: 400 });
  }

  if (!customerId) {
    return NextResponse.json({ error: 'customer_id is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('customer_concepts')
    .update({
      status: serializeCustomerConceptAssignmentStatus('produced'),
      produced_at: now,
      published_at: body?.tiktok_url ? now : null,
      tiktok_url: body?.tiktok_url || null,
      feed_order: null,
    })
    .eq('id', conceptId)
    .eq('customer_profile_id', customerId)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Concept assignment not found' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    concept: normalizeStudioCustomerConcept(data),
  });
}, ['admin', 'content_manager']);
