import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, requireAdminScope } from '@/lib/auth/api-auth';
import { stripe, stripeEnvironment } from '@/lib/stripe/dynamic-config';
import { upsertInvoiceMirror } from '@/lib/stripe/mirror';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('update_memo'),
    memo: z.string().max(2000),
  }),
  z.object({
    action: z.literal('add_line'),
    description: z.string().min(1).max(500),
    amount_ore: z.number().int().positive().max(10_000_000),
    quantity: z.number().int().min(1).max(1000).default(1),
  }),
]);

/**
 * PATCH /api/admin/invoices/[invoiceId]/lines
 *
 * Tillåter två operationer på en faktura:
 *  - update_memo: uppdaterar fakturans description (alla statusar utom void)
 *  - add_line:   lägger till en ny rad på draft-faktura
 *
 * Befintliga rader och borttagningar hanteras via credit + reissue-wizarden
 * när fakturan inte längre är i draft-läge.
 */
export const PATCH = withAuth(
  async (
    request: NextRequest,
    user,
    { params }: { params: Promise<{ invoiceId: string }> },
  ) => {
    requireAdminScope(user, 'billing.invoices.write');

    const { invoiceId } = await params;
    if (!invoiceId) return jsonError('invoiceId saknas', 400);

    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return jsonError('Ogiltig payload', 400, {
        details: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }

    try {
      if (!stripe) return jsonError('Stripe är inte konfigurerat på servern', 500);
      const stripeClient = stripe;
      const supabaseAdmin = createSupabaseAdmin();
      const invoice = await stripeClient.invoices.retrieve(invoiceId);

      if (invoice.status === 'void') {
        return jsonError('Annullerad faktura kan inte ändras', 409);
      }

      if (parsed.data.action === 'update_memo') {
        const updated = await stripeClient.invoices.update(invoiceId, {
          description: parsed.data.memo,
        });
        await upsertInvoiceMirror({
          supabaseAdmin,
          invoice: updated,
          environment: stripeEnvironment,
        });
        return NextResponse.json({ ok: true, invoice: { id: updated.id } });
      }

      // add_line — endast tillåtet på draft
      if (invoice.status !== 'draft') {
        return jsonError(
          'Nya rader kan bara läggas till på en draft-faktura. Använd kredit + reissue för att korrigera en utskickad eller betald faktura.',
          409,
        );
      }

      const customerId =
        typeof invoice.customer === 'string'
          ? invoice.customer
          : invoice.customer?.id;
      if (!customerId) {
        return jsonError('Saknar Stripe-kund för fakturan', 500);
      }

      await stripeClient.invoiceItems.create({
        customer: customerId,
        invoice: invoiceId,
        currency: invoice.currency || 'sek',
        description: parsed.data.description,
        // amount = totalbelopp för raden (kvantitet ingår). Stripe API
        // för invoiceItems använder `amount` (öre i SEK), inte unit_amount.
        amount: parsed.data.amount_ore,
        quantity: parsed.data.quantity,
      });

      const refreshed = await stripeClient.invoices.retrieve(invoiceId);
      await upsertInvoiceMirror({
        supabaseAdmin,
        invoice: refreshed,
        environment: stripeEnvironment,
      });

      return NextResponse.json({ ok: true, invoice: { id: refreshed.id } });
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : 'Kunde inte uppdatera fakturan',
        500,
      );
    }
  },
  ['admin'],
);