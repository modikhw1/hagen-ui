import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const from = process.env.RESEND_FROM_EMAIL || 'LeTrend <hej@letrend.se>';

export const POST = withAuth(async (request, user) => {
  const body = await request.json();
  const customerId = body?.customer_id;
  const subject = body?.subject;
  const html = body?.body_html;
  const conceptIds = Array.isArray(body?.concept_ids) ? body.concept_ids : [];

  if (!customerId || !subject || !html) {
    return NextResponse.json({ error: 'customer_id, subject and body_html are required' }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const { data: customer, error: customerError } = await supabase
    .from('customer_profiles')
    .select('contact_email')
    .eq('id', customerId)
    .single();

  if (customerError || !customer?.contact_email) {
    return NextResponse.json({ error: customerError?.message || 'Customer email missing' }, { status: 500 });
  }

  let status = 'queued';
  let providerMessageId: string | null = null;
  let warning: string | null = null;

  if (resend) {
    try {
      const response = await resend.emails.send({
        from,
        to: customer.contact_email,
        subject,
        html,
      });
      status = 'sent';
      providerMessageId = response.data?.id || null;
    } catch (error) {
      status = 'failed';
      warning = error instanceof Error ? error.message : 'Email provider failed';
    }
  } else {
    warning = 'Resend is not configured. Email was logged only.';
  }

  const now = new Date().toISOString();
  const { data: job, error: jobError } = await supabase
    .from('email_jobs')
    .insert({
      customer_id: customerId,
      cm_id: user.id,
      status,
      attempts: 1,
      max_attempts: 3,
      last_error: status === 'failed' ? warning : null,
      provider_message_id: providerMessageId,
      scheduled_at: now,
      sent_at: status === 'sent' ? now : null,
      subject,
      body_html: html,
      concept_ids: conceptIds,
    })
    .select()
    .single();

  if (jobError) {
    return NextResponse.json({ error: jobError.message }, { status: 500 });
  }

  await supabase.from('email_log').insert({
    customer_id: customerId,
    cm_id: user.id,
    subject,
    body_html: html,
    concept_ids: conceptIds,
    sent_at: now,
  });

  return NextResponse.json({
    success: true,
    message: status === 'sent' ? 'Email sent' : 'Email logged',
    warning,
    job,
  });
}, ['admin', 'content_manager']);
