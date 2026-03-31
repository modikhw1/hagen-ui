import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

/**
 * GET /api/customer/concepts/[conceptId]
 *
 * Returns merged concept data (base concept + customer-specific overrides)
 * for the currently logged-in customer.
 */
export const GET = withAuth(
  async (_request, user, { params }: { params: Promise<{ conceptId: string }> }) => {
    const { conceptId } = await params;
    const supabase = createSupabaseAdmin();

    // Resolve customer_profile_id
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
      // No customer profile linked – return base concept only
      const { data: concept, error: conceptError } = await supabase
        .from('concepts')
        .select('*')
        .eq('id', conceptId)
        .eq('is_active', true)
        .single();

      if (conceptError || !concept) {
        return NextResponse.json({ error: 'Concept not found' }, { status: 404 });
      }

      return NextResponse.json({ concept, customer_concept: null });
    }

    // Fetch customer_concept JOIN concept
    const { data: row, error } = await supabase
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
          source,
          created_at,
          updated_at,
          version
        )
      `)
      .eq('customer_profile_id', customerProfileId)
      .eq('concept_id', conceptId)
      .single();

    if (error || !row) {
      // Concept not assigned to this customer – try returning base concept
      const { data: concept, error: conceptError } = await supabase
        .from('concepts')
        .select('*')
        .eq('id', conceptId)
        .eq('is_active', true)
        .single();

      if (conceptError || !concept) {
        return NextResponse.json({ error: 'Concept not found' }, { status: 404 });
      }

      return NextResponse.json({ concept, customer_concept: null });
    }

    const base = row.concepts as unknown as Record<string, unknown> | null;
    const backendData = (base?.backend_data ?? {}) as Record<string, unknown>;
    const baseOverrides = (base?.overrides ?? {}) as Record<string, unknown>;

    // Merged concept: customer-specific fields override base overrides
    const merged = {
      id: row.concept_id,
      customer_concept_id: row.id,
      source_url: (backendData.url as string) ?? null,
      headline_sv: row.custom_headline ?? (baseOverrides.headline_sv as string) ?? null,
      description_sv: row.custom_description ?? (baseOverrides.description_sv as string) ?? null,
      why_it_works_sv:
        row.custom_why_it_works ?? (baseOverrides.whyItWorks_sv as string) ?? null,
      script_sv: row.custom_script ?? (baseOverrides.script_sv as string) ?? null,
      production_notes_sv:
        row.custom_production_notes ??
        (baseOverrides.productionNotes_sv as string[] | null) ??
        null,
      why_it_fits_sv: baseOverrides.whyItFits_sv ?? null,
      target_audience:
        row.custom_target_audience ?? (backendData.humor_analysis as Record<string, unknown>)?.target_audience ?? null,
      match_percentage: row.match_percentage ?? (baseOverrides.matchPercentage as number) ?? 85,
      is_new: (baseOverrides.isNew as boolean) ?? false,
      status: row.status,
      feed_order: row.feed_order,
      notes: row.notes,
      added_at: row.added_at,
      backend_data: backendData,
      overrides: baseOverrides,
    };

    return NextResponse.json({ concept: merged, customer_concept: row });
  },
  ['customer', 'admin', 'content_manager']
);
