import { z } from 'zod';

const customerStatusSchema = z.enum([
  'active',
  'invited',
  'paused',
  'archived',
  'churned',
  'lead',
  'agreed',
  'pending',
  'pending_invoice',
  'pending_payment',
  'past_due',
]);
const derivedCustomerStatusSchema = z.enum([
  'invited_new',
  'invited_stale',
  'live_underfilled',
  'live_healthy',
  'new',
  'invited',
  'live',
  'paused',
  'underfilled',
  'escalated',
  'archived',
]);
const onboardingStateSchema = z.enum(['invited', 'cm_ready', 'live', 'settled']).nullable();
const pricingStatusSchema = z.enum(['fixed', 'unknown']).nullable();
const subscriptionIntervalSchema = z.enum(['month', 'quarter', 'year']).nullable();

export const customerListSchema = z.object({
  id: z.string(),
  business_name: z.string(),
  contact_email: z.string(),
  customer_contact_name: z.string().nullable(),
  phone: z.string().nullable(),
  account_manager: z.string().nullable(),
  account_manager_profile_id: z.string().nullable(),
  cm_avatar_url: z.string().nullable().optional(),
  cm_initial_color: z.string().nullable().optional(),
  monthly_price: z.number().nullable(),
  subscription_interval: subscriptionIntervalSchema.optional(),
  pricing_status: pricingStatusSchema,
  status: customerStatusSchema,
  derived_status: derivedCustomerStatusSchema.optional(),
  created_at: z.string(),
  agreed_at: z.string().nullable(),
  concepts_per_week: z.number().nullable(),
  expected_concepts_per_week: z.number().nullable().optional(),
  paused_until: z.string().nullable(),
  onboarding_state: onboardingStateSchema,
  onboarding_state_changed_at: z.string().nullable().optional(),
  tiktok_handle: z.string().nullable(),
  next_invoice_date: z.string().nullable(),
  stripe_customer_id: z.string().nullable(),
  stripe_subscription_id: z.string().nullable(),
  preview_image_url: z.string().nullable().optional(),
});

export const customerBufferSchema = z.object({
  customer_id: z.string(),
  assigned_cm_id: z.string().nullable(),
  concepts_per_week: z.number().nullable(),
  paused_until: z.string().nullable(),
  latest_planned_publish_date: z.string().nullable(),
  last_published_at: z.string().nullable(),
});

export const customerListPayloadSchema = z.object({
  customers: z.array(customerListSchema),
});

export const customerBufferPayloadSchema = z.object({
  bufferRows: z.array(customerBufferSchema).default([]),
});

export const customerAttentionSnoozeSchema = z.object({
  subject_type: z.enum([
    'onboarding',
    'customer_blocking',
    'invoice',
    'cm_low_activity',
    'cm_notification',
    'demo_response',
    'cm_assignment',
    'subscription_pause_resume',
    'cm_activity',
  ]),
  subject_id: z.string(),
  snoozed_until: z.string().nullable(),
  released_at: z.string().nullable(),
  note: z.string().nullable(),
});

export const customerCoverageAbsenceSchema = z.object({
  id: z.string(),
  cm_id: z.string(),
  cm_name: z.string().nullable(),
  backup_cm_id: z.string().nullable(),
  backup_cm_name: z.string().nullable(),
  absence_type: z.string(),
  compensation_mode: z.enum(['covering_cm', 'primary_cm']),
  starts_on: z.string(),
  ends_on: z.string(),
  note: z.string().nullable(),
  is_active: z.boolean(),
  is_upcoming: z.boolean(),
});

const upcomingPriceChangeSchema = z.union([
  z
    .object({
      effective_date: z.string(),
      price_ore: z.number(),
    })
    .strict(),
  z
    .object({
      effective_date: z.string(),
      price: z.number(),
    })
    .strict()
    .transform(({ effective_date, price }) => ({
      effective_date,
      price_ore: Math.round(price * 100),
    })),
]);
const nullableUpcomingPriceChangeSchema = z.preprocess(
  (value) => (value === undefined ? null : value),
  upcomingPriceChangeSchema.nullable(),
);

