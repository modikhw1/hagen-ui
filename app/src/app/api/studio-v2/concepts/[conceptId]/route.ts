import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import {
  serializeCustomerConceptAssignmentStatus,
} from '@/lib/customer-concept-lifecycle';
import {
  mergeCustomerConceptContentOverrides,
  projectLegacyOverrideColumns,
} from '@/lib/customer-concept-overrides';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { normalizeStudioCustomerConcept } from '@/lib/studio/customer-concepts';

export const PATCH = withAuth(async (request, _user, { params }: { params: Promise<{ conceptId: string }> }) => {
  const { conceptId } = await params;
  const body = await request.json();
  const supabase = createSupabaseAdmin();
  const { data: existing, error: existingError } = await supabase
    .from('customer_concepts')
    .select(`
      id,
      content_overrides,
      custom_headline,
      custom_description,
      custom_script,
      custom_why_it_works,
      custom_instructions,
      custom_target_audience,
      why_it_fits,
      filming_instructions
    `)
    .eq('id', conceptId)
    .single();

  if (existingError || !existing) {
    return NextResponse.json(
      { error: existingError?.message || 'Concept not found' },
      { status: existingError?.code === 'PGRST116' ? 404 : 500 }
    );
  }

  const mergedContentOverrides = mergeCustomerConceptContentOverrides(
    existing as Record<string, unknown>,
    (body as Record<string, unknown>) ?? {}
  );
  const updates = {
    ...body,
    ...projectLegacyOverrideColumns(mergedContentOverrides),
    content_overrides: Object.keys(mergedContentOverrides).length > 0 ? mergedContentOverrides : {},
    status: serializeCustomerConceptAssignmentStatus(body?.status),
    notes: Object.prototype.hasOwnProperty.call(body ?? {}, 'cm_note')
      ? body.cm_note
      : undefined,
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
