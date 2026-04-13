import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { buildAssignmentInsertPayload } from '@/lib/customer-concept-assignment';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { normalizeStudioCustomerConcept } from '@/lib/studio/customer-concepts';

export const GET = withAuth(async (_request, _user, { params }: { params: Promise<{ customerId: string }> }) => {
  const { customerId } = await params;
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('customer_concepts')
    .select(`
      id,
      customer_profile_id,
      customer_id,
      concept_id,
      status,
      content_overrides,
      cm_id,
      cm_note,
      match_percentage,
      feed_order,
      tags,
      collection_id,
      added_at,
      sent_at,
      produced_at,
      planned_publish_at,
      content_loaded_at,
      content_loaded_seen_at,
      published_at,
      reconciled_customer_concept_id,
      reconciled_by_cm_id,
      reconciled_at,
      tiktok_url,
      tiktok_thumbnail_url,
      tiktok_views,
      tiktok_likes,
      tiktok_comments,
      tiktok_watch_time_seconds,
      tiktok_last_synced_at
    `)
    .eq('customer_profile_id', customerId)
    .order('added_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rawData = data || [];

  // ── Build a lookup: letrend_concept_id → reconciled imported row ──────────
  // Used to inject live TikTok stats (views, likes, thumbnail) from the
  // imported clip into the LeTrend history card at read-time. This keeps stats
  // fresh — cron refreshes the imported row; LeTrend card always reflects it.
  const reconciledByTarget = new Map<string, typeof rawData[number]>();
  for (const row of rawData) {
    if (!row.concept_id && row.reconciled_customer_concept_id) {
      reconciledByTarget.set(row.reconciled_customer_concept_id, row);
    }
  }

  // ── Filter + enrich ────────────────────────────────────────────────────────
  // • LeTrend rows (concept_id IS NOT NULL): always kept; history rows enriched
  //   with TikTok stats from their reconciled imported sibling when available.
  // • Imported rows (concept_id IS NULL): kept only when unreconciled. Reconciled
  //   imported rows are hidden from the grid — their identity is carried by the
  //   enriched LeTrend history card instead.
  const enrichedData = rawData
    .filter((row) => {
      if (row.concept_id) return true;
      return !row.reconciled_customer_concept_id;
    })
    .map((row) => {
      if (
        row.concept_id &&
        typeof row.feed_order === 'number' &&
        row.feed_order < 0
      ) {
        const importedStats = reconciledByTarget.get(row.id as string);
        if (importedStats) {
          return {
            ...row,
            tiktok_url: importedStats.tiktok_url ?? row.tiktok_url,
            tiktok_thumbnail_url: importedStats.tiktok_thumbnail_url ?? row.tiktok_thumbnail_url,
            tiktok_views: importedStats.tiktok_views ?? row.tiktok_views,
            tiktok_likes: importedStats.tiktok_likes ?? row.tiktok_likes,
            tiktok_comments: importedStats.tiktok_comments ?? row.tiktok_comments,
            tiktok_watch_time_seconds: importedStats.tiktok_watch_time_seconds ?? row.tiktok_watch_time_seconds,
            tiktok_last_synced_at: importedStats.tiktok_last_synced_at ?? row.tiktok_last_synced_at,
          };
        }
      }
      return row;
    });

  return NextResponse.json({ concepts: enrichedData.map((row) => normalizeStudioCustomerConcept(row)) });
}, ['admin', 'content_manager']);

export const POST = withAuth(async (request, user, { params }: { params: Promise<{ customerId: string }> }) => {
  const { customerId } = await params;
  const body = await request.json().catch(() => ({}));
  const supabase = createSupabaseAdmin();
  const conceptId = typeof body?.concept_id === 'string' ? body.concept_id.trim() : '';

  if (!conceptId) {
    return NextResponse.json({ error: 'concept_id is required' }, { status: 400 });
  }

  const [{ data: customerProfile, error: customerError }, { data: concept, error: conceptError }] = await Promise.all([
    supabase
      .from('customer_profiles')
      .select('id')
      .eq('id', customerId)
      .maybeSingle(),
    supabase
      .from('concepts')
      .select('id, is_active')
      .eq('id', conceptId)
      .maybeSingle(),
  ]);

  if (customerError) {
    return NextResponse.json({ error: customerError.message }, { status: 500 });
  }

  if (!customerProfile) {
    return NextResponse.json({ error: 'Customer profile not found' }, { status: 404 });
  }

  if (conceptError) {
    return NextResponse.json({ error: conceptError.message }, { status: 500 });
  }

  if (!concept) {
    return NextResponse.json({ error: 'Concept not found' }, { status: 404 });
  }

  if (!concept.is_active) {
    return NextResponse.json(
      { error: 'Concept is not published. Publish it in the review page before assigning to customers.' },
      { status: 409 }
    );
  }

  const { data: existingAssignment, error: existingError } = await supabase
    .from('customer_concepts')
    .select('id')
    .eq('customer_profile_id', customerId)
    .eq('concept_id', conceptId)
    .neq('status', 'archived')
    .limit(1)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if (existingAssignment) {
    return NextResponse.json(
      {
        error: 'Concept already assigned to customer',
        concept: { id: existingAssignment.id },
      },
      { status: 409 }
    );
  }

  // assignment boundary write: creates a new assignment row with identity
  // fields only; content/placement/result/markers start empty
  const { data, error } = await supabase
    .from('customer_concepts')
    .insert(buildAssignmentInsertPayload({
      customerId,
      sourceConceptId: conceptId,
      cmId: user.id,
    }))
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { concept: normalizeStudioCustomerConcept(data) },
    { status: 201 }
  );
}, ['admin', 'content_manager']);

export const DELETE = withAuth(async (request, _user, { params }: { params: Promise<{ customerId: string }> }) => {
  const { customerId } = await params;
  const conceptId = new URL(request.url).searchParams.get('concept_id');
  if (!conceptId) {
    return NextResponse.json({ error: 'concept_id is required' }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from('customer_concepts')
    .delete()
    .eq('id', conceptId)
    .eq('customer_profile_id', customerId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}, ['admin', 'content_manager']);
