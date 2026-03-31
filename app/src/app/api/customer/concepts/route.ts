import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

/**
 * GET /api/customer/concepts
 *
 * Returns concepts assigned to the currently logged-in customer.
 * Authenticates via Supabase session, resolves the customer_profile_id
 * from profiles.matching_data, then returns customer_concepts JOIN concepts
 * WHERE status != 'archived', sorted by feed_order ASC.
 */
export const GET = withAuth(async (_request, user) => {
  const supabase = createSupabaseAdmin();

  // Resolve customer_profile_id from profiles.matching_data
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

  // Fetch assigned concepts (JOIN with concepts table for base data)
  const { data: rows, error } = await supabase
    .from('customer_concepts')
    .select(`
      id,
      concept_id,
      custom_headline,
      custom_description,
      custom_why_it_works,
      custom_instructions,
      custom_target_audience,
      custom_script,
      custom_production_notes,
      match_percentage,
      status,
      notes,
      feed_order,
      added_at,
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

  // Merge customer-specific overrides on top of base concept data
  const concepts = (rows ?? []).map((row) => {
    const base = row.concepts as unknown as Record<string, unknown> | null;
    const backendData = (base?.backend_data ?? {}) as Record<string, unknown>;
    const baseOverrides = (base?.overrides ?? {}) as Record<string, unknown>;

    return {
      id: row.concept_id,
      customer_concept_id: row.id,
      // Base concept data
      source_url: (backendData.url as string) ?? null,
      // Overrides: customer-specific takes priority, then base overrides
      headline_sv: row.custom_headline ?? (baseOverrides.headline_sv as string) ?? null,
      description_sv: row.custom_description ?? (baseOverrides.description_sv as string) ?? null,
      why_it_works_sv: row.custom_why_it_works ?? (baseOverrides.whyItWorks_sv as string) ?? null,
      script_sv: row.custom_script ?? (baseOverrides.script_sv as string) ?? null,
      production_notes_sv:
        row.custom_production_notes ??
        (baseOverrides.productionNotes_sv as string[] | null) ??
        null,
      why_it_fits_sv: baseOverrides.whyItFits_sv ?? null,
      match_percentage: row.match_percentage ?? (baseOverrides.matchPercentage as number) ?? 85,
      is_new: (baseOverrides.isNew as boolean) ?? false,
      // Customer assignment fields
      status: row.status,
      feed_order: row.feed_order,
      notes: row.notes,
      added_at: row.added_at,
      // Full backend data for further processing
      backend_data: backendData,
      overrides: baseOverrides,
    };
  });

  return NextResponse.json({ concepts });
}, ['customer', 'admin', 'content_manager']);
