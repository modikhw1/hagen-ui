import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/api-auth';
import { hydrateEmailPayload } from '@/lib/email/service';
import { buildAssignmentShareMarkerPayload } from '@/lib/customer-concept-lifecycle';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const from = process.env.RESEND_FROM_EMAIL || 'LeTrend <hej@letrend.se>';

export const POST = withAuth(async (request, user) => {
  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ogiltig JSON payload' }, { status: 400 });
  }

  let hydrated;
  try {
    hydrated = await hydrateEmailPayload(requestBody);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Invalid payload' }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to build email' },
      { status: 500 }
    );
  }

  const customerId = hydrated.payload.customer_id;
  const subject = hydrated.rendered.subject;
  const html = hydrated.rendered.html;
  const conceptIds = hydrated.conceptIds;
  const supabase = createSupabaseAdmin();

  let status = 'queued';
  let providerMessageId: string | null = null;
  let warning: string | null = null;

  if (resend) {
    try {
      const response = await resend.emails.send({
        from,
        to: hydrated.toEmail,
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

  if (status === 'sent' && conceptIds.length > 0) {
    const { data: assignmentRows, error: assignmentLookupError } = await supabase
      .from('customer_concepts')
      .select('id, status, sent_at')
      .eq('customer_profile_id', customerId)
      .in('id', conceptIds);

    if (assignmentLookupError) {
      console.error('[studio-v2/email/send] Failed to load assignment rows:', assignmentLookupError);
      warning = warning
        ? `${warning} Assignment share markers were not updated.`
        : 'Assignment share markers were not updated.';
    } else if (assignmentRows && assignmentRows.length > 0) {
      const shareUpdates = await Promise.all(
        assignmentRows.map((assignment) => (
          supabase
            .from('customer_concepts')
            .update(buildAssignmentShareMarkerPayload(assignment, now))
            .eq('id', assignment.id)
            .eq('customer_profile_id', customerId)
        ))
      );

      const shareUpdateError = shareUpdates.find((result) => result.error)?.error;
      if (shareUpdateError) {
        console.error('[studio-v2/email/send] Failed to update assignment share markers:', shareUpdateError);
        warning = warning
          ? `${warning} Assignment share markers were not fully updated.`
          : 'Assignment share markers were not fully updated.';
      }
    }
  }

  return NextResponse.json({
    success: true,
    message: status === 'sent' ? 'Email sent' : 'Email logged',
    warning,
    job,
  });
}, ['admin', 'content_manager']);
