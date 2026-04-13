import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { normalizeStudioCustomerConcept } from '@/lib/studio/customer-concepts';

const HISTORY_RECONCILIATION_SELECT = `
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
`;

export const POST = withAuth(async (request, user) => {
  const body = await request.json().catch(() => ({}));
  const supabase = createSupabaseAdmin();
  const historyConceptId =
    typeof body?.history_concept_id === 'string' ? body.history_concept_id.trim() : '';
  const mode = body?.mode === 'use_now_slot' ? 'use_now_slot' : 'manual';
  const linkedCustomerConceptId =
    typeof body?.linked_customer_concept_id === 'string'
      ? body.linked_customer_concept_id.trim()
      : '';

  if (!historyConceptId) {
    return NextResponse.json({ error: 'history_concept_id is required' }, { status: 400 });
  }

  if (mode !== 'use_now_slot' && !linkedCustomerConceptId) {
    return NextResponse.json({ error: 'linked_customer_concept_id is required' }, { status: 400 });
  }

  const { data: historyRow, error: historyError } = await supabase
    .from('customer_concepts')
    .select('id, customer_profile_id, concept_id')
    .eq('id', historyConceptId)
    .maybeSingle();

  if (historyError) {
    return NextResponse.json({ error: historyError.message }, { status: 500 });
  }

  if (!historyRow) {
    return NextResponse.json({ error: 'Imported history row not found' }, { status: 404 });
  }

  if (historyRow.concept_id) {
    return NextResponse.json(
      { error: 'Only imported TikTok history can be reconciled' },
      { status: 409 }
    );
  }

  const { data: linkedRow, error: linkedError } = mode === 'use_now_slot'
    ? await supabase
        .from('customer_concepts')
        .select('id, customer_profile_id, concept_id')
        .eq('customer_profile_id', historyRow.customer_profile_id)
        .eq('feed_order', 0)
        .not('concept_id', 'is', null)
        .maybeSingle()
    : await supabase
        .from('customer_concepts')
        .select('id, customer_profile_id, concept_id')
        .eq('id', linkedCustomerConceptId)
        .maybeSingle();

  if (linkedError) {
    return NextResponse.json({ error: linkedError.message }, { status: 500 });
  }

  if (!linkedRow) {
    return NextResponse.json(
      {
        error:
          mode === 'use_now_slot'
            ? 'No active now-slot LeTrend concept found'
            : 'LeTrend concept row not found',
      },
      { status: mode === 'use_now_slot' ? 409 : 404 }
    );
  }

  if (!linkedRow.concept_id) {
    return NextResponse.json(
      { error: 'Linked row must be a LeTrend-managed concept assignment' },
      { status: 409 }
    );
  }

  if (linkedRow.customer_profile_id !== historyRow.customer_profile_id) {
    return NextResponse.json(
      { error: 'History row and linked concept must belong to the same customer' },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from('customer_concepts')
    .update({
      reconciled_customer_concept_id: linkedRow.id,
      reconciled_by_cm_id: user.id,
      reconciled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', historyConceptId)
    .select(HISTORY_RECONCILIATION_SELECT)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    concept: normalizeStudioCustomerConcept(data as Record<string, unknown>),
  });
}, ['admin', 'content_manager']);

export const DELETE = withAuth(async (request) => {
  const body = await request.json().catch(() => ({}));
  const supabase = createSupabaseAdmin();
  const historyConceptId =
    typeof body?.history_concept_id === 'string' ? body.history_concept_id.trim() : '';

  if (!historyConceptId) {
    return NextResponse.json({ error: 'history_concept_id is required' }, { status: 400 });
  }

  const { data: existing, error: existingError } = await supabase
    .from('customer_concepts')
    .select('id, concept_id')
    .eq('id', historyConceptId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if (!existing) {
    return NextResponse.json({ error: 'Imported history row not found' }, { status: 404 });
  }

  if (existing.concept_id) {
    return NextResponse.json(
      { error: 'Only imported TikTok history can be unreconciled' },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from('customer_concepts')
    .update({
      reconciled_customer_concept_id: null,
      reconciled_by_cm_id: null,
      reconciled_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', historyConceptId)
    .select(HISTORY_RECONCILIATION_SELECT)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    concept: normalizeStudioCustomerConcept(data as Record<string, unknown>),
  });
}, ['admin', 'content_manager']);
