import { NextRequest } from 'next/server';
import { withAuth, requireScope } from '@/lib/auth/api-auth';
import { listAuditLog } from '@/lib/admin/audit-log';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

type TimelineEventKind =
  | 'created'
  | 'finalized'
  | 'sent'
  | 'paid'
  | 'payment_failed'
  | 'voided'
  | 'uncollectible'
  | 'credit_note'
  | 'reissued'
  | 'memo_updated'
  | 'line_added'
  | 'webhook'
  | 'admin_action'
  | 'note';

export interface InvoiceTimelineEvent {
  id: string;
  at: string;
  kind: TimelineEventKind;
  title: string;
  description?: string | null;
  actor?: string | null;
  source: 'stripe_webhook' | 'admin' | 'system' | 'milestone';
  status: 'success' | 'warning' | 'error' | 'info';
}

const AUDIT_KIND: Record<
  string,
  { kind: TimelineEventKind; title: string; status: InvoiceTimelineEvent['status'] }
> = {
  'admin.invoice.created': { kind: 'created', title: 'Faktura skapad', status: 'info' },
  'admin.invoice.paid': {
    kind: 'paid',
    title: 'Markerad som betald (manuellt)',
    status: 'success',
  },
  'admin.invoice.voided': {
    kind: 'voided',
    title: 'Faktura annullerad',
    status: 'error',
  },
  'admin.invoice.uncollectible': {
    kind: 'uncollectible',
    title: 'Markerad som svårindrivbar',
    status: 'warning',
  },
  'admin.invoice.memo_updated': {
    kind: 'memo_updated',
    title: 'Kommentar uppdaterad',
    status: 'info',
  },
  'admin.invoice.line_added': {
    kind: 'line_added',
    title: 'Rad tillagd',
    status: 'info',
  },
  'admin.invoice.credit_note_created': {
    kind: 'credit_note',
    title: 'Kreditnota skapad',
    status: 'warning',
  },
  'admin.invoice.credit_note_reissued': {
    kind: 'reissued',
    title: 'Kredit + ersättning',
    status: 'success',
  },
  'admin.invoice.credit_note_reissue_failed': {
    kind: 'reissued',
    title: 'Ersättning misslyckades',
    status: 'error',
  },
  'admin.invoice.resent': { kind: 'sent', title: 'Faktura skickad igen', status: 'info' },
  'admin.invoice.resync': {
    kind: 'webhook',
    title: 'Manuell resync från Stripe',
    status: 'info',
  },
  'system.invoice.payment_succeeded': {
    kind: 'paid',
    title: 'Betalning mottagen',
    status: 'success',
  },
  'system.invoice.payment_failed': {
    kind: 'payment_failed',
    title: 'Betalning misslyckades',
    status: 'error',
  },
};

const WEBHOOK_KIND: Record<
  string,
  { kind: TimelineEventKind; title: string; status: InvoiceTimelineEvent['status'] }
> = {
  'invoice.created': { kind: 'created', title: 'Skapad i Stripe', status: 'info' },
  'invoice.finalized': { kind: 'finalized', title: 'Finaliserad', status: 'info' },
  'invoice.sent': { kind: 'sent', title: 'Skickad till kund', status: 'info' },
  'invoice.paid': { kind: 'paid', title: 'Betalad', status: 'success' },
  'invoice.payment_succeeded': {
    kind: 'paid',
    title: 'Betalning lyckades',
    status: 'success',
  },
  'invoice.payment_failed': {
    kind: 'payment_failed',
    title: 'Betalning misslyckades',
    status: 'error',
  },
  'invoice.payment_action_required': {
    kind: 'payment_failed',
    title: 'Kräver kundåtgärd (3DS)',
    status: 'warning',
  },
  'invoice.voided': { kind: 'voided', title: 'Annullerad', status: 'error' },
  'invoice.marked_uncollectible': {
    kind: 'uncollectible',
    title: 'Svårindrivbar',
    status: 'warning',
  },
  'invoice.updated': { kind: 'webhook', title: 'Uppdaterad i Stripe', status: 'info' },
  'invoice.deleted': { kind: 'webhook', title: 'Borttagen i Stripe', status: 'error' },
  'charge.refunded': {
    kind: 'credit_note',
    title: 'Återbetalning utförd',
    status: 'warning',
  },
  'credit_note.created': {
    kind: 'credit_note',
    title: 'Kreditnota skapad i Stripe',
    status: 'warning',
  },
  'credit_note.voided': {
    kind: 'credit_note',
    title: 'Kreditnota annullerad',
    status: 'info',
  },
};

