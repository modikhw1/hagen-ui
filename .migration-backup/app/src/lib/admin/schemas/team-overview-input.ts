import { z } from 'zod';

export const teamOverviewMemberInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  role: z.string().nullable(),
  is_active: z.boolean().nullable(),
  profile_id: z.string().nullable(),
  bio: z.string().nullable(),
  city: z.string().nullable(),
  avatar_url: z.string().nullable(),
  commission_rate: z.number().nullable(),
  customer_count: z.number().nullable().optional(),
  mrr_ore: z.number().nullable().optional(),
  customer_load_level: z.enum(['ok', 'warn', 'overload']).nullable().optional(),
  customer_load_label: z.string().nullable().optional(),
  overloaded: z.boolean().nullable().optional(),
});

export const teamOverviewCustomerInputSchema = z.object({
  id: z.string().min(1),
  business_name: z.string().min(1),
  monthly_price: z.number().nullable(),
  status: z.string().min(1),
  paused_until: z.string().nullable().optional(),
  account_manager_profile_id: z.string().nullable(),
  account_manager: z.string().nullable(),
  last_upload_at: z.string().nullable(),
});

export const teamOverviewActivityInputSchema = z.object({
  cm_id: z.string().nullable(),
  cm_email: z.string().nullable(),
  type: z.string().nullable(),
  created_at: z.string().min(1),
});

export const teamOverviewAssignmentInputSchema = z.object({
  id: z.string().min(1),
  customer_id: z.string().min(1),
  cm_id: z.string().nullable(),
  valid_from: z.string().min(1),
  valid_to: z.string().nullable(),
  handover_note: z.string().nullable(),
  scheduled_change: z.record(z.string(), z.unknown()).nullable(),
});

export type TeamOverviewMemberInput = z.infer<typeof teamOverviewMemberInputSchema>;
export type TeamOverviewCustomerInput = z.infer<typeof teamOverviewCustomerInputSchema>;
export type TeamOverviewActivityInput = z.infer<typeof teamOverviewActivityInputSchema>;
export type TeamOverviewAssignmentInput = z.infer<typeof teamOverviewAssignmentInputSchema>;

type ParseRowsWithWarningsParams<T> = {
  rows: unknown[] | null | undefined;
  schema: z.ZodType<T>;
  rowType: string;
};

export function parseRowsWithWarnings<T>(params: ParseRowsWithWarningsParams<T>) {
  const warnings: string[] = [];
  const parsedRows: T[] = [];

  if (!Array.isArray(params.rows)) {
    warnings.push(`team-overview-invalid-${params.rowType}-rows`);
    return {
      rows: parsedRows,
      warnings,
    };
  }

  params.rows.forEach((row, index) => {
    const parsed = params.schema.safeParse(row);

    if (parsed.success) {
      parsedRows.push(parsed.data);
      return;
    }

    warnings.push(`team-overview-invalid-${params.rowType}-row:${index}`);
    console.error('[admin.team-overview] invalid input row', {
      row_type: params.rowType,
      row_index: index,
      issues: parsed.error.issues,
    });
  });

  return {
    rows: parsedRows,
    warnings,
  };
}
