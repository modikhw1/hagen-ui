import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { z } from 'zod';

import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { hasAdminScope, requireAdminScope, withAuth } from '@/lib/auth/api-auth';
import {
  createCreditNoteOperation,
  findCreditNoteOperationByIdempotencyKey,
  markCreditNoteOperationStep,
  upsertCreditNoteMirror,
  upsertRefundMirror,
} from '@/lib/stripe/billing-adjustments';
import {
  createStripeClient,
  stripe,
  stripeEnvironment,
} from '@/lib/stripe/dynamic-config';
import { upsertInvoiceMirror } from '@/lib/stripe/mirror';

type CreditSettlementMode =
  | 'reduce_amount_due'
  | 'refund'
  | 'customer_balance'
  | 'outside_stripe';

const creditReasonSchema = z
  .enum(['duplicate', 'fraudulent', 'order_change', 'product_unsatisfactory'])
  .optional();

const settlementModeSchema = z
  .enum(['reduce_amount_due', 'refund', 'customer_balance', 'outside_stripe'])
  .optional();

const PatchSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('credit_note_only'),
    reason: creditReasonSchema,
    memo: z.string().max(2000).optional(),
    amount_ore: z.number().int().positive().max(10_000_000),
    stripe_line_item_id: z.string().trim().min(1).optional().nullable(),
    settlement_mode: settlementModeSchema,
    idempotency_key: z.string().min(8).max(128).optional(),
  }),
  z.object({
    action: z.literal('credit_note_and_reissue'),
    reason: creditReasonSchema,
    memo: z.string().max(2000).optional(),
    amount_ore: z.number().int().positive().max(10_000_000),
    stripe_line_item_id: z.string().trim().min(1).optional().nullable(),
    settlement_mode: settlementModeSchema,
    new_amount_ore: z.number().int().positive().max(10_000_000),
    new_description: z.string().min(1).max(500),
    idempotency_key: z.string().min(8).max(128).optional(),
  }),
  z.object({
    action: z.literal('void'),
    idempotency_key: z.string().min(8).max(128).optional(),
  }),
  z.object({
    action: z.literal('mark_uncollectible'),
    idempotency_key: z.string().min(8).max(128).optional(),
  }),
]);

function normalizeSettlementMode(
  invoiceStatus: string | null | undefined,
  settlementMode?: CreditSettlementMode,
): CreditSettlementMode {
  if (invoiceStatus === 'paid') {
    return settlementMode ?? 'refund';
  }

  return 'reduce_amount_due';
}

function buildInvoiceMirrorIdClause(invoiceId: string) {
  return `stripe_invoice_id.eq.${invoiceId},id.eq.${
    invoiceId.length === 36
      ? invoiceId
      : '00000000-0000-0000-0000-000000000000'
  }`;
}

function mapMirrorLines(
  lineItems: Array<{
    id?: string | null;
    stripe_line_item_id?: string | null;
    description?: string | null;
    amount?: number | null;
    quantity?: number | null;
  }> | null,
) {
  return (lineItems ?? []).map((line) => ({
    id: line.stripe_line_item_id || line.id || 'unknown',
    description: line.description || 'Ingen beskrivning',
    amount: line.amount ?? 0,
    quantity: line.quantity ?? 1,
  }));
}

async function loadBillingContext(customerProfileId: string | null | undefined) {
  if (!customerProfileId) {
    return {
      stripe_subscription_id: null,
      has_active_subscription: false,
    };
  }

  const { data } = await supabaseAdmin
    .from('customer_profiles')
    .select('stripe_subscription_id')
    .eq('id', customerProfileId)
    .maybeSingle();

  return {
    stripe_subscription_id: data?.stripe_subscription_id ?? null,
    has_active_subscription: Boolean(data?.stripe_subscription_id),
    can_refund_payment_method: false,
  };
}

