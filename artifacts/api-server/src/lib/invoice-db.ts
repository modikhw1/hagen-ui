/**
 * Typed DB helper wrappers for invoice-related tables.
 *
 * The Supabase client in this project is created without generated database
 * types (createClient<Database> is not used), so the query builder does not
 * know column names for write operations.  Each function below encapsulates a
 * single table access and accepts/returns strongly-typed interfaces, keeping
 * route handlers free of casting.
 */

import { createSupabaseAdmin } from './supabase.js';

type Supabase = ReturnType<typeof createSupabaseAdmin>;

// ── Row interfaces ─────────────────────────────────────────────────────────

export interface InvoiceRow {
  id: string;
  stripe_invoice_id: string | null;
  stripe_subscription_id: string | null;
  customer_profile_id: string | null;
  amount_due: number | null;
  amount_paid: number | null;
  currency: string | null;
  invoice_number: string | null;
  status: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  due_date: string | null;
  paid_at: string | null;
  environment: string | null;
  created_at: string | null;
}

export interface InvoicePatch {
  status?: string;
  amount_due?: number;
  amount_paid?: number;
  paid_at?: string;
  hosted_invoice_url?: string;
  invoice_pdf?: string;
}

export interface LineItemRow {
  id: string;
  description: string | null;
  amount: number | null;
  quantity: number | null;
}

export interface LineItemInsert {
  stripe_line_item_id: string;
  stripe_invoice_id: string;
  description: string;
  amount: number;
  quantity: number;
}

export interface CreditNoteOpRow {
  id: string;
  operation_type: string;
  status: string;
  requires_attention: boolean;
  attention_reason: string | null;
  stripe_credit_note_id: string | null;
  stripe_reissue_invoice_id: string | null;
  error_message: string | null;
  idempotency_key: string;
  created_at: string;
}

export interface CustomerProfileRow {
  business_name: string | null;
  stripe_subscription_id: string | null;
}

export interface StripeSyncEventRow {
  id: string;
  event_type: string;
  received_at: string;
  status: string;
  error_message: string | null;
}

// ── Per-table access helpers ───────────────────────────────────────────────

const INVOICE_SELECT =
  'id, stripe_invoice_id, stripe_subscription_id, customer_profile_id, amount_due, amount_paid, currency, invoice_number, status, hosted_invoice_url, invoice_pdf, due_date, paid_at, environment, created_at';

/** Look up a single invoice by stripe_invoice_id or UUID primary key. */
export async function findInvoice(
  supabase: Supabase,
  invoiceId: string,
): Promise<{ row: InvoiceRow | null; error: { message: string } | null }> {
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invoiceId);
  const db = supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }> };
      };
    };
  };
  const { data, error } = await db
    .from('invoices')
    .select(INVOICE_SELECT)
    .eq(isUuid ? 'id' : 'stripe_invoice_id', invoiceId)
    .maybeSingle();
  return { row: data as InvoiceRow | null, error };
}

/** Update invoice columns by stripe_invoice_id. */
export async function updateInvoice(
  supabase: Supabase,
  stripeInvoiceId: string,
  patch: InvoicePatch,
): Promise<{ error: { message: string } | null }> {
  const db = supabase as unknown as {
    from: (t: string) => {
      update: (vals: InvoicePatch) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  const { error } = await db.from('invoices').update(patch).eq('stripe_invoice_id', stripeInvoiceId);
  return { error };
}

/** Fetch line items for a stripe invoice. */
export async function findLineItems(
  supabase: Supabase,
  stripeInvoiceId: string,
): Promise<LineItemRow[]> {
  const db = supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => Promise<{ data: unknown[] | null; error: unknown }>;
      };
    };
  };
  const { data } = await db
    .from('invoice_line_items')
    .select('id, description, amount, quantity')
    .eq('stripe_invoice_id', stripeInvoiceId);
  return (data ?? []) as LineItemRow[];
}

/** Insert a single line item row. */
export async function insertLineItem(
  supabase: Supabase,
  row: LineItemInsert,
): Promise<{ error: { message: string } | null }> {
  const db = supabase as unknown as {
    from: (t: string) => {
      insert: (vals: LineItemInsert) => Promise<{ error: { message: string } | null }>;
    };
  };
  const { error } = await db.from('invoice_line_items').insert(row);
  return { error };
}

/** Fetch credit-note operations for a stripe invoice. */
export async function findCreditNoteOps(
  supabase: Supabase,
  stripeInvoiceId: string,
): Promise<CreditNoteOpRow[]> {
  const db = supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          order: (col: string, opts: { ascending: boolean }) => {
            limit: (n: number) => Promise<{ data: unknown[] | null }>;
          };
        };
      };
    };
  };
  const { data } = await db
    .from('credit_note_operations')
    .select(
      'id, operation_type, status, requires_attention, attention_reason, stripe_credit_note_id, stripe_reissue_invoice_id, error_message, idempotency_key, created_at',
    )
    .eq('source_invoice_id', stripeInvoiceId)
    .order('created_at', { ascending: false })
    .limit(20);
  return (data ?? []) as CreditNoteOpRow[];
}

/** Fetch customer profile fields needed for invoice detail. */
export async function findCustomerProfile(
  supabase: Supabase,
  customerId: string,
): Promise<CustomerProfileRow | null> {
  const db = supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: unknown }> };
      };
    };
  };
  const { data } = await db
    .from('customer_profiles')
    .select('business_name, stripe_subscription_id')
    .eq('id', customerId)
    .maybeSingle();
  return data as CustomerProfileRow | null;
}

/** Fetch Stripe webhook events for an invoice object (table may not exist). */
export async function findStripeSyncEvents(
  supabase: Supabase,
  stripeInvoiceId: string,
): Promise<StripeSyncEventRow[]> {
  try {
    const db = supabase as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            order: (col: string, opts: { ascending: boolean }) => {
              limit: (n: number) => Promise<{ data: unknown[] | null }>;
            };
          };
        };
      };
    };
    const { data } = await db
      .from('stripe_sync_events')
      .select('id, event_type, received_at, status, error_message')
      .eq('object_id', stripeInvoiceId)
      .order('received_at', { ascending: true })
      .limit(50);
    return (data ?? []) as StripeSyncEventRow[];
  } catch {
    return [];
  }
}
