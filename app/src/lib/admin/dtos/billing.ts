import { z } from 'zod';

export const customerInvoiceLineItemSchema = z.object({
  description: z.string(),
  amount: z.number(),
});

export const customerInvoiceSchema = z.object({
  id: z.string(),
  stripe_invoice_id: z.string().nullable(),
  amount_due: z.number().nullable(),
  status: z.string(),
  created_at: z.string(),
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

export type CustomerInvoice = z.infer<typeof customerInvoiceSchema>;
export type CustomerSubscription = z.infer<typeof customerSubscriptionSchema>;
