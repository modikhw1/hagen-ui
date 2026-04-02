import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { buildCustomerConceptDetailResponse } from '@/lib/customer-concept-detail';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

/**
 * GET /api/customer/concepts/[conceptId]
 *
 * Returns a small customer-facing detail contract for the logged-in customer's
 * assigned concept. The route resolves strictly by assignment id so customer
 * surfaces stay assignment-first and do not fall back to source concepts.
 */
export const GET = withAuth(
  async (_request, user, { params }: { params: Promise<{ conceptId: string }> }) => {
    const { conceptId: customerConceptId } = await params;
    const supabase = createSupabaseAdmin();

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('matching_data')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const customerProfileId = (profile.matching_data as Record<string, unknown>)
      ?.customer_profile_id as string | undefined;

    if (!customerProfileId) {
      return NextResponse.json({ error: 'Customer profile not found' }, { status: 404 });
    }

    const selectClause = `
      id,
      concept_id,
      custom_headline,
      custom_description,
      custom_why_it_works,
      custom_instructions,
      custom_script,
      custom_production_notes,
      content_overrides,
      why_it_fits,
      filming_instructions,
      match_percentage,
      status,
      tags,
      cm_note,
      notes,
      tiktok_url,
      feed_order,
      added_at,
      sent_at,
      produced_at,
      published_at,
      concepts (
        id,
        backend_data,
        overrides,
        is_active,
        source
      )
    `;

    const { data: row, error } = await supabase
      .from('customer_concepts')
      .select(selectClause)
      .eq('customer_profile_id', customerProfileId)
      .eq('id', customerConceptId)
      .neq('status', 'archived')
      .maybeSingle();

    if (error || !row) {
      return NextResponse.json(
        { error: 'Concept not assigned to customer' },
        { status: 404 }
      );
    }

    return NextResponse.json(buildCustomerConceptDetailResponse(row));
  },
  ['customer', 'admin', 'content_manager']
);
