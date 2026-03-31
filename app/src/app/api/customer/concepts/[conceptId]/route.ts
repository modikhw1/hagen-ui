import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { translateClipToConcept } from '@/lib/translator';
import type { BackendClip, ClipOverride } from '@/lib/translator';

/**
 * GET /api/customer/concepts/[conceptId]
 *
 * Returns a TranslatedConcept with customer-specific overrides applied,
 * plus raw assignment metadata (status, feed_order, cm_note).
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

    // Helper: translate a raw concepts row to TranslatedConcept
    const translateBaseOnly = (concept: Record<string, unknown>) => {
      const backendData = (concept.backend_data ?? { id: conceptId, url: '' }) as BackendClip;
      const overrides = (concept.overrides ?? {}) as ClipOverride;
      return translateClipToConcept(backendData, overrides);
    };

    if (!customerProfileId) {
      // No customer profile – return base concept without customizations
      const { data: concept, error: conceptError } = await supabase
        .from('concepts')
        .select('*')
        .eq('id', conceptId)
        .eq('is_active', true)
        .single();

      if (conceptError || !concept) {
        return NextResponse.json({ error: 'Concept not found' }, { status: 404 });
      }

      return NextResponse.json({
        concept: translateBaseOnly(concept as Record<string, unknown>),
        customer_concept: null,
      });
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
          source
        )
      `)
      .eq('customer_profile_id', customerProfileId)
      .eq('concept_id', conceptId)
      .single();

    if (error || !row) {
      // Not assigned to this customer – return base concept without customizations
      const { data: concept, error: conceptError } = await supabase
        .from('concepts')
        .select('*')
        .eq('id', conceptId)
        .eq('is_active', true)
        .single();

      if (conceptError || !concept) {
        return NextResponse.json({ error: 'Concept not found' }, { status: 404 });
      }

      return NextResponse.json({
        concept: translateBaseOnly(concept as Record<string, unknown>),
        customer_concept: null,
      });
    }

    const base = row.concepts as unknown as { backend_data: BackendClip; overrides: ClipOverride } | null;
    const backendData: BackendClip = (base?.backend_data ?? { id: row.concept_id, url: '' }) as BackendClip;
    const baseOverrides: ClipOverride = (base?.overrides ?? {}) as ClipOverride;

    // Customer-specific overrides take priority
    const mergedOverride: ClipOverride = {
      ...baseOverrides,
      ...(row.custom_headline ? { headline_sv: row.custom_headline } : {}),
      ...(row.custom_description ? { description_sv: row.custom_description } : {}),
      ...(row.custom_why_it_works ? { whyItWorks_sv: row.custom_why_it_works } : {}),
      ...(row.custom_script ? { script_sv: row.custom_script } : {}),
      ...(row.custom_production_notes ? { productionNotes_sv: row.custom_production_notes } : {}),
      ...(row.match_percentage != null ? { matchPercentage: row.match_percentage } : {}),
    };

    const translated = translateClipToConcept(backendData, mergedOverride);

    return NextResponse.json({
      concept: {
        ...translated,
        customer_concept_id: row.id,
        status: row.status,
        feed_order: row.feed_order,
        cm_note: row.notes,
        added_at: row.added_at,
        custom_instructions: row.custom_instructions ?? null,
        custom_target_audience: row.custom_target_audience ?? null,
      },
      customer_concept: {
        id: row.id,
        status: row.status,
        feed_order: row.feed_order,
      },
    });
  },
  ['customer', 'admin', 'content_manager']
);
