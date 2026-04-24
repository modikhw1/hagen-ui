import { NextRequest } from 'next/server';
import { z } from 'zod';
import { calculateCmChangePreview } from '@/lib/admin/cm-change-preview';
import { createAdminActionContext } from '@/lib/admin/customer-actions/context';
import {
  buildRouteErrorResponse,
  buildValidationErrorResponse,
} from '@/lib/admin/customer-actions/shared';
import { requireAdminScope } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const previewSchema = z
  .object({
    next_cm_id: z.string().uuid().nullable().optional(),
    mode: z.enum(['now', 'scheduled', 'temporary']),
    effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    coverage_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    compensation_mode: z.enum(['covering_cm', 'primary_cm']).optional(),
  })
  .strict();

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (!id) {
      return jsonError('Kund-ID krävs', 400);
    }

    const parsed = previewSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return buildValidationErrorResponse(parsed.error);
    }

    const ctx = await createAdminActionContext(request, id);
    requireAdminScope(ctx.user, 'customers.write');

    const monthlyPrice = Number(ctx.beforeProfile?.monthly_price) || 0;
    const currentAssignmentResult = await ctx.supabaseAdmin
      .from('cm_assignments')
      .select('cm_id')
      .eq('customer_id', id)
      .is('valid_to', null)
      .order('valid_from', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (currentAssignmentResult.error) {
      return jsonError(currentAssignmentResult.error.message, 500);
    }

    const memberIds = [
      currentAssignmentResult.data?.cm_id ?? null,
      parsed.data.next_cm_id ?? null,
    ].filter((value): value is string => Boolean(value));

    const membersResult =
      memberIds.length > 0
        ? await ctx.supabaseAdmin
            .from('team_members')
            .select('id, name, commission_rate')
            .in('id', memberIds)
        : { data: [], error: null };

    if (membersResult.error) {
      return jsonError(membersResult.error.message, 500);
    }

    const membersById = new Map(
      (membersResult.data ?? []).map((member) => [
        member.id,
        {
          id: member.id,
          name: member.name ?? 'Content Manager',
          commission_rate: Number(member.commission_rate) || 0,
        },
      ]),
    );

    const preview = calculateCmChangePreview({
      mode: parsed.data.mode,
      effective_date: parsed.data.effective_date,
      coverage_end_date: parsed.data.coverage_end_date ?? null,
      compensation_mode: parsed.data.compensation_mode ?? 'covering_cm',
      current_monthly_price: monthlyPrice,
      current: currentAssignmentResult.data?.cm_id
        ? (membersById.get(currentAssignmentResult.data.cm_id) ?? null)
        : null,
      next: parsed.data.next_cm_id
        ? (membersById.get(parsed.data.next_cm_id) ?? null)
        : null,
    });

    return jsonOk({ preview });
  } catch (error) {
    return buildRouteErrorResponse(error);
  }
}
