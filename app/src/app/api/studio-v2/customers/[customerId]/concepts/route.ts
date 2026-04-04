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

  return NextResponse.json({ concepts: (data || []).map((row) => normalizeStudioCustomerConcept(row)) });
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
