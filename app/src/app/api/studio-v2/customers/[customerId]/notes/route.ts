import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { normalizeCustomerNotePayload } from '@/lib/customer-notes';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export const GET = withAuth(async (_request, _user, { params }: { params: Promise<{ customerId: string }> }) => {
  const { customerId } = await params;
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('customer_notes')
    .select('id, customer_id, cm_id, content, content_html, note_type, primary_customer_concept_id, references, attachments, created_at, updated_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ notes: data || [] });
}, ['admin', 'content_manager']);

export const POST = withAuth(async (request, user, { params }: { params: Promise<{ customerId: string }> }) => {
  const { customerId } = await params;
  const body = await request.json().catch(() => ({}));
  const supabase = createSupabaseAdmin();
  const payload = normalizeCustomerNotePayload(body);

  if (!payload.content && !payload.content_html && payload.references.length === 0 && payload.attachments.length === 0) {
    return NextResponse.json({ error: 'Note content is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('customer_notes')
    .insert({
      customer_id: customerId,
      cm_id: user.id,
      content: payload.content,
      content_html: payload.content_html,
      note_type: payload.note_type,
      primary_customer_concept_id: payload.primary_customer_concept_id,
      references: payload.references,
      attachments: payload.attachments,
      updated_at: payload.updated_at,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ note: data });
}, ['admin', 'content_manager']);

export const PATCH = withAuth(async (request, _user, { params }: { params: Promise<{ customerId: string }> }) => {
  const { customerId } = await params;
  const noteId = new URL(request.url).searchParams.get('note_id');
  if (!noteId) {
    return NextResponse.json({ error: 'note_id is required' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const payload = normalizeCustomerNotePayload(body);

  if (!payload.content && !payload.content_html && payload.references.length === 0 && payload.attachments.length === 0) {
    return NextResponse.json({ error: 'Note content is required' }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('customer_notes')
    .update({
      content: payload.content,
      content_html: payload.content_html,
      note_type: payload.note_type,
      primary_customer_concept_id: payload.primary_customer_concept_id,
      references: payload.references,
      attachments: payload.attachments,
      updated_at: payload.updated_at,
    })
    .eq('id', noteId)
    .eq('customer_id', customerId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ note: data });
}, ['admin', 'content_manager']);

export const DELETE = withAuth(async (request, _user, { params }: { params: Promise<{ customerId: string }> }) => {
  const { customerId } = await params;
  const noteId = new URL(request.url).searchParams.get('note_id');
  if (!noteId) {
    return NextResponse.json({ error: 'note_id is required' }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from('customer_notes')
    .delete()
    .eq('id', noteId)
    .eq('customer_id', customerId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}, ['admin', 'content_manager']);
