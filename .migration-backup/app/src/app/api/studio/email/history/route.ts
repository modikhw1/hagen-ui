import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

/**
 * GET /api/studio/email/history
 * Legacy compatibility endpoint backed by email_jobs.
 */
export const GET = withAuth(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customer_id');
    const rawLimit = Number(searchParams.get('limit') || '20');
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(50, rawLimit)) : 20;
    const supabase = createSupabaseAdmin();

    let query = supabase
      .from('email_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (customerId) {
      query = query.eq('customer_id', customerId);
    }

    const { data: jobs, error } = await query;

    if (error) {
      throw error;
    }

    const history = (jobs || []).map((job) => ({
      id: job.id,
      customer_id: job.customer_id,
      cm_id: job.cm_id,
      subject: job.subject,
      body_html: job.body_html,
      concept_ids: job.concept_ids || [],
      sent_at: job.sent_at || job.updated_at || job.created_at,
      status: job.status,
      recipient_email: job.recipient_email,
    }));

    return NextResponse.json(
      { history, jobs: jobs || [], deprecated: true },
      { headers: { 'x-letrend-deprecated': 'Use /api/studio-v2/email/jobs' } }
    );
  } catch (error: unknown) {
    console.error('[history] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load email history' },
      { status: 500 }
    );
  }
}, ['admin', 'content_manager']);
