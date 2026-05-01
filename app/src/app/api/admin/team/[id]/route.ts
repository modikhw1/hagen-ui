import { NextRequest } from 'next/server';
import { z } from 'zod';
import { recordAuditLog } from '@/lib/admin/audit-log';
import { AuthError, requireScope, validateApiRequest } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import {
  getTeamMemberById,
  listOwnedCustomersForCm,
  updateTeamMemberTransaction,
} from '@/lib/admin/team-server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const legacyUpdateSchema = z
  .object({
    profile: z
      .object({
        name: z.string().trim().min(1).max(200).optional(),
        email: z.string().trim().email().max(255).optional(),
        phone: z.string().trim().max(50).optional().nullable(),
        city: z.string().trim().max(120).optional().nullable(),
        bio: z.string().trim().max(2000).optional().nullable(),
        avatar_url: z.union([z.string().trim().url().max(2000), z.literal('')]).optional(),
      })
      .partial()
      .optional(),
    commission_rate: z.number().min(0).max(1).optional(),
    reassign_to_cm_id: z.string().uuid().nullable().optional(),
  })
  .strict();

const flatUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    email: z.string().trim().email().max(255),
    phone: z.string().trim().max(50).nullable().optional().or(z.literal('')),
    city: z.string().trim().max(120).nullable().optional().or(z.literal('')),
    bio: z.string().trim().max(500).nullable().optional().or(z.literal('')),
    avatar_url: z.union([z.string().trim().url().max(2000), z.literal('')]).optional(),
    commission_rate_pct: z.coerce.number().min(0).max(50).optional(),
    commission_rate: z.number().min(0).max(1).optional(),
    reassign_to_cm_id: z.string().uuid().nullable().optional(),
  })
  .strict();

const updateSchema = z.union([
  legacyUpdateSchema,
  flatUpdateSchema,
]);

function isLegacyPayload(
  payload: z.infer<typeof updateSchema>,
): payload is z.infer<typeof legacyUpdateSchema> {
  return 'profile' in payload;
}

function normalizeUpdatePayload(
  payload: z.infer<typeof updateSchema>,
): {
  profile?: {
    name?: string;
    email?: string;
    phone?: string | null;
    city?: string | null;
    bio?: string | null;
    avatar_url?: string;
  };
  commission_rate?: number;
  reassign_to_cm_id?: string | null;
} {
  if (isLegacyPayload(payload)) {
    return payload;
  }

  return {
    profile: {
      name: payload.name,
      email: payload.email,
      phone: payload.phone || null,
      city: payload.city || null,
      bio: payload.bio || null,
      avatar_url: payload.avatar_url || '',
    },
    commission_rate:
      payload.commission_rate ?? (payload.commission_rate_pct ?? 0) / 100,
    reassign_to_cm_id: payload.reassign_to_cm_id,
  };
}

import { revalidateAdminTeamViews } from '@/lib/admin/cache-tags';

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await validateApiRequest(request, ['admin']);
    requireScope(user, 'team.read');

    const { id } = await params;
    if (!id) {
      return jsonError('Teammedlems-ID krävs', 400);
    }

    const supabaseAdmin = createSupabaseAdmin();
    const member = await getTeamMemberById(supabaseAdmin, id);
    if (!member) {
      return jsonError('Teammedlem hittades inte', 404);
    }

    return jsonOk({ member });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonError(error.message, error.statusCode);
    }

    return jsonError(error instanceof Error ? error.message : 'Internt serverfel', 500);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await validateApiRequest(request, ['admin']);
    requireScope(user, 'team.write');

    const { id } = await params;
    if (!id) {
      return jsonError('Teammedlems-ID krävs', 400);
    }

    const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || 'Ogiltig payload', 400);
    }
    const normalized = normalizeUpdatePayload(parsed.data);

    const supabaseAdmin = createSupabaseAdmin();
    const existing = await getTeamMemberById(supabaseAdmin, id);
    if (!existing) {
      return jsonError('Teammedlem hittades inte', 404);
    }

    const result = await updateTeamMemberTransaction({
      supabaseAdmin,
      teamMemberId: id,
      profile: normalized.profile,
      commissionRate: normalized.commission_rate,
      reassignToCmId: normalized.reassign_to_cm_id,
      actor: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });

    revalidateAdminTeamViews();

    return jsonOk({
      member: result.member,
      assignment_result: result.assignmentResult
        ? {
            target_cm_id: result.assignmentResult.targetMember.id,
            effective_date: result.assignmentResult.effectiveDate,
            reassigned_count: result.assignmentResult.moved.length,
          }
        : null,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonError(error.message, error.statusCode);
    }

    return jsonError(error instanceof Error ? error.message : 'Internt serverfel', 500);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await validateApiRequest(request, ['admin']);
    requireScope(user, 'team.archive', 'Du saknar behörighet att arkivera teammedlemmar');

    const { id } = await params;
    if (!id) {
      return jsonError('Teammedlems-ID krävs', 400);
    }

    const supabaseAdmin = createSupabaseAdmin();
    const before = await getTeamMemberById(supabaseAdmin, id);
    if (!before) {
      return jsonError('Teammedlem hittades inte', 404);
    }

    const openAssignments = await listOwnedCustomersForCm(supabaseAdmin, before);
    if (openAssignments.length > 0) {
      return jsonError(
        `CM har fortfarande ${openAssignments.length} öppna kundansvar. Omfördela dem först.`,
        409,
        {
          code: 'reassign_required',
          remaining: openAssignments.length,
        },
      );
    }

    const { error } = await supabaseAdmin
      .from('team_members')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      return jsonError(error.message, 500);
    }

    await recordAuditLog(supabaseAdmin, {
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'admin.team.archived',
      entityType: 'team_member',
      entityId: id,
      beforeState: before as Record<string, unknown>,
      afterState: {
        ...before,
        is_active: false,
      },
    });

    revalidateAdminTeamViews();

    return jsonOk({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonError(error.message, error.statusCode);
    }

    return jsonError(error instanceof Error ? error.message : 'Internt serverfel', 500);
  }
}
