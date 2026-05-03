import { z } from 'zod';

const metricDeltaSchema = z.object({
  text: z.string(),
  tone: z.enum(['success', 'muted', 'destructive']),
});

const metricCardSchema = z.object({
  label: z.string(),
  value: z.string(),
  sub: z.string().optional(),
  delta: metricDeltaSchema.optional(),
  trend: z.array(z.number()).optional(),
});

const cmMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  profile_id: z.string().nullable(),
  avatar_url: z.string().nullable(),
});

const cmAggregateSchema = z.object({
  cmId: z.string(),
  status: z.enum(['away', 'in_phase', 'watch', 'needs_action']),
  activeAbsence: z
    .object({
      absenceType: z.string(),
      startsOn: z.string(),
      endsOn: z.string(),
      backupCmName: z.string().nullable(),
    })
    .nullable(),
  counts: z.object({
    n_under: z.number(),
    n_thin: z.number(),
    n_blocked: z.number(),
    n_ok: z.number(),
    n_paused: z.number(),
  }),
  last_interaction_days: z.number(),
  interaction_count_7d: z.number(),
  expected_concepts_7d: z.number(),
  fillPct: z.number(),
  overflow: z.boolean(),
  maxInvited: z.number().int().min(0).default(0),
  barLabel: z.string(),
  newCustomers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      bufferStatus: z.enum(['blocked', 'under', 'thin', 'ok', 'paused']),
      pace: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
      onboardingState: z.enum(['invited', 'cm_ready', 'live', 'settled']),
      lastPublishedAt: z.coerce.date().nullable().optional(),
    }),
  ),
  recentPublications: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      bufferStatus: z.enum(['blocked', 'under', 'thin', 'ok', 'paused']),
      pace: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
      onboardingState: z.enum(['invited', 'cm_ready', 'live', 'settled']),
      lastPublishedAt: z.coerce.date().nullable().optional(),
    }),
  ),
});

const cmPulseRowSchema = z.object({
  member: cmMemberSchema,
  aggregate: cmAggregateSchema,
});

const cmNotificationAttentionSchema = z.object({
  kind: z.literal('cm_notification'),
  id: z.string(),
  subjectType: z.literal('cm_notification'),
  subjectId: z.string(),
  priority: z.enum(['normal', 'urgent']),
  createdAt: z.coerce.date(),
  from: z.string(),
  message: z.string(),
  customerId: z.string().nullable(),
  cmName: z.string().optional(),
});

const invoiceAttentionSchema = z.object({
  kind: z.literal('invoice_unpaid'),
  id: z.string(),
  subjectType: z.literal('invoice'),
  subjectId: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  invoiceNumber: z.string().nullable(),
  daysPastDue: z.number(),
  amount_ore: z.number(),
  hostedInvoiceUrl: z.string().nullable(),
  cmName: z.string().optional(),
});

const onboardingAttentionSchema = z.object({
  kind: z.literal('onboarding_stuck'),
  id: z.string(),
  subjectType: z.literal('onboarding'),
  subjectId: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  daysSinceCmReady: z.number(),
  cmName: z.string().optional(),
});

const demoAttentionSchema = z.object({
  kind: z.literal('demo_responded'),
  id: z.string(),
  subjectType: z.literal('demo_response'),
  subjectId: z.string(),
  respondedAt: z.coerce.date(),
  companyName: z.string(),
  cmName: z.string().optional(),
});

const customerBlockedAttentionSchema = z.object({
  kind: z.literal('customer_blocked'),
  id: z.string(),
  subjectType: z.literal('customer_blocking'),
  subjectId: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  daysBlocked: z.number(),
  cmName: z.string().optional(),
});

const cmChangeAttentionSchema = z.object({
  kind: z.literal('cm_change_due_today'),
  id: z.string(),
  subjectType: z.literal('cm_assignment'),
  subjectId: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  currentCmName: z.string().nullable(),
  nextCmName: z.string().nullable(),
  effectiveDate: z.coerce.date(),
  cmName: z.string().optional(),
});

