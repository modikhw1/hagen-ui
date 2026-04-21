'use client';

import { useQuery } from '@tanstack/react-query';
import {
  baseline90d,
  classifyDay,
  summarize,
  type DailyDot,
} from '@/lib/admin-derive/team-flow';

type TeamMemberRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  color: string | null;
  is_active: boolean;
  profile_id: string | null;
  bio: string | null;
  region: string | null;
  avatar_url: string | null;
};

type CustomerRow = {
  id: string;
  business_name: string;
  monthly_price: number | null;
  status: string;
  account_manager_profile_id: string | null;
  account_manager: string | null;
  last_upload_at: string | null;
};

type ActivityRow = {
  cm_id: string | null;
  cm_email: string | null;
  type: string | null;
  created_at: string;
};

type TeamOverviewResponse = {
  members: TeamMemberRow[];
  customers: CustomerRow[];
  activities: ActivityRow[];
  byCustomer: Record<
    string,
    {
      followers: number;
      videos_last_7d: number;
      engagement_rate: number;
    }
  >;
  schemaWarnings?: string[];
};

export type TeamCustomer = {
  id: string;
  business_name: string;
  monthly_price: number;
  status: string;
  followers: number;
  videos_last_7d: number;
  engagement_rate: number;
  last_upload_at: string | null;
};

export type TeamMemberView = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  bio: string | null;
  color: string;
  avatar_url: string | null;
  role: string;
  is_active: boolean;
  customers: TeamCustomer[];
  customerCount: number;
  mrr_ore: number;
  activityCount: number;
  activeWorkflowSteps: number;
  activityRatio: number;
  activitySeries: number[];
  activityDots: DailyDot[];
  activitySummary: {
    activeDays: number;
    total: number;
    median: number;
    longestRest: number;
  };
  activityBaseline: number;
  activityAverage7d: number;
  activityDeviation: number;
  customerLoadClass: 'w-1/4' | 'w-1/2' | 'w-full';
  customerLoadLabel: string;
  overloaded: boolean;
};

async function fetchTeamOverview(): Promise<TeamOverviewResponse> {
  const response = await fetch('/api/admin/team/overview', { credentials: 'include' });
  const payload = (await response.json().catch(() => ({}))) as TeamOverviewResponse & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || 'Kunde inte hamta teamdata');
  }

  return {
    members: payload.members ?? [],
    customers: payload.customers ?? [],
    activities: payload.activities ?? [],
    byCustomer: payload.byCustomer ?? {},
    schemaWarnings: payload.schemaWarnings ?? [],
  };
}

