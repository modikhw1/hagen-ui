import { NextRequest } from 'next/server';
import { recordAuditLog } from '@/lib/admin/audit-log';
import { getAdminSettings } from '@/lib/admin/settings';
import { isMissingColumnError } from '@/lib/admin/schema-guards';
import { AuthError, requireAdminScope, validateApiRequest } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

interface RouteParams {
  params: Promise<{ id: string }>;
}

type TeamMemberSnapshot = Record<string, unknown>;

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await validateApiRequest(request, ['admin']);
    const { id } = await params;

    if (!id) {
      return jsonError('Teammedlems-ID kravs', 400);
    }

    if (!user.is_admin && user.role !== 'admin') {
      return jsonError('Adminbehorighet kravs', 403);
    }

    const supabaseAdmin = createSupabaseAdmin();
    const settings = await getAdminSettings(supabaseAdmin);
    const primary = await (((supabaseAdmin.from('team_members' as never) as never) as {
      select: (columns: string) => {
        eq: (column: string, value: string) => Promise<{
          data: TeamMemberSnapshot | null;
          error: { message?: string } | null;
        }>;
      };
    }).select('id, name, email, phone, role, color, is_active, commission_rate, created_at, profile_id, avatar_url, bio, region, expertise, start_date, notes, invited_at'))
      .eq('id', id);
    const usedLegacyCommissionFallback =
      !!primary.error && isMissingColumnError(primary.error.message ?? '');

    const { data, error } = usedLegacyCommissionFallback
      ? await (((supabaseAdmin.from('team_members' as never) as never) as {
          select: (columns: string) => {
            eq: (column: string, value: string) => Promise<{
              data: TeamMemberSnapshot | null;
              error: { message?: string } | null;
            }>;
          };
        }).select('id, name, email, phone, role, color, is_active, created_at, profile_id, avatar_url, bio, region, expertise, start_date, notes, invited_at'))
          .eq('id', id)
      : primary;

    if (error) {
      return jsonError(error.message || 'Kunde inte hamta teammedlem', 500);
    }

    if (!data) {
      return jsonError('Teammedlem hittades inte', 404);
    }

    return jsonOk({
      member: usedLegacyCommissionFallback
        ? {
            ...(data as TeamMemberSnapshot),
            commission_rate: settings.settings.default_commission_rate,
          }
        : data,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonError(error.message, error.statusCode);
    }

    return jsonError(
      error instanceof Error ? error.message : 'Internt serverfel',
      500,
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await validateApiRequest(request, ['admin']);
    const { id } = await params;

    if (!id) {
      return jsonError('Teammedlems-ID kravs', 400);
    }

    if (!user.is_admin && user.role !== 'admin') {
      return jsonError('Adminbehorighet kravs', 403);
    }

    const body = await request.json();
    const { name, email, phone, bio, city, region, expertise, start_date, notes, avatar_url, commission_rate } = body;

    if (!name?.trim()) {
      return jsonError('Namn kravs', 400);
    }

    const supabaseAdmin = createSupabaseAdmin();
    const settings = await getAdminSettings(supabaseAdmin);
    const before = await (((supabaseAdmin.from('team_members' as never) as never) as {
      select: (columns: string) => {
        eq: (column: string, value: string) => Promise<{
          data: TeamMemberSnapshot | null;
          error: { message?: string } | null;
        }>;
      };
    }).select('id, name, email, phone, role, color, is_active, commission_rate, created_at, profile_id, avatar_url, bio, region, expertise, start_date, notes, invited_at'))
      .eq('id', id);
    const beforeCommissionRate =
      before.data && typeof before.data === 'object' && 'commission_rate' in before.data
        ? Number((before.data as Record<string, unknown>).commission_rate)
        : settings.settings.default_commission_rate;
    const updatePayload: Record<string, unknown> = {
      name: name.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      bio: bio?.trim() || null,
      region: city?.trim() || region?.trim() || null,
      expertise: Array.isArray(expertise) && expertise.length > 0 ? expertise : null,
      start_date: start_date || null,
      notes: notes?.trim() || null,
    };

    if (avatar_url !== undefined) {
      updatePayload.avatar_url = avatar_url || null;
    }

    if (commission_rate !== undefined) {
      const parsedCommissionRate = Number(commission_rate);
      updatePayload.commission_rate = Math.max(
        0,
        Math.min(1, Number.isFinite(parsedCommissionRate) ? parsedCommissionRate : 0),
      );
    }

    let { data, error } = await (((supabaseAdmin.from('team_members' as never) as never) as {
      update: (value: Record<string, unknown>) => {
        eq: (column: string, value: string) => {
          select: (columns: string) => {
            single: () => Promise<{
              data: TeamMemberSnapshot | null;
              error: { message?: string } | null;
            }>;
          };
        };
      };
    }).update(updatePayload)).eq('id', id).select(
      'id, name, email, phone, role, color, is_active, commission_rate, created_at, profile_id, avatar_url, bio, region, expertise, start_date, notes, invited_at',
    ).single();

    if (error && isMissingColumnError(error.message ?? '')) {
      const legacyPayload = { ...updatePayload };
      delete legacyPayload.commission_rate;

      const fallback = await (((supabaseAdmin.from('team_members' as never) as never) as {
        update: (value: Record<string, unknown>) => {
          eq: (column: string, value: string) => {
            select: (columns: string) => {
              single: () => Promise<{
                data: TeamMemberSnapshot | null;
                error: { message?: string } | null;
              }>;
            };
          };
        };
      }).update(legacyPayload)).eq('id', id).select(
        'id, name, email, phone, role, color, is_active, created_at, profile_id, avatar_url, bio, region, expertise, start_date, notes, invited_at',
      ).single();

      data = fallback.data
        ? {
            ...(fallback.data as TeamMemberSnapshot),
            commission_rate: Number.isFinite(beforeCommissionRate)
              ? beforeCommissionRate
              : settings.settings.default_commission_rate,
          }
        : fallback.data;
      error = fallback.error;
    }

    if (error) {
      return jsonError(error.message || 'Kunde inte uppdatera teammedlem', 500);
    }

    await recordAuditLog(supabaseAdmin, {
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'admin.team.updated',
      entityType: 'team_member',
      entityId: id,
      beforeState: before.data as Record<string, unknown> | null,
      afterState: data as Record<string, unknown> | null,
    });

    return jsonOk({ member: data });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonError(error.message, error.statusCode);
    }

    return jsonError(
      error instanceof Error ? error.message : 'Internt serverfel',
      500,
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await validateApiRequest(request, ['admin']);
    const { id } = await params;

    if (!id) {
      return jsonError('Teammedlems-ID kravs', 400);
    }

    if (!user.is_admin && user.role !== 'admin') {
      return jsonError('Adminbehorighet kravs', 403);
    }

    requireAdminScope(
      user,
      'super_admin',
      'Endast super-admin kan arkivera teammedlemmar',
    );

    const supabaseAdmin = createSupabaseAdmin();
    const before = await (((supabaseAdmin.from('team_members' as never) as never) as {
      select: (columns: string) => {
        eq: (column: string, value: string) => Promise<{
          data: TeamMemberSnapshot | null;
          error: { message?: string } | null;
        }>;
      };
    }).select('id, name, email, phone, role, color, is_active, created_at, profile_id'))
      .eq('id', id);
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
      beforeState: before.data as Record<string, unknown> | null,
      afterState: {
        ...(before.data ?? {}),
        is_active: false,
      },
    });

    return jsonOk({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonError(error.message, error.statusCode);
    }

    return jsonError(
      error instanceof Error ? error.message : 'Internt serverfel',
      500,
    );
  }
}