const pauseResumeAttentionSchema = z.object({
  kind: z.literal('pause_resume_due_today'),
  id: z.string(),
  subjectType: z.literal('subscription_pause_resume'),
  subjectId: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  resumeDate: z.coerce.date(),
  cmName: z.string().optional(),
});

const cmLowActivityAttentionSchema = z.object({
  kind: z.literal('cm_low_activity'),
  id: z.string(),
  subjectType: z.literal('cm_activity'),
  subjectId: z.string(),
  customerId: z.null(),
  cmName: z.string(),
  interactionCount7d: z.number(),
  expectedConcepts7d: z.number(),
  lastInteractionDays: z.number(),
});

export const attentionItemSchema = z.discriminatedUnion('kind', [
  cmNotificationAttentionSchema,
  invoiceAttentionSchema,
  onboardingAttentionSchema,
  demoAttentionSchema,
  customerBlockedAttentionSchema,
  cmChangeAttentionSchema,
  pauseResumeAttentionSchema,
  cmLowActivityAttentionSchema,
]);

export const overviewPayloadSchema = z.object({
  metrics: z.object({
    revenueCard: metricCardSchema,
    activeCard: metricCardSchema,
    demosCard: metricCardSchema,
    costsCard: metricCardSchema,
  }),
  cmPulse: z.array(cmPulseRowSchema),
  topAttention: z.array(attentionItemSchema).optional(),
  attentionItems: z.array(attentionItemSchema),
  snoozedAttentionItems: z.array(attentionItemSchema),
  snoozedCount: z.number(),
  costs: z.object({
    entries: z.array(
      z.object({
        service: z.string(),
        calls_30d: z.number(),
        cost_30d: z.number(),
        trend: z.array(z.number()),
      }),
    ),
    totalOre: z.number(),
  }),
  attentionFeedSeenAt: z.string().nullable(),
});

export const overviewMetricsResponseSchema = z.object({
  metrics: z.object({
    revenueCard: metricCardSchema,
    activeCard: metricCardSchema,
    demosCard: metricCardSchema,
    costsCard: metricCardSchema,
  }),
});

export const overviewAttentionResponseSchema = z.object({
  attentionItems: z.array(attentionItemSchema),
  snoozedAttentionItems: z.array(attentionItemSchema),
  snoozedCount: z.number(),
  attentionFeedSeenAt: z.string().nullable(),
});

export const overviewCmPulseResponseSchema = z.object({
  cmPulse: z.array(cmPulseRowSchema),
});

export const notificationsResponseSchema = z.object({
  items: z.array(attentionItemSchema).default([]),
  snoozedItems: z.array(attentionItemSchema).default([]),
  unreadCount: z.number().int().min(0),
  totalCount: z.number().int().min(0),
  snoozedCount: z.number().int().min(0),
  lastSeenAt: z.string().nullable(),
});

export const notificationsUnreadCountSchema = z.object({
  count: z.number().int().min(0),
  fetchedAt: z.string(),
});

export const overviewCostsResponseSchema = z.object({
  entries: z.array(
    z.object({
      service: z.string(),
      calls_30d: z.number(),
      cost_30d: z.number(),
      trend: z.array(z.number()),
    }),
  ),
  totalOre: z.number(),
});

export type AttentionItemDto = z.infer<typeof attentionItemSchema>;
export type OverviewDTO = z.infer<typeof overviewPayloadSchema>;
export type OverviewMetricsDTO = z.infer<typeof overviewMetricsResponseSchema>;
export type OverviewAttentionDTO = z.infer<typeof overviewAttentionResponseSchema>;
export type OverviewCmPulseDTO = z.infer<typeof overviewCmPulseResponseSchema>;
export type NotificationsDTO = z.infer<typeof notificationsResponseSchema>;
export type NotificationsUnreadCountDTO = z.infer<typeof notificationsUnreadCountSchema>;
export type OverviewCostsDTO = z.infer<typeof overviewCostsResponseSchema>;
