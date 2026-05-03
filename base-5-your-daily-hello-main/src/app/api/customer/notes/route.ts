import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { resolveCustomerConceptContentOverrides } from '@/lib/customer-concept-overrides';
import { asJsonObject } from '@/lib/database/json';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { translateClipToConcept, type BackendClip, type ClipOverride } from '@/lib/translator';
import type { Json } from '@/types/database';
import type { CustomerNoteAttachment, CustomerNoteItem, CustomerNoteReference } from '@/types/customer-notes';

type CustomerNoteRow = {
  id: string;
  customer_id: string;
  cm_id: string;
  content: string;
  content_html: string | null;
  note_type: string;
  primary_customer_concept_id: string | null;
  references: unknown;
  attachments: unknown;
  created_at: string | null;
  updated_at: string | null;
};

type ConceptLookupRow = {
  id: string;
  concept_id: string;
  content_overrides: Json | null;
  concepts:
    | {
        backend_data?: Json | null;
        overrides?: Json | null;
      }
    | Array<{
        backend_data?: Json | null;
        overrides?: Json | null;
      }>
    | null;
};

export const GET = withAuth(async (request: NextRequest, user) => {
  const supabase = createSupabaseAdmin();
  const { searchParams } = new URL(request.url);
  const requestedLimit = Number.parseInt(searchParams.get('limit') || '5', 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 20)
    : 5;

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
    return NextResponse.json({ notes: [] });
  }

  const { data, error } = await supabase
    .from('customer_notes')
    .select('id, customer_id, cm_id, content, content_html, note_type, primary_customer_concept_id, references, attachments, created_at, updated_at')
    .eq('customer_id', customerProfileId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const noteRows = (data || []) as CustomerNoteRow[];
  const conceptIds = Array.from(
    new Set(
      noteRows
        .map((note) => note.primary_customer_concept_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  const conceptContextById = new Map<string, CustomerNoteItem['concept_context']>();

  if (conceptIds.length > 0) {
    const { data: conceptRows } = await supabase
      .from('customer_concepts')
      .select(`
        id,
        concept_id,
        content_overrides,
        concepts (
          backend_data,
          overrides
        )
      `)
      .eq('customer_profile_id', customerProfileId)
      .in('id', conceptIds);

    for (const row of (conceptRows || []) as ConceptLookupRow[]) {
      const conceptRelation = Array.isArray(row.concepts) ? row.concepts[0] : row.concepts;
      const rawBackendData = asJsonObject(conceptRelation?.backend_data);
      const backendData: BackendClip = {
        ...(rawBackendData as unknown as BackendClip),
        id: typeof rawBackendData.id === 'string' ? rawBackendData.id : row.concept_id,
        url: typeof rawBackendData.url === 'string' ? rawBackendData.url : '',
      };
      const translated = translateClipToConcept(
        backendData,
        (asJsonObject(conceptRelation?.overrides) as ClipOverride)
      );
      const overrides = resolveCustomerConceptContentOverrides(row);
      const title =
        overrides.headline ??
        translated.headline_sv ??
        translated.headline ??
        'Koncept';

      conceptContextById.set(row.id, {
        customerConceptId: row.id,
        conceptId: row.concept_id ?? null,
        title,
        href: `/concept/${row.id}`,
        mobileHref: `/m/concept/${row.id}`,
      });
    }
  }

  const notes: CustomerNoteItem[] = noteRows.map((note) => ({
    ...note,
    note_type: normalizeNoteType(note.note_type),
    references: normalizeReferences(note.references),
    attachments: normalizeAttachments(note.attachments),
    concept_context: note.primary_customer_concept_id
      ? conceptContextById.get(note.primary_customer_concept_id) ?? null
      : null,
  }));

  return NextResponse.json({ notes });
}, ['customer', 'admin', 'content_manager']);

function normalizeNoteType(value: string): CustomerNoteItem['note_type'] {
  if (value === 'reference' || value === 'feedback' || value === 'milestone') {
    return value;
  }

  return 'update';
}

function normalizeReferences(value: unknown): CustomerNoteReference[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is CustomerNoteReference => Boolean(item && typeof item === 'object'));
}

function normalizeAttachments(value: unknown): CustomerNoteAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is CustomerNoteAttachment => Boolean(item && typeof item === 'object'));
}
