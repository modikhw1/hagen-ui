import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { resolveCustomerConceptAssignmentNote } from '@/lib/customer-concept-assignment';
import {
  serializeCustomerConceptAssignmentStatus,
} from '@/lib/customer-concept-lifecycle';
import {
  mergeCustomerConceptContentOverrides,
} from '@/lib/customer-concept-overrides';
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
    existing as Record<string, unknown>,
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
  const updates: Record<string, unknown> = {
    // content boundary
    content_overrides: Object.keys(mergedContentOverrides).length > 0 ? mergedContentOverrides : {},
    // assignment boundary
    status: nextAssignmentStatus,
    cm_note: assignmentNotePatched ? nextAssignmentNote : undefined,
    // markers boundary
    sent_at: nextSentAt,
    ...(hasOwnKey('tags') ? { tags: safeBody.tags } : {}),
    ...(hasOwnKey('collection_id') ? { collection_id: safeBody.collection_id } : {}),
    // placement boundary
    ...(hasOwnKey('feed_order') ? { feed_order: safeBody.feed_order } : {}),
    // timestamp
    updated_at: new Date().toISOString(),
  };

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