export const GET = withAuth(
  async (request: NextRequest, user, { params }: { params: Promise<{ invoiceId: string }> }) => {
    requireScope(user, 'billing.invoices.read');
    const { invoiceId } = await params;
    if (!invoiceId) return jsonError('invoiceId krävs', 400);

    const supabaseAdmin = createSupabaseAdmin();
    const events: InvoiceTimelineEvent[] = [];

    const { data: invoiceRow } = await supabaseAdmin
      .from('invoices')
      .select('stripe_invoice_id, created_at, due_date, status')
      .eq('stripe_invoice_id', invoiceId)
      .maybeSingle();

    if (invoiceRow?.created_at) {
      events.push({
        id: `milestone:${invoiceRow.stripe_invoice_id}:created`,
        at: invoiceRow.created_at,
        kind: 'created',
        title: 'Faktura registrerad i Hagen',
        source: 'milestone',
        status: 'info',
      });
    }

    const { data: syncEvents } = await supabaseAdmin
      .from('stripe_sync_events' as never)
      .select(
        'id, stripe_event_id, event_type, status, error_message, received_at, source, applied_changes',
      )
      .eq('object_id', invoiceId)
      .order('received_at', { ascending: false })
      .limit(100)
      .returns<
        Array<{
          id: string;
          stripe_event_id: string | null;
          event_type: string;
          status: string;
          error_message: string | null;
          received_at: string;
          source: string;
          applied_changes: Record<string, unknown> | null;
        }>
      >();

    for (const event of syncEvents ?? []) {
      const mapped = WEBHOOK_KIND[event.event_type] ?? {
        kind: 'webhook' as const,
        title: event.event_type,
        status: 'info' as const,
      };
      const status: InvoiceTimelineEvent['status'] =
        event.status === 'failed'
          ? 'error'
          : event.status === 'skipped'
            ? 'warning'
            : mapped.status;
      events.push({
        id: `sync:${event.id}`,
        at: event.received_at,
        kind: mapped.kind,
        title: mapped.title,
        description:
          event.error_message ??
          (event.status === 'skipped' ? 'Hoppades över (redan applicerad).' : null),
        source: event.source === 'webhook' ? 'stripe_webhook' : 'system',
        status,
      });
    }

    try {
      const { entries } = await listAuditLog(supabaseAdmin, {
        entity: 'invoice',
        limit: 100,
      });
      for (const entry of entries) {
        if (entry.entity_id !== invoiceId) continue;
        const mapped = AUDIT_KIND[entry.action] ?? {
          kind: 'admin_action' as const,
          title: entry.action,
          status: 'info' as const,
        };
        events.push({
          id: `audit:${entry.id}`,
          at: entry.created_at,
          kind: mapped.kind,
          title: mapped.title,
          actor: entry.actor_email ?? entry.actor_role ?? null,
          source: 'admin',
          status: mapped.status,
        });
      }
    } catch {
      // Audit-log can be unavailable in some environments.
    }

    const { data: creditOps } = await supabaseAdmin
      .from('credit_note_operations')
      .select(
        'id, operation_type, status, requires_attention, attention_reason, error_message, created_at',
      )
      .eq('source_invoice_id', invoiceId)
      .order('created_at', { ascending: false });

    for (const operation of creditOps ?? []) {
      if (!operation.created_at) continue;
      const isFailed = operation.status === 'failed' || operation.requires_attention;
      events.push({
        id: `credit:${operation.id}`,
        at: operation.created_at,
        kind:
          operation.operation_type === 'credit_note_and_reissue' ? 'reissued' : 'credit_note',
        title:
          operation.operation_type === 'credit_note_and_reissue'
            ? 'Kredit + ersättningsfaktura'
            : 'Kreditnota',
        description: operation.attention_reason ?? operation.error_message ?? null,
        source: 'admin',
        status: isFailed ? 'error' : operation.status === 'completed' ? 'success' : 'info',
      });
    }

    const seen = new Set<string>();
    const sorted = events
      .filter((event) => {
        if (seen.has(event.id)) return false;
        seen.add(event.id);
        return true;
      })
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return new Response(JSON.stringify({ events: sorted }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=10',
      },
    });
  },
  ['admin', 'content_manager'],
);
