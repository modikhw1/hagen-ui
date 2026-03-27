import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

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

  return NextResponse.json({ brief: data?.brief || { tone: '', constraints: '', current_focus: '' } });
}, ['admin', 'content_manager']);

export const PATCH = withAuth(async (request, _user, { params }: { params: Promise<{ customerId: string }> }) => {
  const { customerId } = await params;
  const body = await request.json();
  const supabase = createSupabaseAdmin();

  const payload = body?.brief ? body.brief : {
    [body?.field]: body?.value,
  };

  const { data: existing, error: existingError } = await supabase
    .from('customer_profiles')
    .select('brief')
    .eq('id', customerId)
    .single();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const nextBrief = {
    tone: '',
    constraints: '',
    current_focus: '',
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
