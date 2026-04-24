import { z } from 'zod';
import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import { withRequestContext } from '@/lib/admin/customer-actions/with-request-context';
import { enforceAdminReadRateLimit } from '@/lib/admin/server/read-rate-limit';
import { loadAdminTeamOverview } from '@/lib/admin/server/team';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

const querySchema = z
  .object({
    sort: z.enum(['standard', 'anomalous', 'name']).optional(),
    includeInactive: z.enum(['0', '1']).optional(),
    includeAbsences: z.enum(['0', '1']).optional(),
  })
  .strict();

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function formatDuration(value: number) {
  return Number.isFinite(value) ? value.toFixed(1) : '0.0';
}

function deriveTeamMemberStatus(params: {
  hasActiveAbsence: boolean;
  overloaded: boolean;
  activityDeviation: number;
}) {
  if (params.hasActiveAbsence) return 'absent' as const;
  if (params.overloaded) return 'overloaded' as const;
  if (params.activityDeviation >= 0.6) return 'attention' as const;
  return 'standard' as const;
}

function lastActivityAt(member: {
  customers?: Array<{ last_upload_at?: string | null }>;
  assignmentHistory?: Array<{ valid_from?: string }>;
}) {
  const uploads = (member.customers ?? [])
    .map((customer) => customer.last_upload_at)
    .filter((value): value is string => typeof value === 'string');
  const latestUpload = uploads.length > 0 ? uploads.sort().at(-1) ?? null : null;
  if (latestUpload) {
    return latestUpload;
  }
  const latestAssignment = (member.assignmentHistory ?? [])
    .map((assignment) => assignment.valid_from)
    .filter((value): value is string => typeof value === 'string')
    .sort()
    .at(-1);
  return latestAssignment ?? null;
}

export const GET = withAuth(async (request, user) => {
  const supabaseAdmin = createSupabaseAdmin();
  return withRequestContext({
    request,
    route: request.nextUrl.pathname,
    action: 'team_list_get',
    actorUserId: user.id,
    supabaseAdmin,
    execute: async () => {
      const requestStart = nowMs();
      try {
        requireScope(user, 'team.read');

        const limitedResponse = await enforceAdminReadRateLimit({
          supabaseAdmin,
          actorUserId: user.id,
          actorEmail: user.email,
          actorRole: user.role,
          route: request.nextUrl.pathname,
          action: 'team_list_get',
        });
        if (limitedResponse) {
          return limitedResponse;
        }

        const parsed = querySchema.safeParse({
          sort: request.nextUrl.searchParams.get('sort') ?? undefined,
          includeInactive: request.nextUrl.searchParams.get('includeInactive') ?? undefined,
          includeAbsences: request.nextUrl.searchParams.get('includeAbsences') ?? undefined,
        });
        if (!parsed.success) {
          return jsonError(SERVER_COPY.invalidQuery, 400);
        }

        const includeInactive = parsed.data.includeInactive === '1';
        const includeAbsences = parsed.data.includeAbsences !== '0';
        const sort = parsed.data.sort ?? 'anomalous';
        const sourceSort = sort === 'name' ? 'standard' : sort;
        const result = await loadAdminTeamOverview(sourceSort);

        if (process.env.NODE_ENV !== 'production' && result.members.length > 0) {
          // Temporary safety log for DTO mismatch diagnostics on /admin/team.
          console.log('[team] sample member', JSON.stringify(result.members[0], null, 2));
        }

        let members = result.members
          .filter((member) => includeInactive || member.is_active)
          .map((member) => {
            const hasActiveAbsence = Boolean(member.active_absence);
            const derived_status = deriveTeamMemberStatus({
              hasActiveAbsence,
              overloaded: member.overloaded,
              activityDeviation: member.activityDeviation,
            });
            const overload_score = Math.max(
              0,
              Math.min(1, Number(member.customerCount || 0) / 12),
            );

            return {
              ...member,
              customer_count: member.customerCount,
              cm_avatar_url: member.avatar_url ?? null,
              overload_score,
              derived_status,
              absence_active: includeAbsences && member.active_absence
                ? {
                    type: member.active_absence.absence_type,
                    ends_on: member.active_absence.ends_on ?? null,
                    backup_cm_name: member.active_absence.backup_cm_name ?? null,
                  }
                : undefined,
              last_activity_at: lastActivityAt(member),
            };
          });

        if (sort === 'name') {
          members = [...members].sort((left, right) => left.name.localeCompare(right.name));
        } else if (sort === 'standard') {
          members = [...members].sort(
            (left, right) =>
              Number(right.customer_count || 0) - Number(left.customer_count || 0) ||
              left.name.localeCompare(right.name),
          );
        } else {
          const rank = {
            attention: 0,
            absent: 1,
            overloaded: 2,
            standard: 3,
          } as const;
          members = [...members].sort((left, right) => {
            const leftRank = rank[left.derived_status];
            const rightRank = rank[right.derived_status];
            if (leftRank !== rightRank) {
              return leftRank - rightRank;
            }
            return right.activityDeviation - left.activityDeviation;
          });
        }

        const summary = {
          total: members.length,
          active: members.filter((member) => member.is_active).length,
          absent: members.filter((member) => member.derived_status === 'absent').length,
          overloaded: members.filter((member) => member.derived_status === 'overloaded').length,
        };

        const totalDurationMs = nowMs() - requestStart;

        return new Response(
          JSON.stringify({
            ...result,
            members,
            summary,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'private, max-age=30',
              'Server-Timing': `build-team-overview;dur=${formatDuration(result.buildDurationMs)},total;dur=${formatDuration(totalDurationMs)}`,
            },
          },
        );
      } catch (error) {
        return jsonError(
          error instanceof Error ? error.message : SERVER_COPY.fetchTeamFailed,
          500,
        );
      }
    },
  });
}, ['admin']);
