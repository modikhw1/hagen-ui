import { NextRequest } from 'next/server';
import { recordAuditLog } from '@/lib/admin/audit-log';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { getAppUrl } from '@/lib/url/public';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export const POST = withAuth(
  async (request: NextRequest, user, context: { params: Promise<unknown> }) => {
    try {
      requireScope(user, 'team.invite');

      const { id } = (await context.params) as { id?: string };
      if (!id) {
        return jsonError('Teammedlem-ID kravs', 400);
      }

      const body = await request.json();
      const resendEmail = typeof body?.email === 'string' ? body.email.trim() : '';
      const resendName = typeof body?.name === 'string' ? body.name.trim() : '';
      const resendRole = body?.role === 'admin' ? 'admin' : 'content_manager';

      if (!resendEmail) {
        return jsonError('email kravs', 400);
      }

      const supabaseAdmin = createSupabaseAdmin();
      const appUrl = getAppUrl();
      const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        resendEmail,
        {
          data: {
            isTeamMember: true,
            invited_as: 'team_member',
            role: resendRole,
            name: resendName,
            team_member_id: id,
          },
          redirectTo: `${appUrl}/auth/callback?flow=team_invite`,
        },
      );

      if (inviteError) {
        return jsonError(inviteError.message, 500);
      }

      await supabaseAdmin
        .from('team_members')
        .update({ invited_at: new Date().toISOString() })
        .eq('id', id);

      await recordAuditLog(supabaseAdmin, {
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'admin.team.invite_resent',
        entityType: 'team_member',
        entityId: id,
        metadata: {
          email: resendEmail,
          role: resendRole,
        },
      });

      return jsonOk({ resent: true });
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : 'Kunde inte skicka invite',
        500,
      );
    }
  },
  ['admin'],
);