async function syncSourceInvoiceAfterAdjustment(args: {
  stripe: Stripe;
  invoiceId: string;
  environment: 'test' | 'live';
  operationId: string;
}) {
  const refreshedInvoice = await args.stripe.invoices.retrieve(args.invoiceId, {
    expand: ['lines.data', 'charge'],
  });

  await upsertInvoiceMirror({
    supabaseAdmin,
    invoice: refreshedInvoice,
    environment: args.environment,
  });

  const chargeValue = 'charge' in refreshedInvoice ? refreshedInvoice.charge : null;
  const expandedCharge =
    chargeValue && typeof chargeValue !== 'string' ? (chargeValue as Stripe.Charge) : null;
  const chargeId =
    typeof chargeValue === 'string'
      ? chargeValue
      : expandedCharge?.id ?? null;

  if (!chargeId) {
    return refreshedInvoice;
  }

  const charge =
    typeof chargeValue === 'string'
      ? await args.stripe.charges.retrieve(chargeId, { expand: ['refunds'] })
      : expandedCharge;

  if (!charge) {
    return refreshedInvoice;
  }

  for (const refund of charge.refunds?.data ?? []) {
    await upsertRefundMirror({
      supabaseAdmin,
      refund,
      charge,
      environment: args.environment,
      operationId: args.operationId,
    });
  }

  return refreshedInvoice;
}

