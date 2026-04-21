import { NextResponse } from 'next/server';
import type { TablesUpdate } from '@/types/database';
import { withAuth } from '@/lib/auth/api-auth';
import { EMPTY_CUSTOMER_BRIEF, normalizeCustomerBrief } from '@/lib/database/json';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

function extractBriefPatch(body: Record<string, unknown>) {
  const directKeys = ['tone', 'constraints', 'current_focus'] as const;
  const briefSource = body.brief && typeof body.brief === 'object' && !Array.isArray(body.brief)
    ? body.brief as Record<string, unknown>
    : body;

  const patch: Record<string, unknown> = Object.fromEntries(
    directKeys.flatMap((key) => {
      const value = briefSource[key];
      if (typeof value !== 'string') {
        return [];
      }

      return [[key, value]];
    })
  );

  // posting_weekdays: array of 0-based day indices (0=Mon…6=Sun) or null to clear
  if ('posting_weekdays' in briefSource) {
    const val = briefSource.posting_weekdays;
    if (val === null || (Array.isArray(val) && val.every((n) => typeof n === 'number'))) {
      patch.posting_weekdays = val;
    }
  }

  if (Object.keys(patch).length > 0) {
    return patch;
  }

  if (typeof body.field === 'string') {
    const field = body.field;
    if (directKeys.includes(field as typeof directKeys[number]) && typeof body.value === 'string') {
      return { [field]: body.value };
    }
  }

  return null;
}

export const GET = withAuth(async (_request, _user, { params }: { params: Promise<{ customerId: string }> }) => {
  const { customerId } = await params;
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from('customer_profiles')
    .select('brief')
    .eq('id', customerId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ brief: normalizeCustomerBrief(data?.brief) });
}, ['admin', 'content_manager']);

export const PATCH = withAuth(async (request, _user, { params }: { params: Promise<{ customerId: string }> }) => {
  const { customerId } = await params;
  const body = await request.json().catch(() => ({}));
  const supabase = createSupabaseAdmin();
  const payload = extractBriefPatch(body as Record<string, unknown>);

  if (!payload) {
    return NextResponse.json(
      { error: 'Provide tone, constraints, current_focus or a brief object' },
      { status: 400 }
    );
  }

  const { data: existing, error: existingError } = await supabase
    .from('customer_profiles')
    .select('brief')
    .eq('id', customerId)
    .single();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const nextBrief = {
    ...EMPTY_CUSTOMER_BRIEF,
    ...normalizeCustomerBrief(existing?.brief),
    ...(payload || {}),
  };

  const { error } = await supabase
    .from('customer_profiles')
    .update({ brief: nextBrief } satisfies TablesUpdate<'customer_profiles'>)
    .eq('id', customerId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ brief: nextBrief });
}, ['admin', 'content_manager']);
