import { z } from 'zod';

const firstInvoiceBehaviorSchema = z.enum(['prorated', 'full', 'free_until_anchor']);
const discountTypeSchema = z.enum(['none', 'percent', 'amount', 'free_months']);
const pricingStatusSchema = z.enum(['fixed', 'unknown']);
const subscriptionIntervalSchema = z.enum(['month', 'quarter', 'year']);
const customerStatusSchema = z.enum([
  'pending',
  'pending_invoice',
  'active',
  'past_due',
  'cancelled',
  'archived',
  'invited',
  'agreed',
]);

const nullableDateSchema = z.string().trim().optional().nullable();

export const customerInviteSchema = z.object({
  business_name: z.string().trim().min(1, 'Företagsnamn krävs').max(200),
  contact_email: z.string().trim().email('Ogiltig e-postadress').max(255),
  customer_contact_name: z.string().trim().max(200).optional().nullable(),
  phone: z.string().trim().max(80).optional().nullable(),
  tiktok_profile_url: z.string().trim().max(2000).optional().nullable(),
  account_manager: z.string().trim().max(200).optional().nullable(),
  monthly_price: z.number().min(0).default(0),
  pricing_status: pricingStatusSchema.default('fixed'),
  contract_start_date: nullableDateSchema,
  billing_day_of_month: z.number().min(1).max(28).default(25),
  first_invoice_behavior: firstInvoiceBehaviorSchema.default('prorated'),
  waive_days_until_billing: z.boolean().optional().default(false),
  discount_type: discountTypeSchema.default('none'),
  discount_value: z.number().min(0).default(0),
  discount_duration_months: z.number().min(1).default(1),
  discount_start_date: nullableDateSchema,
  discount_end_date: nullableDateSchema,
  upcoming_monthly_price: z.number().min(0).optional().nullable(),
  upcoming_price_effective_date: nullableDateSchema,
  subscription_interval: subscriptionIntervalSchema.default('month'),
  invoice_text: z.string().max(2000).optional().nullable(),
  scope_items: z.array(z.string()).optional().default([]),
}).strict();

export const sendInviteActionSchema = customerInviteSchema.omit({
  discount_type: true,
  discount_value: true,
  discount_duration_months: true,
  discount_start_date: true,
  discount_end_date: true,
}).extend({
  action: z.literal('send_invite'),
}).strict();

export const createCustomerSchema = customerInviteSchema.extend({
  price_start_date: nullableDateSchema,
  price_end_date: nullableDateSchema,
  contacts: z.array(z.unknown()).optional().default([]),
  profile_data: z.record(z.string(), z.unknown()).optional().default({}),
  game_plan: z.record(z.string(), z.unknown()).optional().default({}),
  concepts: z.array(z.unknown()).optional().default([]),
  send_invite: z.boolean().optional().default(false),
  send_invite_now: z.boolean().optional().default(false),
}).strict();

export const customerPatchSchema = z.object({
  business_name: z.string().trim().min(1).max(200).optional(),
  contact_email: z.string().trim().email().max(255).optional(),
  customer_contact_name: z.string().trim().max(200).optional().nullable(),
  phone: z.string().trim().max(80).optional().nullable(),
  paused_until: nullableDateSchema,
  account_manager: z.string().trim().max(200).optional().nullable(),
  monthly_price: z.number().min(0).max(1_000_000).optional(),
  pricing_status: pricingStatusSchema.optional(),
  contract_start_date: nullableDateSchema,
  billing_day_of_month: z.number().int().min(1).max(28).optional(),
  first_invoice_behavior: firstInvoiceBehaviorSchema.optional(),
  discount_type: discountTypeSchema.optional(),
  discount_value: z.number().min(0).max(1_000_000).optional(),
  discount_duration_months: z.number().int().min(1).max(120).optional().nullable(),
  discount_start_date: nullableDateSchema,
  discount_end_date: nullableDateSchema,
  upcoming_monthly_price: z.number().min(0).max(1_000_000).optional().nullable(),
  upcoming_price_effective_date: nullableDateSchema,
  subscription_interval: subscriptionIntervalSchema.optional(),
  invoice_text: z.string().max(2000).optional().nullable(),
  scope_items: z.array(z.string()).optional(),
  status: customerStatusSchema.optional(),
  logo_url: z.string().trim().url().max(2000).optional().nullable(),
  brief: z.record(z.string(), z.unknown()).optional().nullable(),
  game_plan: z.record(z.string(), z.unknown()).optional().nullable(),
}).strict();

export type CustomerInvitePayload = z.infer<typeof customerInviteSchema>;
export type CreateCustomerPayload = z.infer<typeof createCustomerSchema>;
export type CustomerPatchPayload = z.infer<typeof customerPatchSchema>;
