import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import {
  getCustomerConceptAssignmentLabel,
  getCustomerConceptPlacementBucket,
  getCustomerConceptPlacementLabel,
  getCustomerConceptResultLabel,
  normalizeCustomerConceptAssignmentStatus,
} from '@/lib/customer-concept-lifecycle';
import { resolveCustomerConceptContentOverrides } from '@/lib/customer-concept-overrides';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { translateClipToConcept } from '@/lib/translator';
import type { BackendClip, ClipOverride } from '@/lib/translator';

/**
 * GET /api/customer/concepts
 *
 * Returns translated concept metadata for the currently logged-in customer's
 * assignments. The nested `assignment` payload is the explicit assignment-level
 * contract; legacy top-level aliases are kept for compatibility.
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
      custom_headline,
      custom_description,
      custom_why_it_works,
      custom_instructions,
      custom_target_audience,
      custom_script,
      custom_production_notes,
      why_it_fits,
      filming_instructions,
      match_percentage,
      status,
      notes,
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

  const concepts = (rows ?? []).map((row) => {
    const base = row.concepts as unknown as {
      backend_data: BackendClip;
      overrides: ClipOverride;
    } | null;

    const backendData: BackendClip = (base?.backend_data ?? { id: row.concept_id, url: '' }) as BackendClip;
    const baseOverrides: ClipOverride = (base?.overrides ?? {}) as ClipOverride;
    const contentOverrides = resolveCustomerConceptContentOverrides(row);
    const assignmentStatus = normalizeCustomerConceptAssignmentStatus(row.status);

    const mergedOverride: ClipOverride = {
      ...baseOverrides,
      ...(contentOverrides.headline ? { headline_sv: contentOverrides.headline } : {}),
      ...(contentOverrides.summary ? { description_sv: contentOverrides.summary } : {}),
      ...(contentOverrides.why_it_fits ? { whyItWorks_sv: contentOverrides.why_it_fits } : {}),
      ...(contentOverrides.script ? { script_sv: contentOverrides.script } : {}),
      ...(row.custom_production_notes ? { productionNotes_sv: row.custom_production_notes } : {}),
      ...(row.match_percentage != null ? { matchPercentage: row.match_percentage } : {}),
    };

    const translated = translateClipToConcept(backendData, mergedOverride);

    return {
      ...translated,
      assignment: {
        id: row.id,
        source_concept_id: row.concept_id,
        status: assignmentStatus,
        lifecycle_label: assignmentStatus ? getCustomerConceptAssignmentLabel(assignmentStatus) : null,
        placement_bucket: getCustomerConceptPlacementBucket(row.feed_order),
        placement_label: getCustomerConceptPlacementLabel(row.feed_order),
        feed_order: row.feed_order,
        cm_note: row.notes,
        added_at: row.added_at,
      },
      customer_concept_id: row.id,
      source_concept_id: row.concept_id,
      status: assignmentStatus,
      result_label: getCustomerConceptResultLabel({
        rawStatus: row.status,
        producedAt: row.produced_at,
        publishedAt: row.published_at,
        publishedClipUrl: row.tiktok_url,
      }),
      feed_order: row.feed_order,
      cm_note: row.notes,
      added_at: row.added_at,
      content_overrides: Object.keys(contentOverrides).length > 0 ? contentOverrides : null,
      why_it_fits: contentOverrides.why_it_fits ?? null,
      filming_instructions: contentOverrides.filming_instructions ?? null,
      custom_instructions: contentOverrides.filming_instructions ?? null,
      custom_target_audience: contentOverrides.target_audience ?? null,
    };
  });

  return NextResponse.json({ concepts });
}, ['customer', 'admin', 'content_manager']);
