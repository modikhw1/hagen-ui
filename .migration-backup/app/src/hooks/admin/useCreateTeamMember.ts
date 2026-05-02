'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/admin/api-client';
import { useAdminRefresh } from '@/hooks/admin/useAdminRefresh';
import { qk } from '@/lib/admin/queryKeys';
import type { TeamMemberView } from '@/lib/admin/dtos/team';

export type CreateTeamMemberPayload = {
  role: 'admin' | 'content_manager';
  name: string;
  email: string;
  phone?: string;
  city?: string;
  bio?: string;
  avatar_url?: string;
  color?: string;
  commission_rate: number;
  sendInvite: boolean;
};

type TeamMemberLiteRow = {
  id: string;
  name: string;
  email: string | null;
  is_active: boolean;
  commission_rate: number | null;
  avatar_url: string | null;
};

type CreateTeamMemberResult = {
  member: TeamMemberLiteRow;
  invited: boolean;
  warning: string | null;
};

function buildOptimisticTeamMember(
  payload: CreateTeamMemberPayload,
  memberId: string,
): TeamMemberView {
  const now = new Date();
  const activityDots = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (13 - index));
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    return {
      date,
      count: 0,
      level: 'empty' as const,
      intensity: 0 as const,
      isWeekend,
    };
  });

  return {
    id: memberId,
    name: payload.name,
    email: payload.email,
    phone: payload.phone ?? null,
    city: payload.city ?? null,
    bio: payload.bio ?? null,
    avatar_url: payload.avatar_url ?? null,
    role: payload.role,
    is_active: true,
    commission_rate: payload.commission_rate,
    active_absence: null,
    pulse: {
      status: 'ok',
      fillPct: 0,
      barLabel: '0/0 koncept',
      plannedConceptsTotal: 0,
      expectedConcepts7d: 0,
      interactionCount7d: 0,
      lastInteractionDays: 999,
      counts: {
        n_under: 0,
        n_thin: 0,
        n_blocked: 0,
        n_ok: 0,
        n_paused: 0,
      },
    },
    customers: [],
    assignmentHistory: [],
    customerCount: 0,
    mrr_ore: 0,
    activityCount: 0,
    activeWorkflowSteps: 0,
    activityRatio: 0,
    activitySeries: new Array(14).fill(0),
    activityDots,
    activitySummary: {
      activeDays: 0,
      total: 0,
      median: 0,
      longestRest: 14,
    },
    activityBaseline: 0,
    activityAverage7d: 0,
    activityDeviation: 0,
    customerLoadLevel: 'ok',
    customerLoadClass: 'ok',
    customerLoadLabel: 'Lätt portfölj',
    overloaded: false,
  };
}

export function useCreateTeamMember() {
  const queryClient = useQueryClient();
  const refresh = useAdminRefresh();

  return useMutation({
    mutationFn: async (payload: CreateTeamMemberPayload) =>
      apiClient.post<CreateTeamMemberResult>('/api/admin/team/create', payload),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: qk.team.lite() });
      await queryClient.cancelQueries({ queryKey: qk.team.all() });
      const previousLite = queryClient.getQueryData<TeamMemberLiteRow[]>(qk.team.lite());
      const previousTeamLists = queryClient.getQueriesData<TeamMemberView[]>({
        queryKey: ['admin', 'team', 'list'],
      });
      const tempId = `temp-${crypto.randomUUID()}`;
      const optimisticTeamMember = buildOptimisticTeamMember(payload, tempId);

      queryClient.setQueryData<TeamMemberLiteRow[] | undefined>(
        qk.team.lite(),
        (current) => [
          {
            id: tempId,
            name: payload.name,
            email: payload.email,
            is_active: true,
            commission_rate: payload.commission_rate,
            avatar_url: payload.avatar_url ?? null,
          },
          ...(current ?? []),
        ],
      );
      queryClient.setQueriesData<TeamMemberView[] | undefined>(
        { queryKey: ['admin', 'team', 'list'] },
        (current) => [optimisticTeamMember, ...(current ?? [])],
      );

      return {
        previousLite,
        previousTeamLists,
        tempId,
      };
    },
    onError: (_error, _payload, context) => {
      if (context?.previousLite) {
        queryClient.setQueryData(qk.team.lite(), context.previousLite);
      } else if (context?.tempId) {
        queryClient.setQueryData<TeamMemberLiteRow[] | undefined>(
          qk.team.lite(),
          (current) => (current ?? []).filter((item) => item.id !== context.tempId),
        );
      }

      for (const [queryKey, data] of context?.previousTeamLists ?? []) {
        queryClient.setQueryData(queryKey, data);
      }
    },
    onSuccess: async (result, _payload, context) => {
      queryClient.setQueryData<TeamMemberLiteRow[] | undefined>(
        qk.team.lite(),
        (current) => {
          const withoutTemp = (current ?? []).filter(
            (item) => item.id !== context?.tempId,
          );
          const deduped = withoutTemp.filter((item) => item.id !== result.member.id);
          return [result.member, ...deduped];
        },
      );
      queryClient.setQueriesData<TeamMemberView[] | undefined>(
        { queryKey: ['admin', 'team', 'list'] },
        (current) =>
          (current ?? []).map((item) =>
            item.id === context?.tempId
              ? {
                  ...item,
                  id: result.member.id,
                  name: result.member.name,
                  email: result.member.email ?? '',
                  avatar_url: result.member.avatar_url,
                  commission_rate: result.member.commission_rate ?? item.commission_rate,
                  is_active: result.member.is_active,
                }
              : item,
          ),
      );

      await refresh([{ type: 'global', scope: 'team' }, { type: 'global', scope: 'payroll' }]);
    },
  });
}
