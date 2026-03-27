import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export const PATCH = withAuth(async (_request, _user, { params }: { params: Promise<{ jobId: string }> }) => {
  const { jobId } = await params;
  const supabase = createSupabaseAdmin();

  const { data, error } = await supabase
    .from('email_jobs')
    .update({
      status: 'queued',
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ job: data });
}, ['admin', 'content_manager']);
