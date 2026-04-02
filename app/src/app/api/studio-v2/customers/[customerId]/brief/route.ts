import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

const EMPTY_BRIEF = { tone: '', constraints: '', current_focus: '' };

function extractBriefPatch(body: Record<string, unknown>) {
  const directKeys = ['tone', 'constraints', 'current_focus'] as const;
  const briefSource = body.brief && typeof body.brief === 'object' && !Array.isArray(body.brief)
    ? body.brief as Record<string, unknown>
    : body;

  const patch = Object.fromEntries(
    directKeys.flatMap((key) => {
      const value = briefSource[key];
      if (typeof value !== 'string') {
        return [];
      }

      return [[key, value]];
    })
  );

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

  return NextResponse.json({ brief: data?.brief || EMPTY_BRIEF });
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
    ...EMPTY_BRIEF,
    ...(existing?.brief || {}),
    ...(payload || {}),
  };

  const { error } = await supabase
    .from('customer_profiles')
    .update({ brief: nextBrief })
    .eq('id', customerId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ brief: nextBrief });
}, ['admin', 'content_manager']);
