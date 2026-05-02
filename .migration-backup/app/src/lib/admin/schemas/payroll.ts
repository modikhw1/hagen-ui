import { z } from 'zod';

export const payrollCustomerBreakdownSchema = z.object({
  customer_id: z.string(),
  customer_name: z.string(),
  billed_ore: z.number().int(),
  payout_ore: z.number().int(),
  billable_days: z.number().int(),
  pro_rata_label: z.string().nullable().optional(),
});

export const payrollRowSchema = z.object({
  cm_id: z.string(),
  cm_name: z.string(),
  cm_email: z.string().nullable(),
  commission_rate: z.number(),
  assigned_customers: z.number().int(),
  active_customers: z.number().int(),
  billed_ore: z.number().int(),
  payout_ore: z.number().int(),
  billable_days: z.number().int(),
  customer_breakdown: z.array(payrollCustomerBreakdownSchema),
});

export const payrollResponseSchema = z.object({
  period: z.object({
    key: z.string(),
    label: z.string(),
    start_date: z.string(),
    end_date: z.string(),
  }),
  available_periods: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
    }),
  ),
  rows: z.array(payrollRowSchema),
  totals: z.object({
    cm_count: z.number().int(),
    assigned_customers: z.number().int(),
    active_customers: z.number().int(),
    billed_ore: z.number().int(),
    payout_ore: z.number().int(),
    billable_days: z.number().int(),
    previous: z
      .object({
        billed_ore: z.number().int(),
        payout_ore: z.number().int(),
        billable_days: z.number().int(),
      })
      .optional(),
  }),
  scheduled_changes: z.array(
    z.object({
      customer_id: z.string(),
      customer_name: z.string(),
      current_cm_name: z.string().nullable(),
      next_cm_name: z.string().nullable(),
      effective_date: z.string(),
      handover_note: z.string().nullable(),
    }),
  ),
  schemaWarnings: z.array(z.string()).optional(),
});

export const payrollBreakdownResponseSchema = z.object({
  period_key: z.string(),
  cm_id: z.string(),
  cm_name: z.string(),
  cm_email: z.string().nullable(),
  customers: z.array(payrollCustomerBreakdownSchema),
});

export type PayrollResponse = z.infer<typeof payrollResponseSchema>;
export type PayrollBreakdownResponse = z.infer<typeof payrollBreakdownResponseSchema>;
