import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { buildCustomerConceptListItem } from '@/lib/customer-concept-detail';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

/**
 * GET /api/customer/concepts
 *
 * Returns translated concept metadata for the currently logged-in customer's
 * assignments. Each item has explicit `assignment`, `placement`, `result`, and
 * `metadata` boundary sections alongside backward-compatible flat aliases.
 *
 * The `metadata` section (title, summary, script, why_it_fits, filming_guidance,
 * production_checklist, tags) matches the shape of CustomerConceptDetailResponse.metadata.
 *
 * Projection is delegated to buildCustomerConceptListItem() so the shape stays
 * aligned with the detail route (GET /api/customer/concepts/[conceptId]).
 */
export const GET = withAuth(async (_request, user) => {
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
    return NextResponse.json({ concepts: [] });
  }

  const { data: rows, error } = await supabase
    .from('customer_concepts')
    .select(`
      id,
      concept_id,
      content_overrides,
      match_percentage,
      status,
      tags,
      cm_note,
      feed_order,
      added_at,
      sent_at,
      produced_at,
      published_at,
      tiktok_url,
      concepts (
        id,
        backend_data,
        overrides,
        is_active,
        source
      )
    `)
    .eq('customer_profile_id', customerProfileId)
    .neq('status', 'archived')
    .order('feed_order', { ascending: true, nullsFirst: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const concepts = (rows ?? []).map((row) => buildCustomerConceptListItem(row));

  return NextResponse.json({ concepts });
}, ['customer', 'admin', 'content_manager']);
