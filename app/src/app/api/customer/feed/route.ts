import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

/**
 * GET /api/customer/feed
 *
 * Returns the feed plan for the currently logged-in customer.
 * Fetches customer_concepts with feed_order != null, sorted by feed_order ASC.
 * Returns merged base concept data + customer-specific overrides.
 */
export const GET = withAuth(async (_request, user) => {
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
    return NextResponse.json({ slots: [] });
  }

  // Fetch assigned concepts with feed_order, sorted by feed_order
  const { data: rows, error } = await supabase
    .from('customer_concepts')
    .select(`
      id,
      concept_id,
      custom_headline,
      custom_description,
      custom_script,
      custom_why_it_works,
      custom_production_notes,
      match_percentage,
      status,
      feed_order,
      added_at,
      sent_at,
      produced_at,
      planned_publish_at,
      published_at,
      tiktok_url,
      tiktok_thumbnail_url,
      tiktok_views,
      cm_note,
      concepts (
        id,
        backend_data,
        overrides,
        is_active
      )
    `)
    .eq('customer_profile_id', customerProfileId)
    .neq('status', 'archived')
    .not('feed_order', 'is', null)
    .order('feed_order', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const slots = (rows ?? []).map((row) => {
    const base = row.concepts as unknown as Record<string, unknown> | null;
    const backendData = (base?.backend_data ?? {}) as Record<string, unknown>;
    const baseOverrides = (base?.overrides ?? {}) as Record<string, unknown>;

    return {
      id: row.concept_id,
      customer_concept_id: row.id,
      feed_order: row.feed_order,
      headline_sv: row.custom_headline ?? (baseOverrides.headline_sv as string) ?? null,
      description_sv: row.custom_description ?? (baseOverrides.description_sv as string) ?? null,
      script_sv: row.custom_script ?? (baseOverrides.script_sv as string) ?? null,
      why_it_works_sv: row.custom_why_it_works ?? (baseOverrides.whyItWorks_sv as string) ?? null,
      production_notes_sv:
        row.custom_production_notes ??
        (baseOverrides.productionNotes_sv as string[] | null) ??
        null,
      match_percentage: row.match_percentage ?? (baseOverrides.matchPercentage as number) ?? 85,
      source_url: (backendData.url as string) ?? null,
      status: row.status,
      added_at: row.added_at,
      sent_at: row.sent_at,
      produced_at: row.produced_at,
      planned_publish_at: row.planned_publish_at,
      published_at: row.published_at,
      tiktok_url: row.tiktok_url,
      tiktok_thumbnail_url: row.tiktok_thumbnail_url,
      tiktok_views: row.tiktok_views,
      cm_note: row.cm_note,
    };
  });

  return NextResponse.json({ slots });
}, ['customer', 'admin', 'content_manager']);