export function useTeam() {
  return useQuery({
    queryKey: ['admin', 'team-full'],
    queryFn: async () => {
      const { members, customers, activities, byCustomer } = await fetchTeamOverview();

      const rows = members.map((member) => {
        const memberCustomers = customers
          .filter((customer) =>
            member.profile_id
              ? customer.account_manager_profile_id === member.profile_id
              : normalize(customer.account_manager) === normalize(member.name),
          )
          .map<TeamCustomer>((customer) => ({
            id: customer.id,
            business_name: customer.business_name,
            monthly_price: customer.monthly_price ?? 0,
            status: customer.status,
            followers: byCustomer[customer.id]?.followers ?? 0,
            videos_last_7d: byCustomer[customer.id]?.videos_last_7d ?? 0,
            engagement_rate: byCustomer[customer.id]?.engagement_rate ?? 0,
            last_upload_at: customer.last_upload_at,
          }));

        const memberActivities = activities.filter(
          (activity) =>
            activity.cm_id === member.id ||
            normalize(activity.cm_email) === normalize(member.email) ||
            normalize(activity.cm_email) === normalize(member.name),
        );
        const recentActivities = memberActivities.filter((activity) => {
          const createdAt = new Date(activity.created_at).getTime();
          return createdAt >= Date.now() - 7 * 24 * 60 * 60 * 1000;
        });

        const activeCustomers = memberCustomers.filter((customer) =>
          ['active', 'agreed'].includes(customer.status),
        ).length;
        const pipelineCustomers = memberCustomers.filter((customer) =>
          ['pending', 'invited'].includes(customer.status),
        ).length;
        const uploadingCustomers = memberCustomers.filter(
          (customer) => customer.videos_last_7d > 0,
        ).length;
        const mrr_ore = memberCustomers.reduce(
          (sum, customer) => sum + Math.round(customer.monthly_price * 100),
          0,
        );
        const activitySeries = Array.from({ length: 14 }, (_, index) => {
          const dayStart = new Date();
          dayStart.setHours(0, 0, 0, 0);
          dayStart.setDate(dayStart.getDate() - (13 - index));
          const dayEnd = new Date(dayStart);
          dayEnd.setDate(dayEnd.getDate() + 1);

          return memberActivities.filter((activity) => {
            const createdAt = new Date(activity.created_at);
            return createdAt >= dayStart && createdAt < dayEnd;
          }).length;
        });
        const baselineSeries = Array.from({ length: 90 }, (_, index) => {
          const dayStart = new Date();
          dayStart.setHours(0, 0, 0, 0);
          dayStart.setDate(dayStart.getDate() - (89 - index));
          const dayEnd = new Date(dayStart);
          dayEnd.setDate(dayEnd.getDate() + 1);

          return {
            date: dayStart,
            count: memberActivities.filter((activity) => {
              const createdAt = new Date(activity.created_at);
              return createdAt >= dayStart && createdAt < dayEnd;
            }).length,
          };
        });
        const activityBaseline = baseline90d(baselineSeries);
        const activityAverage7d = recentActivities.length / 7;
        const activityDeviation = activityBaseline <= 0
          ? activityAverage7d > 0
            ? 1
            : 0
          : Math.abs(activityAverage7d - activityBaseline) / activityBaseline;
        const activityDots = activitySeries.map((count, index) => {
          const date = new Date();
          date.setHours(0, 0, 0, 0);
          date.setDate(date.getDate() - (13 - index));
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;

          return {
            date,
            count,
            level: classifyDay(count, activityBaseline, isWeekend),
            isWeekend,
          } satisfies DailyDot;
        });
        const activitySummary = summarize(activityDots);
        const customerLoadClass =
          memberCustomers.length <= 4
            ? 'w-1/4'
            : memberCustomers.length <= 7
              ? 'w-1/2'
              : 'w-full';
        const overloaded = memberCustomers.length >= 11;
        const customerLoadLabel = overloaded
          ? 'Overbelastad'
          : memberCustomers.length >= 8
            ? 'Full portfolj'
            : memberCustomers.length >= 5
              ? 'Balans'
              : 'Latt portfolj';

        return {
          id: member.id,
          name: member.name,
          email: member.email ?? '',
          phone: member.phone,
          city: member.region,
          bio: member.bio,
          color: member.color ?? '#6b4423',
          avatar_url: member.avatar_url,
          role: member.role,
          is_active: member.is_active,
          customers: memberCustomers,
          customerCount: memberCustomers.length,
          mrr_ore,
          activityCount: recentActivities.length,
          activeWorkflowSteps: [activeCustomers > 0, pipelineCustomers > 0, uploadingCustomers > 0].filter(Boolean).length,
          activityRatio: 0,
          activitySeries,
          activityDots,
          activitySummary,
          activityBaseline,
          activityAverage7d,
          activityDeviation,
          customerLoadClass,
          customerLoadLabel,
          overloaded,
        } satisfies TeamMemberView;
      });

      const maxActivity = Math.max(...rows.map((row) => row.activityCount), 1);

      return rows.map((row) => ({
        ...row,
        activityRatio: row.activityCount / maxActivity,
      }));
    },
  });
}

function normalize(value?: string | null) {
  return (value ?? '').trim().toLowerCase();
}
