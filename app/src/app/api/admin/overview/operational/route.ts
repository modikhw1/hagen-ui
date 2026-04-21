import { withAuth } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

function isMissingTableError(message?: string) {
  return typeof message === 'string' && message.toLowerCase().includes('relation') && message.toLowerCase().includes('does not exist');
}

export const GET = withAuth(async () => {
  const supabase = createSupabaseAdmin();

  const [interactions, bufferRows, cmNotifications, attentionSnoozes] = await Promise.all([
    (((supabase.from('cm_interactions' as never) as never) as {
      select: (value: string) => { order: (column: string, options: { ascending: boolean }) => Promise<{ data: unknown[] | null; error: { message?: string } | null }> };
    }).select('cm_id, customer_id, type, created_at')).order('created_at', { ascending: false }),
    (((supabase.from('v_customer_buffer' as never) as never) as {
      select: (value: string) => Promise<{ data: unknown[] | null; error: { message?: string } | null }>;
    }).select('customer_id, assigned_cm_id, concepts_per_week, paused_until, latest_planned_publish_date, last_published_at')),
    (((supabase.from('cm_notifications' as never) as never) as {
      select: (value: string) => { is: (column: string, value: null) => Promise<{ data: unknown[] | null; error: { message?: string } | null }> };
    }).select('id, from_cm_id, customer_id, message, priority, created_at, resolved_at')).is('resolved_at', null),
    (((supabase.from('attention_snoozes' as never) as never) as {
      select: (value: string) => Promise<{ data: unknown[] | null; error: { message?: string } | null }>;
    }).select('subject_type, subject_id, snoozed_until, released_at')),
  ]);

  if (interactions.error && !isMissingTableError(interactions.error.message)) {
    return jsonError(interactions.error.message || 'Kunde inte hamta interaktioner', 500);
  }
  if (bufferRows.error && !isMissingTableError(bufferRows.error.message)) {
    return jsonError(bufferRows.error.message || 'Kunde inte hamta bufferdata', 500);
  }
  if (cmNotifications.error && !isMissingTableError(cmNotifications.error.message)) {
    return jsonError(cmNotifications.error.message || 'Kunde inte hamta CM-notiser', 500);
  }
  if (attentionSnoozes.error && !isMissingTableError(attentionSnoozes.error.message)) {
    return jsonError(attentionSnoozes.error.message || 'Kunde inte hamta hanteras-markeringar', 500);
  }

  return jsonOk({
    interactions: interactions.data ?? [],
    bufferRows: bufferRows.data ?? [],
    cmNotifications: cmNotifications.data ?? [],
    attentionSnoozes: attentionSnoozes.data ?? [],
  });
}, ['admin']);
