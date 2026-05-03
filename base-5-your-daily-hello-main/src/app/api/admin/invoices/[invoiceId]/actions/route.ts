import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, requireAdminScope } from '@/lib/auth/api-auth';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { createStripeClient, stripeEnvironment } from '@/lib/stripe/dynamic-config';
import { upsertInvoiceMirror } from '@/lib/stripe/mirror';
import { logStripeSync } from '@/lib/stripe/sync-log';
import { recordAuditLog } from '@/lib/admin/audit-log';

type AuthedUser = { id: string; email?: string | null; role?: string | null };

async function audit(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  user: AuthedUser,
  action: string,
  invoiceId: string,
  metadata: Record<string, unknown>,
) {
  return recordAuditLog(supabaseAdmin, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    actorRole: user.role ?? null,
    action,
    entityType: 'invoice',
    entityId: invoiceId,
    metadata,
  }).catch(() => false);
}

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('mark_paid'),
    paid_out_of_band: z.boolean().default(true),
  }),
  z.object({
    action: z.literal('resend'),
  }),
  z.object({
    action: z.literal('resync'),
  }),
  z.object({
    action: z.literal('pay_now'),
  }),
]);

/**
 * POST /api/admin/invoices/[invoiceId]/actions
 *
 * Snabba operativa actions från faktura-modalen:
 *  - mark_paid: stripe.invoices.pay({ paid_out_of_band: true })
 *  - resend:    stripe.invoices.sendInvoice
 *  - resync:    hämta fakturan från Stripe och spegla in i mirror
 */
export const POST = withAuth(
  async (
    request: NextRequest,
    user,
    { params }: { params: Promise<{ invoiceId: string }> },
  ): Promise<NextResponse> => {
    requireAdminScope(user, 'super_admin', 'Endast super-admin kan köra faktura-actions');

    const { invoiceId } = await params;
    if (!invoiceId) return jsonError('invoiceId krävs', 400);

    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return jsonError('Ogiltig payload', 400, {
        details: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }

    const supabaseAdmin = createSupabaseAdmin();
    const { data: invoiceRow } = await supabaseAdmin
      .from('invoices')
      .select('stripe_invoice_id, environment, customer_profile_id, status')
      .eq('stripe_invoice_id', invoiceId)
      .maybeSingle();

    if (!invoiceRow) return jsonError('Faktura hittades inte', 404);

    const environment = (invoiceRow.environment as 'test' | 'live') ?? stripeEnvironment;
    const stripeClient = createStripeClient(environment);
    if (!stripeClient) return jsonError(`Stripe ej konfigurerat för ${environment}`, 500);

    try {
      if (parsed.data.action === 'mark_paid') {
        const updated = await stripeClient.invoices.pay(invoiceId, {
          paid_out_of_band: parsed.data.paid_out_of_band,
        });
        await upsertInvoiceMirror({ supabaseAdmin, invoice: updated, environment });
        await audit(supabaseAdmin, user as AuthedUser, 'admin.invoice.paid', invoiceId, {
          customer_profile_id: invoiceRow.customer_profile_id,
          paid_out_of_band: parsed.data.paid_out_of_band,
          amount_ore: updated.amount_paid,
        });
        await logStripeSync({
          supabaseAdmin,
          eventType: 'admin.invoice.mark_paid',
          objectType: 'invoice',
          objectId: invoiceId,
          customerProfileId: invoiceRow.customer_profile_id as string | null,
          source: 'app_action',
          status: 'success',
          environment,
        }).catch(() => undefined);
        return NextResponse.json({ ok: true, status: updated.status });
      }

      if (parsed.data.action === 'resend') {
        const sent = await stripeClient.invoices.sendInvoice(invoiceId);
        await upsertInvoiceMirror({ supabaseAdmin, invoice: sent, environment });
        await audit(supabaseAdmin, user as AuthedUser, 'admin.invoice.resent', invoiceId, {
          customer_profile_id: invoiceRow.customer_profile_id,
        });
        return NextResponse.json({ ok: true, status: sent.status });
      }

      if (parsed.data.action === 'pay_now') {
        // Triggar Stripe att försöka dra betalning från kundens default payment method.
        // Skiljer sig från mark_paid (paid_out_of_band) — här vill vi att Stripe
        // gör ett verkligt charge-försök på past_due / open-fakturor.
        const paid = await stripeClient.invoices.pay(invoiceId, {
          paid_out_of_band: false,
          forgive: false,
        });
        await upsertInvoiceMirror({ supabaseAdmin, invoice: paid, environment });
        await audit(supabaseAdmin, user as AuthedUser, 'admin.invoice.pay_now', invoiceId, {
          customer_profile_id: invoiceRow.customer_profile_id,
          resulting_status: paid.status,
          amount_paid_ore: paid.amount_paid,
        });
        await logStripeSync({
          supabaseAdmin,
          eventType: 'admin.invoice.pay_now',
          objectType: 'invoice',
          objectId: invoiceId,
          customerProfileId: invoiceRow.customer_profile_id as string | null,
          source: 'app_action',
          status: 'success',
          environment,
        }).catch(() => undefined);
        return NextResponse.json({ ok: true, status: paid.status });
      }

      // resync
      const fresh = await stripeClient.invoices.retrieve(invoiceId, {
        expand: ['lines.data', 'charge'],
      });
      await upsertInvoiceMirror({ supabaseAdmin, invoice: fresh, environment });
      await audit(supabaseAdmin, user as AuthedUser, 'admin.invoice.resync', invoiceId, {
        customer_profile_id: invoiceRow.customer_profile_id,
      });
      await logStripeSync({
        supabaseAdmin,
        eventType: 'admin.invoice.manual_resync',
        objectType: 'invoice',
        objectId: invoiceId,
        customerProfileId: invoiceRow.customer_profile_id as string | null,
        source: 'manual_resync',
        status: 'success',
        environment,
      }).catch(() => undefined);

      return NextResponse.json({ ok: true, status: fresh.status });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Okänt fel';
      return jsonError(message, 500);
    }
  },
  ['admin'],
);
