import { NextRequest } from 'next/server';
import { recordAuditLog } from '@/lib/admin/audit-log';
import { listInvoiceAdjustments } from '@/lib/stripe/billing-adjustments';
import {
  createManualInvoice,
  createInvoiceLineCreditNote,
  payInvoice,
  voidInvoice,
} from '@/lib/stripe/admin-billing';
import { requireAdminScope, withAuth } from '@/lib/auth/api-auth';
import { stripe } from '@/lib/stripe/dynamic-config';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { z } from 'zod';

const payVoidSchema = z
  .object({
    action: z.enum(['pay', 'void']),
  })
  .strict();

const creditNoteSchema = z
  .object({
    action: z.literal('credit_note'),
    stripe_line_item_id: z.string().trim().min(1),
    amount_ore: z.number().int().min(1),
    refund_amount_ore: z.number().int().min(0).optional().nullable(),
    memo: z.string().trim().max(1000).optional().nullable(),
  })
  .strict();

const creditNoteAndReissueSchema = z
  .object({
    action: z.literal('credit_note_and_reissue'),
    stripe_line_item_id: z.string().trim().min(1),
    amount_ore: z.number().int().min(1),
    refund_amount_ore: z.number().int().min(0).optional().nullable(),
    memo: z.string().trim().max(1000).optional().nullable(),
    days_until_due: z.number().int().min(1).max(90).default(14),
    reissue_items: z.array(
      z.object({
        description: z.string().trim().min(1).max(500),
        amount: z.number().min(0.01).max(1_000_000),
      }).strict(),
    ).min(1),
  })
  .strict();

export const GET = withAuth(
  async (
    _request: NextRequest,
    _user,
    { params }: { params: Promise<{ invoiceId: string }> },
  ) => {
    const { invoiceId } = await params;
    const supabaseAdmin = createSupabaseAdmin();

    const invoiceResult = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .maybeSingle();

    if (invoiceResult.error || !invoiceResult.data) {
      return jsonError(invoiceResult.error?.message || 'Fakturan hittades inte', 404);
    }

    const lineItemsResult = await supabaseAdmin
      .from('invoice_line_items')
      .select('stripe_line_item_id, description, amount, currency, quantity, period_start, period_end')
      .eq('stripe_invoice_id', invoiceResult.data.stripe_invoice_id)
      .order('created_at', { ascending: true });

    if (lineItemsResult.error) {
      return jsonError(lineItemsResult.error.message, 500);
    }

    const adjustments = await listInvoiceAdjustments(
      supabaseAdmin,
      invoiceResult.data.stripe_invoice_id,
    );

    return jsonOk({
      invoice: {
        ...invoiceResult.data,
        line_items: lineItemsResult.data ?? [],
      },
      adjustments,
    });
  },
  ['admin'],
);

