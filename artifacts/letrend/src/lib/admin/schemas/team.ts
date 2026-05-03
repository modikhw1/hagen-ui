import { z } from 'zod';
import { TEAM_COLORS } from '@/lib/admin/teamPalette';

export const addTeamMemberInputSchema = z
  .object({
    role: z.enum(['admin', 'content_manager']),
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email(),
    phone: z.string().trim().max(40).optional().default(''),
    city: z.string().trim().max(80).optional().default(''),
    bio: z.string().trim().max(2000).optional().default(''),
    avatar_url: z.union([z.string().trim().url(), z.literal('')]).optional().default(''),
    color: z.enum(TEAM_COLORS).optional().default(TEAM_COLORS[0]),
    commission_rate: z.number().min(0).max(1),
    sendInvite: z.boolean().default(true),
  })
  .refine((value) => (value.role === 'admin' ? value.commission_rate === 0 : true), {
    message: 'Admin ska ha commission_rate = 0',
    path: ['commission_rate'],
  });

export type AddTeamMemberInput = z.infer<typeof addTeamMemberInputSchema>;

export const cmEditSchema = z.object({
  name: z.string().trim().min(2, 'Namn måste vara minst 2 tecken').max(200),
  email: z.string().trim().email('Ange en giltig e-post').max(255),
  phone: z.string().trim().max(50).optional().or(z.literal('')),
  city: z.string().trim().max(120).optional().or(z.literal('')),
  bio: z.string().trim().max(500).optional().or(z.literal('')),
  avatar_url: z
    .union([z.string().trim().url('Ange en giltig URL').max(2000), z.literal('')])
    .optional(),
  commission_rate_pct: z.coerce.number().min(0, 'Minst 0 %').max(50, 'Max 50 %'),
});

export const absenceSchema = z
  .object({
    absence_type: z.enum(['vacation', 'sick', 'parental_leave', 'training', 'other']),
    starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ange ett giltigt startdatum'),
    ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ange ett giltigt slutdatum'),
    backup_cm_id: z.string().uuid().nullable(),
    compensation_mode: z.enum(['covering_cm', 'primary_cm']),
    note: z.union([z.string().trim().max(500), z.literal(''), z.null()]).transform((value) =>
      value === '' ? null : value,
    ),
  })
  .refine((data) => data.ends_on >= data.starts_on, {
    path: ['ends_on'],
    message: 'Slutdatum kan inte vara före startdatum',
  })
  .superRefine((data, ctx) => {
    if (data.compensation_mode === 'covering_cm' && !data.backup_cm_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['backup_cm_id'],
        message: 'Välj en ersättare för att tilldela payout',
      });
    }
  });

export type CmEditInput = z.infer<typeof cmEditSchema>;
export type CmAbsenceInput = z.infer<typeof absenceSchema>;