export const customerDetailSchema = z.object({
  id: z.string(),
  business_name: z.string(),
  contact_email: z.string(),
  customer_contact_name: z.string().nullable(),
  phone: z.string().nullable(),
  account_manager: z.string().nullable(),
  account_manager_profile_id: z.string().nullable(),
  cm_avatar_url: z.string().nullable().optional(),
  cm_initial_color: z.string().nullable().optional(),
  monthly_price: z.number().nullable(),
  subscription_interval: z.enum(['month', 'quarter', 'year']),
  pricing_status: z.enum(['fixed', 'unknown']),
  status: customerStatusSchema,
  derived_status: derivedCustomerStatusSchema.optional(),
  created_at: z.string(),
  invited_at: z.string().nullable(),
  agreed_at: z.string().nullable(),
  next_invoice_date: z.string().nullable(),
  contract_start_date: z.string().nullable(),
  billing_day_of_month: z.number().nullable(),
  upcoming_price_change: nullableUpcomingPriceChangeSchema,
  discount_type: z.enum(['none', 'percent', 'amount', 'free_months']).nullable(),
  discount_value: z.number().nullable(),
  discount_duration_months: z.number().nullable(),
  discount_ends_at: z.string().nullable(),
  tiktok_handle: z.string().nullable(),
  tiktok_profile_url: z.string().nullable(),
  tiktok_user_id: z.string().nullable(),
  preview_image_url: z.string().nullable().optional(),
  concepts_per_week: z.number().nullable(),
  expected_concepts_per_week: z.number().nullable(),
  paused_until: z.string().nullable(),
  onboarding_state: onboardingStateSchema,
  onboarding_state_changed_at: z.string().nullable(),
  upload_schedule: z.array(z.string()).nullable(),
  last_upload_at: z.string().nullable(),
  latest_planned_publish_date: z.string().nullable(),
  last_published_at: z.string().nullable(),
  last_history_sync_at: z.string().nullable(),
  pending_history_advance_at: z.string().nullable(),
  stripe_customer_id: z.string().nullable(),
  stripe_subscription_id: z.string().nullable(),
  attention_snoozes: z.array(customerAttentionSnoozeSchema),
  coverage_absences: z.array(customerCoverageAbsenceSchema),
});

export const customerDetailPayloadSchema = z.object({
  customer: customerDetailSchema,
});

export const customerActivityEntrySchema = z.object({
  id: z.string(),
  at: z.string(),
  kind: z.enum(['audit', 'cm_activity', 'game_plan', 'concept']),
  entityType: z.string().nullable().optional(),
  title: z.string(),
  description: z.string(),
  actorLabel: z.string().nullable(),
  actorRole: z.string().nullable(),
});

export const customerActivityPayloadSchema = z.object({
  activities: z.array(customerActivityEntrySchema).default([]),
  schemaWarnings: z.array(z.string()).default([]),
});

export const tiktokVideoSchema = z.object({
  video_id: z.string(),
  uploaded_at: z.string(),
  views: z.number(),
  likes: z.number(),
  comments: z.number(),
  shares: z.number(),
  share_url: z.string().nullable(),
  cover_image_url: z.string().nullable(),
});

export const tikTokStatsSchema = z.object({
  followers: z.number(),
  follower_delta_7d: z.number(),
  follower_delta_30d: z.number(),
  avg_views_7d: z.number(),
  avg_views_30d: z.number(),
  engagement_rate: z.number(),
  total_videos: z.number(),
  videos_last_7d: z.number(),
  follower_history_30d: z.array(z.number()),
  views_history_30d: z.array(z.number()),
  snapshot_dates_30d: z.array(z.string()),
  recent_videos: z.array(tiktokVideoSchema),
  window_end_iso: z.string(),
});

export type CustomerListRow = z.infer<typeof customerListSchema>;
export type CustomerBufferRow = z.infer<typeof customerBufferSchema>;
export type CustomerListPayload = z.infer<typeof customerListPayloadSchema>;
export type CustomerBufferPayload = z.infer<typeof customerBufferPayloadSchema>;
export type CustomerDetail = z.infer<typeof customerDetailSchema>;
export type CustomerActivityEntry = z.infer<typeof customerActivityEntrySchema>;
export type CustomerActivityPayload = z.infer<typeof customerActivityPayloadSchema>;
export type TikTokStats = z.infer<typeof tikTokStatsSchema>;
export type TikTokVideo = z.infer<typeof tiktokVideoSchema>;
