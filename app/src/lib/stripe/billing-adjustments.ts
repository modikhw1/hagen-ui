import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { isMissingRelationError } from '@/lib/admin/schema-guards';

type CreditNoteMirrorInput = {
  supabaseAdmin: SupabaseClient;
  creditNote: Stripe.CreditNote;
  environment: 'test' | 'live';
};

type RefundMirrorInput = {
  supabaseAdmin: SupabaseClient;
  refund: Stripe.Refund;
  charge?: Stripe.Charge | null;
  environment: 'test' | 'live';
};

export async function upsertCreditNoteMirror({
  supabaseAdmin,
  creditNote,
  environment,
}: CreditNoteMirrorInput) {
  const creditNoteAmounts = creditNote as Stripe.CreditNote & {
    refund_amount?: number | null;
    credit_amount?: number | null;
  };
  const stripeInvoiceId =
    typeof creditNote.invoice === 'string' ? creditNote.invoice : creditNote.invoice?.id ?? null;
  const stripeCustomerId =
    typeof creditNote.customer === 'string' ? creditNote.customer : creditNote.customer?.id ?? null;
  const customerProfileId = await resolveCustomerProfileId(supabaseAdmin, {
    stripeCustomerId,
    stripeInvoiceId,
  });

  const result = await (((supabaseAdmin.from('stripe_credit_notes' as never) as never) as {
    upsert: (
      value: Record<string, unknown>,
      options: { onConflict: string },
    ) => Promise<{ error: { message?: string } | null }>;
  }).upsert({
    stripe_credit_note_id: creditNote.id,
    stripe_invoice_id: stripeInvoiceId,
    stripe_customer_id: stripeCustomerId,
    customer_profile_id: customerProfileId,
    total: creditNote.total ?? 0,
    refund_amount: creditNoteAmounts.refund_amount ?? 0,
    credit_amount: creditNoteAmounts.credit_amount ?? 0,
    out_of_band_amount: creditNote.out_of_band_amount ?? 0,
    currency: creditNote.currency ?? 'sek',
    reason: creditNote.reason ?? null,
    memo: creditNote.memo ?? null,
    status: creditNote.status ?? 'issued',
    effective_at: creditNote.effective_at
      ? new Date(creditNote.effective_at * 1000).toISOString()
      : null,
    raw: creditNote,
    environment,
  }, { onConflict: 'stripe_credit_note_id' }));

  if (result.error && !isMissingRelationError(result.error.message)) {
    throw new Error(result.error.message || 'Kunde inte spegla credit note');
  }
}

export async function upsertRefundMirror({
  supabaseAdmin,
  refund,
  charge,
  environment,
}: RefundMirrorInput) {
  const chargeWithInvoice = charge as (Stripe.Charge & {
    invoice?: string | { id: string } | null;
  }) | null | undefined;
  const stripeChargeId =
    typeof refund.charge === 'string' ? refund.charge : charge?.id ?? null;
  const stripePaymentIntentId =
    typeof refund.payment_intent === 'string'
      ? refund.payment_intent
      : refund.payment_intent?.id ?? null;
  const stripeInvoiceId =
    typeof chargeWithInvoice?.invoice === 'string'
      ? chargeWithInvoice.invoice
      : chargeWithInvoice?.invoice?.id ?? null;
  const stripeCustomerId =
    typeof charge?.customer === 'string' ? charge.customer : charge?.customer?.id ?? null;
  const customerProfileId = await resolveCustomerProfileId(supabaseAdmin, {
    stripeCustomerId,
    stripeInvoiceId,
  });

  const result = await (((supabaseAdmin.from('stripe_refunds' as never) as never) as {
    upsert: (
      value: Record<string, unknown>,
      options: { onConflict: string },
    ) => Promise<{ error: { message?: string } | null }>;
  }).upsert({
    stripe_refund_id: refund.id,
    stripe_charge_id: stripeChargeId,
    stripe_payment_intent_id: stripePaymentIntentId,
    stripe_invoice_id: stripeInvoiceId,
    stripe_customer_id: stripeCustomerId,
    customer_profile_id: customerProfileId,
    amount: refund.amount ?? 0,
    currency: refund.currency ?? 'sek',
    reason: refund.reason ?? null,
    status: refund.status ?? 'pending',
    raw: refund,
    environment,
  }, { onConflict: 'stripe_refund_id' }));

  if (result.error && !isMissingRelationError(result.error.message)) {
    throw new Error(result.error.message || 'Kunde inte spegla refund');
  }
}

export async function listInvoiceAdjustments(
  supabaseAdmin: SupabaseClient,
  stripeInvoiceId: string,
) {
  const [creditNotesResult, refundsResult] = await Promise.all([
    (((supabaseAdmin.from('stripe_credit_notes' as never) as never) as {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          order: (column: string, options: { ascending: boolean }) => Promise<{
            data: Array<Record<string, unknown>> | null;
            error: { message?: string } | null;
          }>;
        };
      };
    }).select(
      'stripe_credit_note_id, total, refund_amount, credit_amount, out_of_band_amount, currency, reason, memo, status, effective_at, created_at',
    )).eq('stripe_invoice_id', stripeInvoiceId).order('created_at', { ascending: false }),
    (((supabaseAdmin.from('stripe_refunds' as never) as never) as {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          order: (column: string, options: { ascending: boolean }) => Promise<{
            data: Array<Record<string, unknown>> | null;
            error: { message?: string } | null;
          }>;
        };
      };
    }).select(
      'stripe_refund_id, amount, currency, reason, status, created_at',
    )).eq('stripe_invoice_id', stripeInvoiceId).order('created_at', { ascending: false }),
  ]);

  const schemaWarnings: string[] = [];

  if (creditNotesResult.error && !isMissingRelationError(creditNotesResult.error.message)) {
    throw new Error(creditNotesResult.error.message || 'Kunde inte hamta credit notes');
  }
  if (refundsResult.error && !isMissingRelationError(refundsResult.error.message)) {
    throw new Error(refundsResult.error.message || 'Kunde inte hamta refunds');
  }

  if (creditNotesResult.error && isMissingRelationError(creditNotesResult.error.message)) {
    schemaWarnings.push('Tabellen stripe_credit_notes saknas i databasen.');
  }
  if (refundsResult.error && isMissingRelationError(refundsResult.error.message)) {
    schemaWarnings.push('Tabellen stripe_refunds saknas i databasen.');
  }

  return {
    creditNotes: creditNotesResult.data ?? [],
    refunds: refundsResult.data ?? [],
    schemaWarnings,
  };
}

async function resolveCustomerProfileId(
  supabaseAdmin: SupabaseClient,
  lookup: {
    stripeCustomerId?: string | null;
    stripeInvoiceId?: string | null;
  },
) {
  if (lookup.stripeInvoiceId) {
    const invoiceLookup = await supabaseAdmin
      .from('invoices')
      .select('customer_profile_id')
      .eq('stripe_invoice_id', lookup.stripeInvoiceId)
      .maybeSingle();

    if (!invoiceLookup.error && invoiceLookup.data?.customer_profile_id) {
      return invoiceLookup.data.customer_profile_id;
    }
  }

  if (lookup.stripeCustomerId) {
    const customerLookup = await supabaseAdmin
      .from('customer_profiles')
      .select('id')
      .eq('stripe_customer_id', lookup.stripeCustomerId)
      .maybeSingle();

    if (!customerLookup.error) {
      return customerLookup.data?.id ?? null;
    }
  }

  return null;
}
