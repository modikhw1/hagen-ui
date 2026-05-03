import { NextRequest } from 'next/server';
import { withAuth, requireScope } from '@/lib/auth/api-auth';
import { listAuditLog } from '@/lib/admin/audit-log';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

const HUMAN_LABELS: Record<string, string> = {
  'admin.customer.subscription_cancelled': 'Abonnemang avslutat',
  'admin.customer.subscription_paused': 'Abonnemang pausat',
  'admin.customer.subscription_resumed': 'Abonnemang återupptaget',
  'admin.customer.subscription_price_changed': 'Pris ändrat',
  'admin.customer.discount_applied': 'Rabatt applicerad',
  'admin.customer.discount_removed': 'Rabatt borttagen',
  'admin.invoice.created': 'Manuell faktura skapad',
  'admin.invoice.paid': 'Faktura markerad som betald',
  'admin.invoice.resent': 'Faktura skickad igen',
  'admin.invoice.resync': 'Faktura synkad från Stripe',
  'admin.invoice.voided': 'Faktura annullerad',
  'admin.invoice.uncollectible': 'Faktura markerad som svårindrivbar',
  'admin.invoice.credit_note_created': 'Kreditnota skapad',
  'admin.invoice.credit_note_reissued': 'Kreditnota + ersättning',
  'admin.invoice.credit_note_reissue_failed': 'Kreditnota OK, ersättning misslyckades',
  'billing.reconcile.request': 'Reconcile begärd',
  'billing.reconcile.complete': 'Reconcile slutförd',
  'billing.reconcile.failed': 'Reconcile misslyckades',
  'system.invoice.payment_succeeded': 'Betalning mottagen',
  'system.invoice.payment_failed': 'Betalning misslyckades',
};

export const GET = withAuth(async (request: NextRequest, user) => {
  try {
    requireScope(user, 'billing.invoices.read');

    const limitParam = Number(request.nextUrl.searchParams.get('limit') ?? 20);
    const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 20, 1), 100);

    const supabaseAdmin = createSupabaseAdmin();
    const { entries, schemaWarnings } = await listAuditLog(supabaseAdmin, {
      billingOnly: true,
      limit,
    });

    const events = entries.map((entry) => {
      const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
      const customerProfileId =
        typeof metadata.customer_profile_id === 'string'
          ? metadata.customer_profile_id
          : null;
      const businessName =
        typeof metadata.business_name === 'string' ? metadata.business_name : null;
      const amountOre =
        typeof metadata.amount_ore === 'number'
          ? metadata.amount_ore
          : typeof metadata.invoice_total_ore === 'number'
            ? metadata.invoice_total_ore
            : null;

      return {
        id: entry.id,
        at: entry.created_at,
        action: entry.action,
        title: HUMAN_LABELS[entry.action] ?? entry.action,
        entity_type: entry.entity_type,
        entity_id: entry.entity_id,
        actor_label: entry.actor_email,
        actor_role: entry.actor_role,
        customer_profile_id: customerProfileId,
        business_name: businessName,
        amount_ore: amountOre,
      };
    });

    return new Response(JSON.stringify({ events, schemaWarnings }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=15, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Server error', 500);
  }
}, ['admin']);
