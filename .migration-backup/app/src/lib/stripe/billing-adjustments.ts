// app/src/lib/stripe/billing-adjustments.ts

import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

export type CreditNoteOperationStatus =
  | 'pending'
  | 'credit_note_created'
  | 'reissue_created'
  | 'completed'
  | 'failed';

export type CreditNoteOperationType =
  | 'credit_note_only'
  | 'credit_note_and_reissue'
  | 'refund';

export interface CreditNoteOperationRow {
  id: string;
  operation_type: CreditNoteOperationType;
  customer_profile_id: string;
  source_invoice_id: string;
  status: CreditNoteOperationStatus;
  requires_attention: boolean;
  attention_reason: string | null;
  stripe_credit_note_id: string | null;
  stripe_reissue_invoice_id: string | null;
  stripe_refund_id: string | null;
  amount_ore: number | null;
  idempotency_key: string;
  error_message: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// State machine — operations table
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Skapar en pending-rad i credit_note_operations FÖRE något Stripe-anrop sker.
 * Detta är atomicity-ankaret: även om processen kraschar mitt i flödet har vi
 * en spårbar rad att rekonstruera från.
 *
 * Är idempotent: två anrop med samma idempotency_key returnerar samma rad.
 */
export async function createCreditNoteOperation(params: {
  supabaseAdmin: SupabaseClient;
  operationType: CreditNoteOperationType;
  customerProfileId: string;
  sourceInvoiceId: string;
  amountOre: number | null;
  environment: 'test' | 'live';
  idempotencyKey: string;
  createdBy: string | null;
}): Promise<CreditNoteOperationRow> {
  const { supabaseAdmin, idempotencyKey } = params;

  // Idempotent insert via on_conflict på unique key.
  const { data, error } = await supabaseAdmin
    .from('credit_note_operations')
    .upsert(
      {
        operation_type: params.operationType,
        customer_profile_id: params.customerProfileId,
        source_invoice_id: params.sourceInvoiceId,
        amount_ore: params.amountOre,
        idempotency_key: idempotencyKey,
        created_by: params.createdBy,
        status: 'pending',
      },
      { onConflict: 'idempotency_key', ignoreDuplicates: false },
    )
    .select('*')
    .single();

  if (error) {
    throw new Error(
      `Kunde inte skapa credit_note_operation (key=${idempotencyKey}): ${error.message}`,
    );
  }

  return data as CreditNoteOperationRow;
}

/**
 * Idempotent state-övergång. Användaren skickar in det DELTA som ska
 * appliceras (inte hela raden). Vi validerar att övergången är giltig.
 */
export async function markCreditNoteOperationStep(params: {
  supabaseAdmin: SupabaseClient;
  operationId: string;
  status: CreditNoteOperationStatus;
  patch?: Partial<
    Pick<
      CreditNoteOperationRow,
      | 'stripe_credit_note_id'
      | 'stripe_reissue_invoice_id'
      | 'stripe_refund_id'
      | 'requires_attention'
      | 'attention_reason'
      | 'error_message'
    >
  >;
}): Promise<CreditNoteOperationRow> {
  const { supabaseAdmin, operationId, status, patch = {} } = params;

  const update = {
    status,
    ...patch,
  };

  const { data, error } = await supabaseAdmin
    .from('credit_note_operations')
    .update(update)
    .eq('id', operationId)
    .select('*')
    .single();

  if (error) {
    throw new Error(
      `Kunde inte uppdatera credit_note_operation ${operationId}: ${error.message}`,
    );
  }

  return data as CreditNoteOperationRow;
}

export async function findCreditNoteOperationByIdempotencyKey(params: {
  supabaseAdmin: SupabaseClient;
  idempotencyKey: string;
}): Promise<CreditNoteOperationRow | null> {
  const { data, error } = await params.supabaseAdmin
    .from('credit_note_operations')
    .select('*')
    .eq('idempotency_key', params.idempotencyKey)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Kunde inte slå upp credit_note_operation: ${error.message}`,
    );
  }

  return (data as CreditNoteOperationRow | null) ?? null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Mirror-funktioner (behåller signatur, accepterar nu operationId)
// ──────────────────────────────────────────────────────────────────────────────

export async function upsertCreditNoteMirror(params: {
  supabaseAdmin: SupabaseClient;
  creditNote: Stripe.CreditNote;
  environment: 'test' | 'live';
  operationId?: string;
}): Promise<void> {
  const { supabaseAdmin, creditNote, environment, operationId } = params;
  void operationId;
  const mirrorCreditNote = creditNote as Stripe.CreditNote & {
    amount?: number | null;
    refund_amount?: number | null;
    credit_amount?: number | null;
  };

  const customerStripeId =
    typeof creditNote.customer === 'string'
      ? creditNote.customer
      : creditNote.customer?.id ?? null;

  let customerProfileId: string | null = null;
  if (customerStripeId) {
    const { data: profile } = await supabaseAdmin
      .from('customer_profiles')
      .select('id')
      .eq('stripe_customer_id', customerStripeId)
      .maybeSingle();
    customerProfileId = (profile?.id as string | undefined) ?? null;
  }

  const invoiceStripeId =
    typeof creditNote.invoice === 'string'
      ? creditNote.invoice
      : creditNote.invoice?.id ?? null;

  const { error } = await supabaseAdmin.from('stripe_credit_notes').upsert(
    {
      stripe_credit_note_id: creditNote.id,
      stripe_invoice_id: invoiceStripeId,
      stripe_customer_id: customerStripeId,
      customer_profile_id: customerProfileId,
      total: creditNote.total ?? mirrorCreditNote.amount ?? 0,
      refund_amount: mirrorCreditNote.refund_amount ?? 0,
      credit_amount: mirrorCreditNote.credit_amount ?? 0,
      out_of_band_amount: creditNote.out_of_band_amount ?? 0,
      currency: creditNote.currency,
      status: creditNote.status,
      reason: creditNote.reason ?? null,
      memo: creditNote.memo ?? null,
      effective_at: creditNote.effective_at
        ? new Date(creditNote.effective_at * 1000).toISOString()
        : null,
      raw: creditNote,
      environment,
      created_at: new Date(creditNote.created * 1000).toISOString(),
    },
    { onConflict: 'stripe_credit_note_id' },
  );

  if (error) {
    throw new Error(
      `Kunde inte spegla credit_note ${creditNote.id}: ${error.message}`,
    );
  }
}

export async function upsertRefundMirror(params: {
  supabaseAdmin: SupabaseClient;
  refund: Stripe.Refund;
  charge?: Stripe.Charge | null;
  environment: 'test' | 'live';
  operationId?: string;
}): Promise<void> {
  const { supabaseAdmin, refund, charge, environment, operationId } = params;
  void operationId;

  const chargeWithInvoice = charge as (Stripe.Charge & {
    invoice?: string | { id: string } | null;
  }) | null | undefined;

  const chargeId =
    typeof refund.charge === 'string'
      ? refund.charge
      : refund.charge?.id ?? charge?.id ?? null;

  const paymentIntentId =
    typeof refund.payment_intent === 'string'
      ? refund.payment_intent
      : refund.payment_intent?.id ?? charge?.payment_intent ?? null;

  const stripeInvoiceId =
    typeof chargeWithInvoice?.invoice === 'string'
      ? chargeWithInvoice.invoice
      : chargeWithInvoice?.invoice?.id ?? null;

  const stripeCustomerId =
    typeof charge?.customer === 'string'
      ? charge.customer
      : charge?.customer?.id ?? null;

  let customerProfileId: string | null = null;
  if (stripeCustomerId || stripeInvoiceId) {
    const { data: profile } = await supabaseAdmin
      .from('customer_profiles')
      .select('id')
      .or(
        [
          stripeCustomerId ? `stripe_customer_id.eq.${stripeCustomerId}` : null,
          stripeInvoiceId ? `id.in.(select customer_profile_id from invoices where stripe_invoice_id = '${stripeInvoiceId}')` : null,
        ]
          .filter(Boolean)
          .join(','),
      )
      .maybeSingle();
    customerProfileId = (profile?.id as string | undefined) ?? null;
  }

  const { error } = await supabaseAdmin.from('stripe_refunds').upsert(
    {
      stripe_refund_id: refund.id,
      stripe_charge_id: chargeId,
      stripe_payment_intent_id: paymentIntentId,
      stripe_invoice_id: stripeInvoiceId,
      stripe_customer_id: stripeCustomerId,
      customer_profile_id: customerProfileId,
      amount: refund.amount,
      currency: refund.currency,
      status: refund.status,
      reason: refund.reason ?? null,
      raw: refund,
      environment,
      created_at: new Date(refund.created * 1000).toISOString(),
    },
    { onConflict: 'stripe_refund_id' },
  );

  if (error) {
    throw new Error(
      `Kunde inte spegla refund ${refund.id}: ${error.message}`,
    );
  }
}
