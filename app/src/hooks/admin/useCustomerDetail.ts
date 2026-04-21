'use client';

import { useQuery } from '@tanstack/react-query';

export type CustomerDetail = {
  id: string;
  business_name: string;
  contact_email: string;
  customer_contact_name: string | null;
  phone: string | null;
  account_manager: string | null;
  account_manager_profile_id: string | null;
  monthly_price: number | null;
  subscription_interval: 'month' | 'quarter' | 'year';
  pricing_status: 'fixed' | 'unknown';
  status: string;
  created_at: string;
  invited_at: string | null;
  agreed_at: string | null;
  next_invoice_date: string | null;
  contract_start_date: string | null;
  billing_day_of_month: number | null;
  upcoming_price_change: { effective_date: string; price: number } | null;
  discount_type: 'none' | 'percent' | 'amount' | 'free_months' | null;
  discount_value: number | null;
  discount_duration_months: number | null;
  discount_ends_at: string | null;
  tiktok_handle: string | null;
  tiktok_profile_url: string | null;
  tiktok_user_id: string | null;
  concepts_per_week: number | null;
  expected_concepts_per_week: number | null;
  paused_until: string | null;
  onboarding_state: 'invited' | 'cm_ready' | 'live' | 'settled' | null;
  onboarding_state_changed_at: string | null;
  upload_schedule: string[] | null;
  last_upload_at: string | null;
  latest_planned_publish_date: string | null;
  last_published_at: string | null;
  last_history_sync_at: string | null;
  pending_history_advance_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  attention_snoozes: Array<{
    subject_type: 'onboarding' | 'customer_blocking';
    subject_id: string;
    snoozed_until: string | null;
    released_at: string | null;
    note: string | null;
  }>;
  coverage_absences: Array<{
    id: string;
    cm_id: string;
    cm_name: string | null;
    backup_cm_id: string | null;
    backup_cm_name: string | null;
    absence_type: string;
    compensation_mode: 'covering_cm' | 'primary_cm';
    starts_on: string;
    ends_on: string;
    note: string | null;
    is_active: boolean;
    is_upcoming: boolean;
  }>;
};

export type CustomerInvoice = {
  id: string;
  stripe_invoice_id: string | null;
  amount_due: number | null;
  status: string;
  created_at: string;
  due_date?: string | null;
  hosted_invoice_url?: string | null;
  line_items?: Array<{ description: string; amount: number }>;
};

export type TikTokVideo = {
  video_id: string;
  uploaded_at: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  share_url: string | null;
  cover_image_url: string | null;
};

export type CustomerSubscription = {
  stripe_subscription_id: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  current_period_start: string | null;
};

export type CustomerActivityEntry = {
  id: string;
  at: string;
  kind: 'audit' | 'cm_activity' | 'game_plan' | 'concept';
  title: string;
  description: string;
  actorLabel: string | null;
  actorRole: string | null;
};

export type TikTokStats = {
  followers: number;
  follower_delta_7d: number;
  follower_delta_30d: number;
  avg_views_7d: number;
  avg_views_30d: number;
  engagement_rate: number;
  total_videos: number;
  videos_last_7d: number;
  follower_history_30d: number[];
  views_history_30d: number[];
  snapshot_dates_30d: string[];
  recent_videos: TikTokVideo[];
  window_end_iso: string;
};

type CustomerResponse = Record<string, unknown>;

