import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { translateClipToConcept } from '@/lib/translator';
import type { BackendClip, ClipOverride } from '@/lib/translator';

/**
 * GET /api/customer/concepts
 *
 * Returns TranslatedConcept[] for the currently logged-in customer.
 * Customer-specific overrides (custom_headline, custom_script, etc.) take
 * priority over the base concept's overrides stored in concepts.overrides.
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

  // Fetch assigned concepts with base concept data
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

  const concepts = (rows ?? []).map((row) => {
    const base = row.concepts as unknown as {
      backend_data: BackendClip;
      overrides: ClipOverride;
    } | null;

    const backendData: BackendClip = (base?.backend_data ?? { id: row.concept_id, url: '' }) as BackendClip;
    const baseOverrides: ClipOverride = (base?.overrides ?? {}) as ClipOverride;

    // Customer-specific overrides take priority over base overrides
    const mergedOverride: ClipOverride = {
      ...baseOverrides,
      ...(row.custom_headline ? { headline_sv: row.custom_headline } : {}),
      ...(row.custom_description ? { description_sv: row.custom_description } : {}),
      ...(row.custom_why_it_works ? { whyItWorks_sv: row.custom_why_it_works } : {}),
      ...(row.custom_script ? { script_sv: row.custom_script } : {}),
      ...(row.custom_production_notes ? { productionNotes_sv: row.custom_production_notes } : {}),
      ...(row.match_percentage != null ? { matchPercentage: row.match_percentage } : {}),
    };

    // Translate to TranslatedConcept using the shared translator
    const translated = translateClipToConcept(backendData, mergedOverride);

    // Attach assignment metadata
    return {
      ...translated,
      customer_concept_id: row.id,
      status: row.status,
      feed_order: row.feed_order,
      cm_note: row.notes,
      added_at: row.added_at,
      // Customer-specific extras not in TranslatedConcept
      custom_instructions: row.custom_instructions ?? null,
      custom_target_audience: row.custom_target_audience ?? null,
    };
  });

  return NextResponse.json({ concepts });
}, ['customer', 'admin', 'content_manager']);
