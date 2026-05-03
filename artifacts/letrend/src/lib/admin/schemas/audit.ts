import { z } from 'zod';

export const auditLogFilterSchema = z.object({
  actor: z.string().trim().optional(),
  action: z.string().trim().optional(),
  entity: z.string().trim().optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  onlyErrors: z.boolean().optional(),
  billingOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  cursor: z.string().trim().nullable().optional(),
});

export const auditEntrySchema = z.object({
  id: z.string().uuid(),
  actor_email: z.string().nullable(),
  actor_role: z.string().nullable(),
  action: z.string(),
  entity_type: z.string(),
  entity_id: z.string().nullable(),
  entity_label: z.string().nullable().optional(),
  entity_link: z.string().nullable().optional(),
  before_state: z.record(z.string(), z.unknown()).nullable().optional(),
  after_state: z.record(z.string(), z.unknown()).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string().datetime({ offset: true }),
});

export const auditLogResponseSchema = z.object({
  entries: z.array(auditEntrySchema),
  nextCursor: z.string().nullable().optional(),
  viewer: z
    .object({
      email: z.string().nullable(),
    })
    .optional(),
  facets: z
    .object({
      actors: z.array(z.string()),
      actions: z.array(z.string()),
      entities: z.array(z.string()),
    })
    .optional(),
  schemaWarnings: z.array(z.string()).optional(),
});

export const auditLogEntryDetailResponseSchema = z.object({
  entry: auditEntrySchema,
});

export type AuditLogFilter = z.infer<typeof auditLogFilterSchema>;
export type AuditLogResponse = z.infer<typeof auditLogResponseSchema>;
export type AuditLogEntryDetailResponse = z.infer<typeof auditLogEntryDetailResponseSchema>;
