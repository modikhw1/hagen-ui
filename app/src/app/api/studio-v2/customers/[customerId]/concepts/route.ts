import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { normalizeStudioCustomerConcept } from '@/lib/studio/customer-concepts';

export const GET = withAuth(async (_request, _user, { params }: { params: Promise<{ customerId: string }> }) => {
  const { customerId } = await params;
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('customer_concepts')
    .select('*')
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

  const insertPayload = {
    customer_profile_id: customerId,
    customer_id: customerId,
    concept_id: conceptId,
    cm_id: user.id,
    status: 'draft',
    feed_order: null,
    tags: [],
    content_overrides: {},
  };

  const { data, error } = await supabase
    .from('customer_concepts')
    .insert(insertPayload)
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