function mapCustomer(raw: CustomerResponse): CustomerDetail {
  const discountType = typeof raw.discount_type === 'string' ? raw.discount_type : null;

  return {
    id: String(raw.id || ''),
    business_name: String(raw.business_name || ''),
    contact_email: String(raw.contact_email || ''),
    customer_contact_name:
      typeof raw.customer_contact_name === 'string' ? raw.customer_contact_name : null,
    phone: typeof raw.phone === 'string' ? raw.phone : null,
    account_manager:
      typeof raw.account_manager === 'string' ? raw.account_manager : null,
    account_manager_profile_id:
      typeof raw.account_manager_profile_id === 'string'
        ? raw.account_manager_profile_id
        : null,
    monthly_price:
      typeof raw.monthly_price === 'number' ? raw.monthly_price : null,
    subscription_interval:
      raw.subscription_interval === 'quarter' || raw.subscription_interval === 'year'
        ? raw.subscription_interval
        : 'month',
    pricing_status: raw.pricing_status === 'unknown' ? 'unknown' : 'fixed',
    status: String(raw.status || ''),
    created_at: String(raw.created_at || ''),
    invited_at: typeof raw.invited_at === 'string' ? raw.invited_at : null,
    agreed_at: typeof raw.agreed_at === 'string' ? raw.agreed_at : null,
    next_invoice_date:
      typeof raw.next_invoice_date === 'string' ? raw.next_invoice_date : null,
    contract_start_date:
      typeof raw.contract_start_date === 'string' ? raw.contract_start_date : null,
    billing_day_of_month:
      typeof raw.billing_day_of_month === 'number' ? raw.billing_day_of_month : null,
    upcoming_price_change:
      typeof raw.upcoming_price_effective_date === 'string' &&
      typeof raw.upcoming_monthly_price === 'number' &&
      raw.upcoming_monthly_price > 0
        ? {
            effective_date: raw.upcoming_price_effective_date,
            price: raw.upcoming_monthly_price,
          }
        : null,
    discount_type:
      discountType === 'free_months' ||
      discountType === 'percent' ||
      discountType === 'amount' ||
      discountType === 'none'
        ? discountType
        : null,
    discount_value: typeof raw.discount_value === 'number' ? raw.discount_value : null,
    discount_duration_months:
      typeof raw.discount_duration_months === 'number'
        ? raw.discount_duration_months
        : null,
    discount_ends_at:
      typeof raw.discount_end_date === 'string' ? raw.discount_end_date : null,
    tiktok_handle:
      typeof raw.tiktok_handle === 'string' ? raw.tiktok_handle : null,
    tiktok_profile_url:
      typeof raw.tiktok_profile_url === 'string' ? raw.tiktok_profile_url : null,
    tiktok_user_id:
      typeof raw.tiktok_user_id === 'string' ? raw.tiktok_user_id : null,
    concepts_per_week:
      typeof raw.concepts_per_week === 'number' ? raw.concepts_per_week : null,
    expected_concepts_per_week:
      typeof raw.expected_concepts_per_week === 'number'
        ? raw.expected_concepts_per_week
        : null,
    paused_until:
      typeof raw.paused_until === 'string' ? raw.paused_until : null,
    onboarding_state:
      raw.onboarding_state === 'cm_ready' || raw.onboarding_state === 'live' || raw.onboarding_state === 'settled' || raw.onboarding_state === 'invited'
        ? raw.onboarding_state
        : null,
    onboarding_state_changed_at:
      typeof raw.onboarding_state_changed_at === 'string' ? raw.onboarding_state_changed_at : null,
    upload_schedule: Array.isArray(raw.upload_schedule)
      ? raw.upload_schedule.filter((value): value is string => typeof value === 'string')
      : null,
    last_upload_at:
      typeof raw.last_upload_at === 'string' ? raw.last_upload_at : null,
    latest_planned_publish_date:
      typeof raw.latest_planned_publish_date === 'string'
        ? raw.latest_planned_publish_date
        : null,
    last_published_at:
      typeof raw.last_published_at === 'string' ? raw.last_published_at : null,
    last_history_sync_at:
      typeof raw.last_history_sync_at === 'string' ? raw.last_history_sync_at : null,
    pending_history_advance_at:
      typeof raw.pending_history_advance_at === 'string'
        ? raw.pending_history_advance_at
        : null,
    stripe_customer_id:
      typeof raw.stripe_customer_id === 'string' ? raw.stripe_customer_id : null,
    stripe_subscription_id:
      typeof raw.stripe_subscription_id === 'string'
        ? raw.stripe_subscription_id
        : null,
    attention_snoozes: Array.isArray(raw.attention_snoozes)
      ? raw.attention_snoozes
          .map((value) => {
            if (!value || typeof value !== 'object') return null;
            const entry = value as Record<string, unknown>;
            if (
              entry.subject_type !== 'onboarding' &&
              entry.subject_type !== 'customer_blocking'
            ) {
              return null;
            }
            return {
              subject_type: entry.subject_type,
              subject_id:
                typeof entry.subject_id === 'string' ? entry.subject_id : '',
              snoozed_until:
                typeof entry.snoozed_until === 'string'
                  ? entry.snoozed_until
                  : null,
              released_at:
                typeof entry.released_at === 'string' ? entry.released_at : null,
              note: typeof entry.note === 'string' ? entry.note : null,
            };
          })
          .filter(
            (
              entry,
            ): entry is CustomerDetail['attention_snoozes'][number] =>
              entry !== null && Boolean(entry.subject_id),
          )
      : [],
    coverage_absences: Array.isArray(raw.coverage_absences)
      ? raw.coverage_absences
          .map((value) => {
            if (!value || typeof value !== 'object') return null;
            const entry = value as Record<string, unknown>;
            return {
              id: typeof entry.id === 'string' ? entry.id : '',
              cm_id: typeof entry.cm_id === 'string' ? entry.cm_id : '',
              cm_name: typeof entry.cm_name === 'string' ? entry.cm_name : null,
              backup_cm_id:
                typeof entry.backup_cm_id === 'string' ? entry.backup_cm_id : null,
              backup_cm_name:
                typeof entry.backup_cm_name === 'string'
                  ? entry.backup_cm_name
                  : null,
              absence_type:
                typeof entry.absence_type === 'string'
                  ? entry.absence_type
                  : 'temporary_coverage',
              compensation_mode:
                entry.compensation_mode === 'primary_cm'
                  ? 'primary_cm'
                  : 'covering_cm',
              starts_on: typeof entry.starts_on === 'string' ? entry.starts_on : '',
              ends_on: typeof entry.ends_on === 'string' ? entry.ends_on : '',
              note: typeof entry.note === 'string' ? entry.note : null,
              is_active: Boolean(entry.is_active),
              is_upcoming: Boolean(entry.is_upcoming),
            };
          })
          .filter(
            (
              entry,
            ): entry is CustomerDetail['coverage_absences'][number] =>
              entry !== null && Boolean(entry.id) && Boolean(entry.starts_on) && Boolean(entry.ends_on),
          )
      : [],
  };
}

