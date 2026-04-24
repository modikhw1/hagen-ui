import { z } from 'zod';

export const teamMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable().optional(),
  commission_rate: z.number().nullable().optional(),
  profile_id: z.string().nullable(),
  is_active: z.boolean(),
  avatar_url: z.string().nullable(),
  bio: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  expertise: z.array(z.string()).nullable().optional(),
  start_date: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  invited_at: z.string().nullable().optional(),
});

export const teamMembersPayloadSchema = z.object({
  members: z.array(teamMemberSchema).default([]),
});

export const teamMemberLiteSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  role: z.string().nullable().optional(),
  is_active: z.boolean(),
  commission_rate: z.number().nullable().default(0),
  avatar_url: z.string().nullable(),
});

export const teamMembersLitePayloadSchema = z.object({
  members: z.array(teamMemberLiteSchema).default([]),
});

export const teamCustomerSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  business_name: z.string(),
  mrr_ore: z.number().optional(),
  monthly_price: z.number(),
  status: z.string(),
  paused_until: z.string().nullable().optional(),
  followers: z.number(),
  flow_score: z.number().nullable().optional(),
  videos_last_7d: z.number(),
  engagement_rate: z.number(),
  last_upload_at: z.string().nullable(),
  covered_by_absence: z.boolean(),
  payout_cm_id: z.string().nullable(),
});

export const dailyDotSchema = z.object({
  date: z.coerce.date(),
  count: z.number(),
  level: z.enum(['empty', 'low', 'mid', 'high', 'peak']),
  intensity: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
  isWeekend: z.boolean(),
});

export const teamMemberViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  city: z.string().nullable(),
  bio: z.string().nullable(),
  avatar_url: z.string().nullable(),
  role: z.string(),
  is_active: z.boolean(),
  commission_rate: z.number(),
  active_absence: z
    .object({
      id: z.string(),
      cm_id: z.string(),
      customer_profile_id: z.string().nullable().optional(),
      backup_cm_id: z.string().nullable(),
      backup_cm_name: z.string().nullable().optional(),
      cm_name: z.string().nullable().optional(),
      absence_type: z.string(),
      compensation_mode: z.enum(['covering_cm', 'primary_cm']),
      starts_on: z.string(),
      ends_on: z.string(),
      note: z.string().nullable(),
      is_active: z.boolean(),
      is_upcoming: z.boolean(),
    })
    .nullable(),
  customers: z.array(teamCustomerSchema),
  assignmentHistory: z.array(
    z.object({
      id: z.string(),
      customer_id: z.string(),
      customer_name: z.string(),
      starts_on: z.string().optional(),
      ends_on: z.string().nullable().optional(),
      valid_from: z.string(),
      valid_to: z.string().nullable(),
      handover_note: z.string().nullable(),
      scheduled_effective_date: z.string().nullable(),
    }),
  ),
  customerCount: z.number(),
  mrr_ore: z.number(),
  activityCount: z.number(),
  activeWorkflowSteps: z.number(),
  activityRatio: z.number(),
  activitySeries: z.array(z.number()),
  activityDots: z.array(dailyDotSchema),
  activitySummary: z.object({
    activeDays: z.number(),
    total: z.number(),
    median: z.number(),
    longestRest: z.number(),
  }),
  activityBaseline: z.number(),
  activityAverage7d: z.number(),
  activityDeviation: z.number(),
  customerLoadLevel: z.enum(['ok', 'warn', 'overload']),
  customerLoadClass: z.enum(['ok', 'warn', 'overload']).optional(),
  customerLoadLabel: z.string(),
  overloaded: z.boolean(),
  isCovering: z.boolean().optional(),
});

export const teamOverviewSchema = z.object({
  members: z.array(teamMemberViewSchema),
  asOfDate: z.string(),
  schemaWarnings: z.array(z.string()).optional(),
  buildDurationMs: z.number().optional(),
});

export type TeamMemberRow = z.infer<typeof teamMemberSchema>;
export type TeamMemberLite = z.infer<typeof teamMemberLiteSchema>;
export type TeamCustomer = z.infer<typeof teamCustomerSchema>;
export type DailyDot = z.infer<typeof dailyDotSchema>;
export type TeamMemberView = z.infer<typeof teamMemberViewSchema>;
export type TeamOverviewDTO = z.infer<typeof teamOverviewSchema>;