export const PATCH = withAuth(
  async (
    request: NextRequest,
    user,
    { params }: { params: Promise<{ invoiceId: string }> },
  ) => {
    const { invoiceId } = await params;
    const body = await request.json();
    const parsedPayVoid = payVoidSchema.safeParse(body);
    const parsedCreditNote = creditNoteSchema.safeParse(body);
    const parsedCreditNoteAndReissue = creditNoteAndReissueSchema.safeParse(body);
    const supabaseAdmin = createSupabaseAdmin();

    if (!parsedPayVoid.success && !parsedCreditNote.success && !parsedCreditNoteAndReissue.success) {
      return jsonError('Ogiltig payload', 400);
    }

    requireAdminScope(
      user,
      'super_admin',
      'Endast super-admin kan voida, kreditera eller markera fakturor som betalda',
    );

    if (parsedPayVoid.success) {
      if (parsedPayVoid.data.action === 'pay') {
        const invoice = await payInvoice({
          supabaseAdmin,
          stripeClient: stripe,
          invoiceId,
        });

        await recordAuditLog(supabaseAdmin, {
          actorUserId: user.id,
          actorEmail: user.email,
          actorRole: user.role,
          action: 'admin.invoice.paid',
          entityType: 'invoice',
          entityId: invoiceId,
          metadata: {
            stripe_invoice_id: invoice.id,
          },
        });

        return jsonOk({ invoice });
      }

      const invoice = await voidInvoice({
        supabaseAdmin,
        stripeClient: stripe,
        invoiceId,
      });

      await recordAuditLog(supabaseAdmin, {
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'admin.invoice.voided',
        entityType: 'invoice',
        entityId: invoiceId,
        metadata: {
          stripe_invoice_id: invoice.id,
        },
      });

      return jsonOk({ invoice });
    }

    if (parsedCreditNoteAndReissue.success) {
      const reissueData = parsedCreditNoteAndReissue.data;
      const invoiceRecord = await supabaseAdmin
        .from('invoices')
        .select('customer_profile_id')
        .eq('id', invoiceId)
        .maybeSingle();

      if (invoiceRecord.error || !invoiceRecord.data?.customer_profile_id) {
        return jsonError(invoiceRecord.error?.message || 'Fakturan saknar kundkoppling', 400);
      }

      const result = await createInvoiceLineCreditNote({
        supabaseAdmin,
        stripeClient: stripe,
        invoiceId,
        stripeLineItemId: reissueData.stripe_line_item_id,
        amountOre: reissueData.amount_ore,
        refundAmountOre: reissueData.refund_amount_ore ?? null,
        memo: reissueData.memo ?? null,
      });

      let replacementInvoice: Awaited<ReturnType<typeof createManualInvoice>>;
      try {
        replacementInvoice = await createManualInvoice({
          supabaseAdmin,
          stripeClient: stripe,
          profileId: invoiceRecord.data.customer_profile_id,
          items: reissueData.reissue_items.map((item) => ({
            description: item.description,
            amountSek: item.amount,
          })),
          daysUntilDue: reissueData.days_until_due,
          autoFinalize: true,
        });
      } catch (replacementError) {
        await recordAuditLog(supabaseAdmin, {
          actorUserId: user.id,
          actorEmail: user.email,
          actorRole: user.role,
          action: 'admin.invoice.credit_note_reissue_failed',
          entityType: 'invoice',
          entityId: invoiceId,
          metadata: {
            stripe_invoice_id: result.invoice.id,
            stripe_credit_note_id: result.creditNote.id,
            amount_ore: reissueData.amount_ore,
            refund_amount_ore: reissueData.refund_amount_ore ?? null,
            replacement_items: reissueData.reissue_items.length,
            error:
              replacementError instanceof Error
                ? replacementError.message
                : 'Unknown replacement invoice error',
          },
        });

        return jsonError(
          replacementError instanceof Error
            ? `Kreditnota skapades men ersattningsfakturan misslyckades: ${replacementError.message}`
            : 'Kreditnota skapades men ersattningsfakturan misslyckades',
          500,
        );
      }

      await recordAuditLog(supabaseAdmin, {
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'admin.invoice.credit_note_reissued',
        entityType: 'invoice',
        entityId: invoiceId,
        metadata: {
          stripe_invoice_id: result.invoice.id,
          stripe_credit_note_id: result.creditNote.id,
          replacement_invoice_id: replacementInvoice.id,
          amount_ore: reissueData.amount_ore,
          refund_amount_ore: reissueData.refund_amount_ore ?? null,
          replacement_items: reissueData.reissue_items.length,
        },
      });

      return jsonOk({
        ...result,
        replacementInvoice,
      });
    }

    if (!parsedCreditNote.success) {
      return jsonError('Ogiltig payload', 400);
    }

    const creditNoteData = parsedCreditNote.data;
    const result = await createInvoiceLineCreditNote({
      supabaseAdmin,
      stripeClient: stripe,
      invoiceId,
      stripeLineItemId: creditNoteData.stripe_line_item_id,
      amountOre: creditNoteData.amount_ore,
      refundAmountOre: creditNoteData.refund_amount_ore ?? null,
      memo: creditNoteData.memo ?? null,
    });

    await recordAuditLog(supabaseAdmin, {
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'admin.invoice.credit_note_created',
      entityType: 'invoice',
      entityId: invoiceId,
      metadata: {
        stripe_invoice_id: result.invoice.id,
        stripe_credit_note_id: result.creditNote.id,
        amount_ore: creditNoteData.amount_ore,
        refund_amount_ore: creditNoteData.refund_amount_ore ?? null,
      },
    });

    return jsonOk(result);
  },
  ['admin'],
);