export const GET = withAuth(
  async (
    request: NextRequest,
    user,
    { params }: { params: Promise<{ invoiceId: string }> },
  ) => {
    const { invoiceId } = await params;
    const expectedCustomerId = request.nextUrl.searchParams.get('customerId');

    const { data: invoiceRow, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('stripe_invoice_id', invoiceId)
      .maybeSingle();

    if (invoiceError) {
      return NextResponse.json({ error: invoiceError.message }, { status: 500 });
    }

    if (
      expectedCustomerId &&
      invoiceRow?.customer_profile_id &&
      invoiceRow.customer_profile_id !== expectedCustomerId
    ) {
      return NextResponse.json(
        { error: 'Fakturan tillhor inte kunden' },
        { status: 404 },
      );
    }

    const billingContext = await loadBillingContext(
      invoiceRow?.customer_profile_id as string | null | undefined,
    );

    const { data: operations } = await supabaseAdmin
      .from('credit_note_operations')
      .select('*')
      .eq('source_invoice_id', invoiceId)
      .order('created_at', { ascending: false });

    if (invoiceRow?.environment && invoiceRow.environment !== stripeEnvironment) {
      const { data: lineItems } = await supabaseAdmin
        .from('invoice_line_items')
        .select('*')
        .eq('stripe_invoice_id', invoiceId)
        .order('created_at', { ascending: true });

      return NextResponse.json({
        stripe_invoice_id: invoiceRow.stripe_invoice_id,
        number: invoiceRow.invoice_number,
        status: invoiceRow.status,
        amount_due: invoiceRow.amount_due,
        amount_paid: invoiceRow.amount_paid,
        currency: invoiceRow.currency,
        customer_name: invoiceRow.customer_name || 'Okand kund',
        customer_profile_id: invoiceRow.customer_profile_id,
        hosted_invoice_url: invoiceRow.hosted_invoice_url,
        invoice_pdf: invoiceRow.invoice_pdf,
        created_at: invoiceRow.created_at,
        due_date: invoiceRow.due_date,
        environment: invoiceRow.environment,
        lines: mapMirrorLines(lineItems),
        operations: operations || [],
        warning: {
          type: 'stripe_environment_mismatch',
          message: `Fakturan tillhor Stripe ${invoiceRow.environment}, medan admin just nu visar ${stripeEnvironment}.`,
          details: `active=${stripeEnvironment}, invoice=${invoiceRow.environment}`,
        },
        permissions: {
          can_manage_adjustments: false,
        },
        billing_context: billingContext,
      });
    }

    try {
      if (!stripe) {
        return NextResponse.json(
          { error: 'Stripe ar inte konfigurerat' },
          { status: 500 },
        );
      }

      const stripeInvoice = await stripe.invoices.retrieve(invoiceId, {
        expand: ['lines.data', 'charge', 'payment_intent'],
      });

      return NextResponse.json({
        stripe_invoice_id: stripeInvoice.id,
        number: stripeInvoice.number,
        status: stripeInvoice.status,
        amount_due: stripeInvoice.amount_due,
        amount_paid: stripeInvoice.amount_paid,
        currency: stripeInvoice.currency,
        customer_name:
          invoiceRow?.customer_name || stripeInvoice.customer_name || 'Okand kund',
        customer_profile_id: invoiceRow?.customer_profile_id,
        hosted_invoice_url: stripeInvoice.hosted_invoice_url,
        invoice_pdf: stripeInvoice.invoice_pdf,
        created_at: new Date(stripeInvoice.created * 1000).toISOString(),
        due_date: stripeInvoice.due_date
          ? new Date(stripeInvoice.due_date * 1000).toISOString()
          : null,
        environment: (invoiceRow?.environment as 'test' | 'live' | null) || 'live',
        lines: stripeInvoice.lines.data.map((line) => ({
          id: line.id,
          description: line.description || 'Ingen beskrivning',
          amount: line.amount,
          quantity: line.quantity ?? 1,
        })),
        operations: operations || [],
        permissions: {
          can_manage_adjustments: hasAdminScope(user, 'super_admin'),
        },
        billing_context: {
          ...billingContext,
          can_refund_payment_method: Boolean(
            'charge' in stripeInvoice &&
              stripeInvoice.charge &&
              `${stripeInvoice.charge}`.length > 0,
          ),
        },
      });
    } catch (error) {
      console.error('[API] Failed to fetch invoice from Stripe:', error);
      if (!invoiceRow) {
        return NextResponse.json(
          { error: 'Kunde inte hamta faktura fran Stripe' },
          { status: 500 },
        );
      }

      const { data: lineItems } = await supabaseAdmin
        .from('invoice_line_items')
        .select('*')
        .eq('stripe_invoice_id', invoiceId)
        .order('created_at', { ascending: true });

      return NextResponse.json({
        stripe_invoice_id: invoiceRow.stripe_invoice_id,
        number: invoiceRow.invoice_number,
        status: invoiceRow.status,
        amount_due: invoiceRow.amount_due,
        amount_paid: invoiceRow.amount_paid,
        currency: invoiceRow.currency,
        customer_name: invoiceRow.customer_name || 'Okand kund',
        customer_profile_id: invoiceRow.customer_profile_id,
        hosted_invoice_url: invoiceRow.hosted_invoice_url,
        invoice_pdf: invoiceRow.invoice_pdf,
        created_at: invoiceRow.created_at,
        due_date: invoiceRow.due_date,
        environment: (invoiceRow.environment as 'test' | 'live' | null) || 'live',
        lines: mapMirrorLines(lineItems),
        operations: operations || [],
        warning: {
          type: 'stripe_invoice_unavailable',
          message:
            'Fakturan kunde inte hamtas live fran Stripe. Visar lokal mirror-data.',
          details: error instanceof Error ? error.message : String(error),
        },
        permissions: {
          can_manage_adjustments: false,
        },
        billing_context: billingContext,
      });
    }
  },
  ['admin', 'content_manager'],
);

export const PATCH = withAuth(
  async (
    request: NextRequest,
    user,
    context: { params: Promise<{ invoiceId: string }> },
  ): Promise<NextResponse> => {
    requireAdminScope(
      user,
      'super_admin',
      'Endast super-admin kan kreditera fakturor',
    );

    const { invoiceId } = await context.params;

    let body: z.infer<typeof PatchSchema>;
    try {
      body = PatchSchema.parse(await request.json());
    } catch (error) {
      return NextResponse.json(
        {
          error: 'Ogiltig request body',
          details:
            error instanceof z.ZodError ? error.flatten() : String(error),
        },
        { status: 400 },
      );
    }

    const { data: invoiceRow, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .select(
        'stripe_invoice_id, environment, customer_profile_id, amount_due, amount_paid, status',
      )
      .or(buildInvoiceMirrorIdClause(invoiceId))
      .maybeSingle();

    if (invoiceError || !invoiceRow) {
      return NextResponse.json(
        { error: 'Faktura hittades inte i mirror' },
        { status: 404 },
      );
    }

    const stripeInvoiceId = invoiceRow.stripe_invoice_id;
    const environment = invoiceRow.environment as 'test' | 'live';
    const stripeClient = createStripeClient(environment);
    if (!stripeClient) {
      return NextResponse.json(
        { error: `Stripe ej konfigurerat for miljo ${environment}` },
        { status: 500 },
      );
    }

    const idempotencyKey = body.idempotency_key ?? randomUUID();
    const existing = await findCreditNoteOperationByIdempotencyKey({
      supabaseAdmin,
      idempotencyKey,
    });
    if (existing && existing.status === 'completed') {
      return NextResponse.json({
        ok: true,
        operation_id: existing.id,
        status: existing.status,
        requires_attention: existing.requires_attention,
        replayed: true,
      });
    }

    try {
      const liveInvoice = await stripeClient.invoices.retrieve(stripeInvoiceId, {
        expand: ['charge'],
      });

      await upsertInvoiceMirror({
        supabaseAdmin,
        invoice: liveInvoice,
        environment,
      });

      if (body.action === 'void') {
        const updated = await stripeClient.invoices.voidInvoice(
          stripeInvoiceId,
          undefined,
          { idempotencyKey: `${idempotencyKey}:void` },
        );
        await supabaseAdmin
          .from('invoices')
          .update({ status: updated.status })
          .eq('stripe_invoice_id', stripeInvoiceId);
        await upsertInvoiceMirror({
          supabaseAdmin,
          invoice: updated,
          environment,
        });
        return NextResponse.json({ ok: true, status: updated.status });
      }

      if (body.action === 'mark_uncollectible') {
        const updated = await stripeClient.invoices.markUncollectible(
          stripeInvoiceId,
          undefined,
          { idempotencyKey: `${idempotencyKey}:uncollectible` },
        );
        await supabaseAdmin
          .from('invoices')
          .update({ status: updated.status })
          .eq('stripe_invoice_id', stripeInvoiceId);
        await upsertInvoiceMirror({
          supabaseAdmin,
          invoice: updated,
          environment,
        });
        return NextResponse.json({ ok: true, status: updated.status });
      }

      return await runCreditNoteFlow({
        body,
        invoiceId: stripeInvoiceId,
        environment,
        customerProfileId: invoiceRow.customer_profile_id as string,
        invoiceStatus: liveInvoice.status ?? (invoiceRow.status as string),
        idempotencyKey,
        createdBy: user.id,
        stripe: stripeClient,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Okant fel';
      console.error(
        `[invoice PATCH] ${stripeInvoiceId} ${body.action} failed:`,
        error,
      );
      return NextResponse.json({ error: message }, { status: 500 });
    }
  },
  ['admin'],
);

async function runCreditNoteFlow(args: {
  body: Extract<
    z.infer<typeof PatchSchema>,
    { action: 'credit_note_only' | 'credit_note_and_reissue' }
  >;
  invoiceId: string;
  environment: 'test' | 'live';
  customerProfileId: string;
  invoiceStatus: string;
  idempotencyKey: string;
  createdBy: string;
  stripe: Stripe;
}): Promise<NextResponse> {
  const {
    body,
    invoiceId,
    environment,
    customerProfileId,
    invoiceStatus,
    idempotencyKey,
    createdBy,
    stripe,
  } = args;

  const creditAmountOre = body.amount_ore;
  const settlementMode = normalizeSettlementMode(
    invoiceStatus,
    body.settlement_mode as CreditSettlementMode | undefined,
  );

  const operation = await createCreditNoteOperation({
    supabaseAdmin,
    operationType: body.action,
    customerProfileId,
    sourceInvoiceId: invoiceId,
    amountOre: creditAmountOre,
    environment,
    idempotencyKey,
    createdBy,
  });

  let creditNote: Stripe.CreditNote;
  try {
    const params: Stripe.CreditNoteCreateParams = {
      invoice: invoiceId,
      reason: body.reason,
      memo: body.memo,
    };

    if (body.stripe_line_item_id) {
      params.lines = [
        {
          type: 'invoice_line_item',
          invoice_line_item: body.stripe_line_item_id,
          amount: creditAmountOre,
        },
      ];
    } else {
      params.amount = creditAmountOre;
    }

    if (invoiceStatus === 'paid') {
      if (settlementMode === 'refund') {
        params.refund_amount = creditAmountOre;
      } else if (settlementMode === 'customer_balance') {
        params.credit_amount = creditAmountOre;
      } else if (settlementMode === 'outside_stripe') {
        params.out_of_band_amount = creditAmountOre;
      }
    }

    creditNote = await stripe.creditNotes.create(params, {
      idempotencyKey: `${idempotencyKey}:credit_note`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Okant Stripe-fel';
    await markCreditNoteOperationStep({
      supabaseAdmin,
      operationId: operation.id,
      status: 'failed',
      patch: {
        error_message: `credit_note step: ${message}`,
        requires_attention: false,
      },
    });
    return NextResponse.json(
      { error: message, operation_id: operation.id, status: 'failed' },
      { status: 502 },
    );
  }

  await markCreditNoteOperationStep({
    supabaseAdmin,
    operationId: operation.id,
    status: 'credit_note_created',
    patch: { stripe_credit_note_id: creditNote.id },
  });

  await upsertCreditNoteMirror({
    supabaseAdmin,
    creditNote,
    environment,
    operationId: operation.id,
  });

  await syncSourceInvoiceAfterAdjustment({
    stripe,
    invoiceId,
    environment,
    operationId: operation.id,
  });

  if (body.action === 'credit_note_only') {
    await markCreditNoteOperationStep({
      supabaseAdmin,
      operationId: operation.id,
      status: 'completed',
    });
    return NextResponse.json({
      ok: true,
      operation_id: operation.id,
      status: 'completed',
      requires_attention: false,
      stripe_credit_note_id: creditNote.id,
    });
  }

  let reissueInvoice: Stripe.Invoice | null = null;
  let draftInvoice: Stripe.Invoice | null = null;

  try {
    const sourceInvoice = await stripe.invoices.retrieve(invoiceId);
    const stripeCustomerId = sourceInvoice.customer?.toString() ?? '';

    draftInvoice = await stripe.invoices.create(
      {
        customer: stripeCustomerId,
        collection_method: 'send_invoice',
        days_until_due: 30,
        auto_advance: false,
        pending_invoice_items_behavior: 'exclude',
        metadata: {
          source_invoice_id: invoiceId,
          source: 'admin_credit_reissue',
          customer_profile_id: customerProfileId,
        },
      },
      { idempotencyKey: `${idempotencyKey}:reissue` },
    );

    await stripe.invoiceItems.create(
      {
        customer: stripeCustomerId,
        invoice: draftInvoice.id,
        amount: body.new_amount_ore,
        currency: sourceInvoice.currency ?? 'sek',
        description: body.new_description,
      },
      { idempotencyKey: `${idempotencyKey}:invoice_item` },
    );

    const finalizedInvoice = await stripe.invoices.finalizeInvoice(
      draftInvoice.id,
      undefined,
      { idempotencyKey: `${idempotencyKey}:finalize` },
    );

    reissueInvoice = await stripe.invoices.sendInvoice(finalizedInvoice.id, undefined, {
      idempotencyKey: `${idempotencyKey}:send`,
    });

    await upsertInvoiceMirror({
      supabaseAdmin,
      invoice: reissueInvoice,
      environment,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Okant Stripe-fel';
    if (draftInvoice?.id) {
      try {
        await stripe.invoices.del(draftInvoice.id);
      } catch {
        // no-op
      }
    }
    await markCreditNoteOperationStep({
      supabaseAdmin,
      operationId: operation.id,
      status: 'failed',
      patch: {
        error_message: `reissue step: ${message}`,
        requires_attention: true,
        attention_reason:
          'Kreditnota skapades men ny faktura misslyckades. Skapa ersattningsfakturan manuellt i Stripe eller forsok igen.',
      },
    });
    return NextResponse.json(
      {
        error: message,
        operation_id: operation.id,
        status: 'failed',
        requires_attention: true,
        stripe_credit_note_id: creditNote.id,
      },
      { status: 502 },
    );
  }

  await markCreditNoteOperationStep({
    supabaseAdmin,
    operationId: operation.id,
    status: 'reissue_created',
    patch: { stripe_reissue_invoice_id: reissueInvoice?.id ?? null },
  });
  await markCreditNoteOperationStep({
    supabaseAdmin,
    operationId: operation.id,
    status: 'completed',
  });

  return NextResponse.json({
    ok: true,
    operation_id: operation.id,
    status: 'completed',
    requires_attention: false,
    stripe_credit_note_id: creditNote.id,
    stripe_reissue_invoice_id: reissueInvoice?.id ?? null,
  });
}