export function useCustomerDetail(id: string) {
  return useQuery({
    queryKey: ['admin', 'customer', id],
    queryFn: async (): Promise<CustomerDetail> => {
      const res = await fetch(`/api/admin/customers/${id}`, {
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Kunde inte ladda kunden');
      }

      const payload = (await res.json()) as { customer?: CustomerResponse; profile?: CustomerResponse };
      return mapCustomer((payload.customer || payload.profile || {}) as CustomerResponse);
    },
  });
}

export function useCustomerInvoices(id: string) {
  return useQuery({
    queryKey: ['admin', 'customer', id, 'invoices'],
    queryFn: async (): Promise<CustomerInvoice[]> => {
      const res = await fetch(
        `/api/admin/invoices?customer_profile_id=${id}&limit=50&includeLineItems=true`,
        {
          credentials: 'include',
        },
      );

      if (!res.ok) {
        throw new Error('Kunde inte ladda fakturor');
      }

      const payload = (await res.json()) as {
        invoices?: Array<Record<string, unknown>>;
      };

      return (payload.invoices ?? []).map((invoice) => ({
        id: String(invoice.id || ''),
        stripe_invoice_id:
          typeof invoice.stripe_invoice_id === 'string'
            ? invoice.stripe_invoice_id
            : null,
        amount_due:
          typeof invoice.amount_due === 'number' ? invoice.amount_due : null,
        status: String(invoice.status || ''),
        created_at: String(invoice.created_at || ''),
        due_date: typeof invoice.due_date === 'string' ? invoice.due_date : null,
        hosted_invoice_url:
          typeof invoice.hosted_invoice_url === 'string'
            ? invoice.hosted_invoice_url
            : null,
        line_items: Array.isArray(invoice.line_items)
          ? invoice.line_items
              .map((item) =>
                item && typeof item === 'object'
                  ? {
                      description:
                        typeof item.description === 'string'
                          ? item.description
                          : 'Rad',
                      amount: typeof item.amount === 'number' ? item.amount : 0,
                    }
                  : null,
              )
              .filter(
                (
                  item,
                ): item is {
                  description: string;
                  amount: number;
                } => item !== null,
              )
          : [],
      }));
    },
  });
}

export function useCustomerSubscription(id: string, stripeSubscriptionId: string | null) {
  return useQuery({
    queryKey: ['admin', 'customer', id, 'subscription', stripeSubscriptionId],
    enabled: Boolean(id && stripeSubscriptionId),
    queryFn: async (): Promise<CustomerSubscription | null> => {
      const res = await fetch(
        `/api/admin/subscriptions?customer_profile_id=${id}&limit=5`,
        {
          credentials: 'include',
        }
      );

      if (!res.ok) {
        return null;
      }

      const payload = (await res.json()) as {
        subscriptions?: Array<Record<string, unknown>>;
      };

      const target = (payload.subscriptions ?? []).find(
        (subscription) =>
          typeof subscription.stripe_subscription_id === 'string' &&
          subscription.stripe_subscription_id === stripeSubscriptionId
      );

      if (!target || typeof target.stripe_subscription_id !== 'string') {
        return null;
      }

      return {
        stripe_subscription_id: target.stripe_subscription_id,
        status: String(target.status || ''),
        cancel_at_period_end: Boolean(target.cancel_at_period_end),
        current_period_end:
          typeof target.current_period_end === 'string'
            ? target.current_period_end
            : null,
        current_period_start:
          typeof target.current_period_start === 'string'
            ? target.current_period_start
            : null,
      };
    },
  });
}

export function useTikTokStats(id: string) {
  return useQuery({
    queryKey: ['admin', 'customer', id, 'tiktok'],
    queryFn: async (): Promise<TikTokStats | null> => {
      const res = await fetch(`/api/admin/customers/${id}/tiktok-stats`, {
        credentials: 'include',
      });

      if (!res.ok) {
        return null;
      }

      return (await res.json()) as TikTokStats | null;
    },
  });
}

export function useCustomerActivity(id: string) {
  return useQuery({
    queryKey: ['admin', 'customer', id, 'activity'],
    queryFn: async (): Promise<{
      activities: CustomerActivityEntry[];
      schemaWarnings: string[];
    }> => {
      const res = await fetch(`/api/admin/customers/${id}/activity-log`, {
        credentials: 'include',
      });

      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        activities?: CustomerActivityEntry[];
        schemaWarnings?: string[];
      };

      if (!res.ok) {
        throw new Error(payload.error || 'Kunde inte ladda aktivitetsloggen');
      }

      return {
        activities: Array.isArray(payload.activities) ? payload.activities : [],
        schemaWarnings: Array.isArray(payload.schemaWarnings) ? payload.schemaWarnings : [],
      };
    },
    staleTime: 30_000,
  });
}
