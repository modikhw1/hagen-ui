import { z } from 'zod';

const envFilterSchema = z.enum(['all', 'test', 'live']);

export const customerInvoiceLineItemSchema = z.object({
  stripe_line_item_id: z.string().nullable().optional(),
  description: z.string(),
  amount: z.number(),
  currency: z.string().default('sek').optional(),
  quantity: z.number().int().min(1).default(1).optional(),
  unit_amount_ore: z.number().nullable().optional(),
  period_start: z.string().nullable().optional(),
  period_end: z.string().nullable().optional(),
});

export const customerInvoiceSchema = z.object({
  id: z.string(),
  stripe_invoice_id: z.string().nullable(),
  amount_due: z.number().default(0),
  status: z.string(),
  created_at: z.string(),
  currency: z.string().default('sek').optional(),
  subtotal_ore: z.number().optional(),
  tax_ore: z.number().optional(),
  total_ore: z.number().optional(),
  refund_state: z.string().nullable().optional(),
  display_status: z.string().optional(),
  due_date: z.string().nullable().optional(),
  hosted_invoice_url: z.string().nullable().optional(),
  line_items: z.array(customerInvoiceLineItemSchema).optional(),
});

export const customerInvoicesPayloadSchema = z.object({
  invoices: z.array(customerInvoiceSchema).default([]),
});

export const customerSubscriptionSchema = z.object({
  stripe_subscription_id: z.string(),
  status: z.string(),
  cancel_at_period_end: z.boolean(),
  current_period_end: z.string().nullable(),
  current_period_start: z.string().nullable(),
});

export const customerSubscriptionPayloadSchema = z.object({
  subscription: customerSubscriptionSchema.nullable(),
});

export const billingPaginationSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  total: z.number().int().min(0),
  pageCount: z.number().int().min(0),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

export const billingInvoiceListItemSchema = z.object({
  id: z.string(),
  stripe_invoice_id: z.string().nullable(),
  customer_profile_id: z.string().nullable(),
  stripe_customer_id: z.string().nullable(),
  amount_due: z.number(),
  amount_paid: z.number(),
  subtotal_ore: z.number().optional(),
  tax_ore: z.number().optional(),
  total_ore: z.number().optional(),
  status: z.string(),
  environment: z.string().nullable(),
  created_at: z.string(),
  due_date: z.string().nullable(),
  hosted_invoice_url: z.string().nullable(),
  invoice_number: z.string().nullable().optional(),
  payment_intent_id: z.string().nullable().optional(),
  dispute_status: z.string().nullable().optional(),
  currency: z.string().default('sek'),
  customer_name: z.string(),
  refunded_ore: z.number(),
  refund_state: z.string().nullable(),
  display_status: z.string(),
  line_item_count: z.number().int().min(0),
});

export const billingInvoiceLineItemSchema = z.object({
  stripe_line_item_id: z.string().nullable(),
  description: z.string(),
  amount: z.number(),
  currency: z.string().default('sek'),
  quantity: z.number().int().min(1).default(1),
  unit_amount_ore: z.number().nullable().optional(),
  period_start: z.string().nullable(),
  period_end: z.string().nullable(),
});

export const billingInvoiceLinesResponseSchema = z.object({
  invoiceId: z.string(),
  lineItems: z.array(billingInvoiceLineItemSchema).default([]),
});

export const billingInvoicesResponseSchema = z.object({
  invoices: z.array(billingInvoiceListItemSchema).default([]),
  environment: envFilterSchema,
  pagination: billingPaginationSchema,
  summary: z.object({
    openOre: z.number(),
    paidOre: z.number(),
    partiallyRefundedCount: z.number().int().min(0),
    invoicesNeedingActionCount: z.number().int().min(0).optional(),
    totalCount: z.number().int().min(0),
  }),
});

export const billingSubscriptionListItemSchema = z.object({
  id: z.string(),
  customer_profile_id: z.string().nullable(),
  stripe_customer_id: z.string().nullable(),
  stripe_subscription_id: z.string().nullable(),
  status: z.string(),
  amount: z.number(),
  currency: z.string(),
  interval: z.string().nullable(),
  interval_count: z.number().int().min(1),
  interval_label: z.string(),
  created: z.string(),
  current_period_start: z.string().nullable(),
  current_period_end: z.string().nullable(),
  cancel_at_period_end: z.boolean(),
  canceled_at: z.string().nullable(),
  environment: z.string().nullable(),
  customer_name: z.string(),
});

export const billingSubscriptionsResponseSchema = z.object({
  subscriptions: z.array(billingSubscriptionListItemSchema).default([]),
  environment: envFilterSchema,
  pagination: billingPaginationSchema,
  summary: z.object({
    activeCount: z.number().int().min(0),
    expiringCount: z.number().int().min(0),
    mrrOre: z.number(),
  }),
});

export const billingHealthSyncEntrySchema = z.object({
  id: z.string(),
  event_type: z.string(),
  object_type: z.string().nullable(),
  object_id: z.string().nullable(),
  status: z.string(),
  error_message: z.string().nullable(),
  created_at: z.string(),
  environment: z.string().nullable(),
});

export const billingHealthFailureEntrySchema = z.object({
  id: z.string(),
  event_type: z.string(),
  status: z.string(),
  error_message: z.string().nullable(),
  created_at: z.string(),
});

export const billingHealthResponseSchema = z.object({
  environment: z.enum(['test', 'live']),
  schemaWarnings: z.array(z.string()).optional(),
  stats: z.object({
    mirroredInvoices: z.number().int().min(0),
    mirroredSubscriptions: z.number().int().min(0),
    failedSyncs: z.number().int().min(0),
    latestSuccessfulSyncAt: z.string().nullable(),
  }),
  recentSyncs: z.array(billingHealthSyncEntrySchema).default([]),
  recentFailures: z.array(billingHealthFailureEntrySchema).default([]),
});

export type CustomerInvoice = z.infer<typeof customerInvoiceSchema>;
export type CustomerSubscription = z.infer<typeof customerSubscriptionSchema>;
export type BillingInvoicesResponse = z.infer<typeof billingInvoicesResponseSchema>;
export type BillingSubscriptionsResponse = z.infer<typeof billingSubscriptionsResponseSchema>;
export type BillingHealthResponse = z.infer<typeof billingHealthResponseSchema>;
export type BillingInvoiceLinesResponse = z.infer<typeof billingInvoiceLinesResponseSchema>;
