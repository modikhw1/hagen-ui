import { NextResponse } from 'next/server';
import type { TablesUpdate } from '@/types/database';
import { withAuth } from '@/lib/auth/api-auth';
import { resolveCustomerConceptAssignmentNote } from '@/lib/customer-concept-assignment';
import {
  serializeCustomerConceptAssignmentStatus,
} from '@/lib/customer-concept-lifecycle';
import {
  mergeCustomerConceptContentOverrides,
} from '@/lib/customer-concept-overrides';
import { asJsonObject } from '@/lib/database/json';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { normalizeStudioCustomerConcept } from '@/lib/studio/customer-concepts';

export const PATCH = withAuth(async (request, _user, { params }: { params: Promise<{ conceptId: string }> }) => {
  const { conceptId } = await params;
  const body = await request.json();
  const supabase = createSupabaseAdmin();
  const { data: existing, error: existingError } = await supabase
    .from('customer_concepts')
    .select('id, status, sent_at, content_overrides')
    .eq('id', conceptId)
    .single();

  if (existingError || !existing) {
    return NextResponse.json(
      { error: existingError?.message || 'Concept not found' },
      { status: existingError?.code === 'PGRST116' ? 404 : 500 }
    );
  }

  const safeBody = (body as Record<string, unknown>) ?? {};
  const hasOwnKey = (key: string) => Object.prototype.hasOwnProperty.call(safeBody, key);

  // content boundary — merged overrides
  const mergedContentOverrides = mergeCustomerConceptContentOverrides(
    { content_overrides: existing.content_overrides },
    safeBody
  );

  // assignment boundary — status and note
  const assignmentNotePatched = hasOwnKey('cm_note');
  const nextAssignmentStatus = serializeCustomerConceptAssignmentStatus(body?.status);
  const nextAssignmentNote = assignmentNotePatched
    ? resolveCustomerConceptAssignmentNote({ cm_note: body?.cm_note })
    : undefined;

  // markers boundary — sent_at (share marker)
  const nextSentAt = hasOwnKey('sent_at')
    ? body.sent_at
    : nextAssignmentStatus === 'sent'
      ? (existing.sent_at ?? new Date().toISOString())
      : undefined;

  // Explicit boundary-organized update payload — no free body passthrough.
  // Each field is intentionally mapped to a boundary: content, assignment,
  // markers, or placement. Stray request body fields are not written.
  const updates: TablesUpdate<'customer_concepts'> = {
    content_overrides: asJsonObject(mergedContentOverrides),
    updated_at: new Date().toISOString(),
  };

  if (nextAssignmentStatus !== undefined) {
    updates.status = nextAssignmentStatus;
  }

  if (assignmentNotePatched) {
    updates.cm_note = nextAssignmentNote ?? null;
  }

  if (nextSentAt === null || typeof nextSentAt === 'string') {
    updates.sent_at = nextSentAt;
  }

  if (hasOwnKey('tags')) {
    updates.tags = Array.isArray(safeBody.tags)
      ? safeBody.tags.filter((tag): tag is string => typeof tag === 'string')
      : null;
  }

  if (hasOwnKey('collection_id')) {
    updates.collection_id =
      typeof safeBody.collection_id === 'string' ? safeBody.collection_id : null;
  }

  if (hasOwnKey('feed_order')) {
    updates.feed_order =
      typeof safeBody.feed_order === 'number' && Number.isFinite(safeBody.feed_order)
        ? safeBody.feed_order
        : null;
  }

  if (hasOwnKey('planned_publish_at')) {
    updates.planned_publish_at =
      typeof safeBody.planned_publish_at === 'string' ? safeBody.planned_publish_at : null;
  }

  const { data, error } = await supabase
    .from('customer_concepts')
    .update(updates)
    .eq('id', conceptId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ concept: normalizeStudioCustomerConcept(data as Record<string, unknown>) });
}, ['admin', 'content_manager']);
