import 'server-only';

import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminCustomerTag } from '@/lib/admin/cache-tags';
import { listEnrichedCmAbsences } from '@/lib/admin/cm-absences';
import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import {
  deriveCustomerStatus,
  type DerivedCustomerStatus,
} from '@/lib/admin/customer-status';
import type { CustomerInvitePayload } from '@/lib/schemas/customer';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import type { Database, Tables } from '@/types/database';

type CustomerProfileRow = Tables<'customer_profiles'>;
type CustomerBufferRow = Database['public']['Views']['v_customer_buffer']['Row'];
type AttentionSnoozeRow = Database['public']['Tables']['attention_snoozes']['Row'];
type CustomerDetailRpcPayload = {
  profile: Record<string, unknown> | null;
  buffer_row?: Record<string, unknown> | null;
  attention_snoozes?: Array<Record<string, unknown>>;
  coverage_absences?: Array<Record<string, unknown>>;
  derived_status?: string | null;
};

type LoadedDetailPayload = {
  profile: Record<string, unknown>;
  bufferRow: Record<string, unknown> | null;
  attentionSnoozes: Array<Record<string, unknown>>;
  coverageAbsences: Array<Record<string, unknown>>;
  derivedStatus: DerivedCustomerStatus | string | null;
};

export function isMissingRelationError(message?: string | null) {
  return (
    typeof message === 'string' &&
    message.toLowerCase().includes('relation') &&
    message.toLowerCase().includes('does not exist')
  );
}

function isMissingFunctionError(message?: string | null) {
  const normalized = message?.toLowerCase() ?? '';
  return (
    normalized.includes('admin_get_customer_detail') &&
    (normalized.includes('does not exist') || normalized.includes('could not find the function'))
  );
}

function normalizeUpcomingPriceChange(profile: Record<string, unknown>) {
  const raw = profile.upcoming_price_change;
  if (raw && typeof raw === 'object') {
    const asRecord = raw as Record<string, unknown>;
    if (
      typeof asRecord.effective_date === 'string' &&
      (typeof asRecord.price_ore === 'number' || typeof asRecord.price === 'number')
    ) {
      return asRecord;
    }
  }

  const effectiveDate =
    typeof profile.upcoming_price_effective_date === 'string'
      ? profile.upcoming_price_effective_date
      : null;
  const upcomingMonthlyPrice =
    typeof profile.upcoming_monthly_price === 'number'
      ? profile.upcoming_monthly_price
      : typeof profile.upcoming_monthly_price === 'string'
        ? Number(profile.upcoming_monthly_price)
        : null;

  if (
    effectiveDate &&
    upcomingMonthlyPrice !== null &&
    Number.isFinite(upcomingMonthlyPrice) &&
    upcomingMonthlyPrice > 0
  ) {
    return {
      effective_date: effectiveDate,
      price: upcomingMonthlyPrice,
    };
  }

  return null;
}

export function buildCustomerPayload(
  profile: Record<string, unknown>,
  options?: {
    bufferRow?: Record<string, unknown> | null;
    attentionSnoozes?: Array<Record<string, unknown>>;
    coverageAbsences?: Array<Record<string, unknown>>;
    derivedStatus?: string | null;
  },
) {
  const upcomingPriceChange = normalizeUpcomingPriceChange(profile);
  const derivedStatus =
    (typeof options?.derivedStatus === 'string' ? options.derivedStatus : null) ??
    deriveCustomerStatus({
      status: typeof profile.status === 'string' ? profile.status : null,
      archived_at:
        typeof profile.archived_at === 'string' ? profile.archived_at : null,
      paused_until:
        typeof profile.paused_until === 'string' ? profile.paused_until : null,
      invited_at:
        typeof profile.invited_at === 'string' ? profile.invited_at : null,
      concepts_per_week:
        typeof profile.concepts_per_week === 'number'
          ? profile.concepts_per_week
          : typeof profile.concepts_per_week === 'string'
            ? Number(profile.concepts_per_week)
            : null,
      latest_planned_publish_date:
        typeof options?.bufferRow?.latest_planned_publish_date === 'string'
          ? options.bufferRow.latest_planned_publish_date
          : null,
      escalation_flag:
        typeof profile.escalation_flag === 'boolean'
          ? profile.escalation_flag
          : null,
    });

  return {
    customer: {
      ...profile,
      ...(derivedStatus ? { derived_status: derivedStatus } : {}),
      upcoming_price_change: upcomingPriceChange,
      latest_planned_publish_date:
        options?.bufferRow?.latest_planned_publish_date ?? null,
      last_published_at: options?.bufferRow?.last_published_at ?? null,
      // Ensure these are ALWAYS arrays, even if the spread profile had them as null/undefined
      attention_snoozes: Array.isArray(options?.attentionSnoozes) ? options.attentionSnoozes : [],
      coverage_absences: Array.isArray(options?.coverageAbsences) ? options.coverageAbsences : [],
    },
  };
}

export function profileToInvitePayload(
  profile: Record<string, unknown>,
): CustomerInvitePayload {
  const pricingStatus: 'fixed' | 'unknown' =
    profile.pricing_status === 'unknown' ? 'unknown' : 'fixed';
  const firstInvoiceBehavior: 'prorated' | 'full' | 'free_until_anchor' =
    profile.first_invoice_behavior === 'full' ||
    profile.first_invoice_behavior === 'free_until_anchor'
      ? profile.first_invoice_behavior
      : 'prorated';
  const subscriptionInterval: 'month' | 'quarter' | 'year' =
    profile.subscription_interval === 'quarter' ||
    profile.subscription_interval === 'year'
      ? profile.subscription_interval
      : 'month';

  return {
    business_name: String(profile.business_name || ''),
    contact_email: String(profile.contact_email || ''),
    customer_contact_name:
      typeof profile.customer_contact_name === 'string'
        ? profile.customer_contact_name
        : null,
    phone: typeof profile.phone === 'string' ? profile.phone : null,
    tiktok_profile_url:
      typeof profile.tiktok_profile_url === 'string'
        ? profile.tiktok_profile_url
        : null,
    account_manager:
      typeof profile.account_manager === 'string' ? profile.account_manager : null,
    monthly_price: Number(profile.monthly_price) || 0,
    pricing_status: pricingStatus,
    contract_start_date:
      typeof profile.contract_start_date === 'string'
        ? profile.contract_start_date
        : null,
    billing_day_of_month: Math.max(
      1,
      Math.min(28, Number(profile.billing_day_of_month) || 25),
    ),
    first_invoice_behavior: firstInvoiceBehavior,
    waive_days_until_billing: false,
    discount_type: 'none',
    discount_value: 0,
    discount_duration_months: 1,
    discount_start_date: null,
    discount_end_date: null,
    subscription_interval: subscriptionInterval,
    invoice_text:
      typeof profile.invoice_text === 'string' ? profile.invoice_text : null,
    scope_items: Array.isArray(profile.scope_items)
      ? profile.scope_items.filter(
          (entry): entry is string => typeof entry === 'string',
        )
      : [],
    upcoming_monthly_price:
      profile.upcoming_monthly_price === null ||
      profile.upcoming_monthly_price === undefined
        ? null
        : Number(profile.upcoming_monthly_price) || null,
    upcoming_price_effective_date:
      typeof profile.upcoming_price_effective_date === 'string'
        ? profile.upcoming_price_effective_date
        : null,
  };
}

export async function loadCustomerDetail(params: {
  supabaseAdmin: SupabaseClient<Database>;
  id: string;
  user: {
    id: string;
    is_admin: boolean;
    role: string;
  };
}) {
  const { supabaseAdmin, id, user } = params;
  
  // Try RPC first
  let rpcPayload = null;
  let rpcError = null;
  try {
    rpcPayload = await loadCustomerDetailFromRpc(supabaseAdmin, id);
  } catch (err) {
    rpcError = err;
    console.error('[admin.customer-detail] RPC failed:', err);
  }

  // Fallback if RPC failed or returned nothing
  const payload =
    rpcPayload ?? (await loadCustomerDetailFromRelations(supabaseAdmin, id));

  if (!payload) {
    throw rpcError || new Error(SERVER_COPY.fetchCustomerFailed);
  }

  if (!rpcPayload) {
    console.warn(
      '[admin.customer-detail] RPC fallback activated; verify admin_get_customer_detail migration.',
      { customerId: id },
    );
  }

  const profile = payload.profile;
  if (!user.is_admin && user.role !== 'admin') {
    const isAssignedContentManager =
      user.role === 'content_manager' &&
      profile?.account_manager_profile_id === user.id;
    const isCustomerOwner =
      user.role === 'customer' &&
      (profile?.user_id === user.id || profile?.id === user.id);

    if (!isAssignedContentManager && !isCustomerOwner) {
      const accessError = new Error(SERVER_COPY.forbidden);
      Object.assign(accessError, { statusCode: 403 });
      throw accessError;
    }
  }

  return buildCustomerPayload(profile as Record<string, unknown>, {
    bufferRow: (payload.bufferRow ?? null) as CustomerBufferRow | null,
    attentionSnoozes: (payload.attentionSnoozes ?? []) as AttentionSnoozeRow[],
    coverageAbsences: payload.coverageAbsences,
    derivedStatus:
      typeof payload.derivedStatus === 'string' ? payload.derivedStatus : null,
  });
}

export async function loadAdminCustomerHeader(id: string) {
  return unstable_cache(
    async () => {
      const supabaseAdmin = createSupabaseAdmin();
      const { data, error } = await supabaseAdmin
        .from('customer_profiles')
        .select(`
          id, business_name, contact_email, customer_contact_name, 
          tiktok_handle, status, monthly_price, account_manager, 
          next_invoice_date, created_at, onboarding_state,
          discount_type, discount_value, discount_ends_at,
          subscriptions (status, current_period_end)
        `)
        .eq('id', id)
        .single();

      if (error) {
        throw new Error(error.message || SERVER_COPY.fetchCustomerHeaderFailed);
      }

      // Hämta det mest relevanta datumet (Stripe först, sedan profil)
      const activeSub = (data.subscriptions as any[])?.find(s => s.status === 'active' || s.status === 'trialing');
      const nextInvoiceDate = activeSub?.current_period_end || data.next_invoice_date;

      return {
        id: data.id,
        business_name: data.business_name ?? '',
        contact_email: data.contact_email ?? '',
        customer_contact_name: data.customer_contact_name ?? null,
        tiktok_handle: data.tiktok_handle ?? null,
        status: data.status ?? 'pending',
        monthly_price_ore: Math.round((data.monthly_price ?? 0) * 100),
        account_manager_name: data.account_manager ?? null,
        next_invoice_date: nextInvoiceDate,
        created_at: data.created_at ?? '',
        onboarding_state: data.onboarding_state ?? null,
        discount: data.discount_type && data.discount_type !== 'none' ? {
          type: data.discount_type,
          value: data.discount_value,
          ends_at: data.discount_ends_at
        } : null
      };
    },
    ['admin-customer-header-by-id', id],
    {
      revalidate: 60,
      tags: [adminCustomerTag(id)],
    },
  )();
}

async function loadCustomerDetailFromRpc(
  supabaseAdmin: SupabaseClient<Database>,
  id: string,
): Promise<LoadedDetailPayload | null> {
  const { data, error } = await (supabaseAdmin.rpc(
    'admin_get_customer_detail' as never,
    { p_id: id } as never,
  ) as unknown as Promise<{
    data: CustomerDetailRpcPayload | null;
    error: { message?: string } | null;
  }>);

  if (error) {
    if (isMissingFunctionError(error.message)) {
      return null;
    }
    throw new Error(error.message || SERVER_COPY.fetchCustomerFailed);
  }

  if (!data?.profile) {
    throw new Error(SERVER_COPY.customerNotFound);
  }

  return {
    profile: data.profile,
    bufferRow: data.buffer_row ?? null,
    attentionSnoozes: data.attention_snoozes ?? [],
    coverageAbsences: data.coverage_absences ?? [],
    derivedStatus:
      typeof data.derived_status === 'string' ? data.derived_status : null,
  };
}

async function loadCustomerDetailFromRelations(
  supabaseAdmin: SupabaseClient<Database>,
  id: string,
): Promise<LoadedDetailPayload> {
  const [{ data: profile, error }, bufferResult, snoozesResult, coverageAbsences] =
    await Promise.all([
      supabaseAdmin
        .from('customer_profiles')
        .select('*')
        .eq('id', id)
        .single(),
      supabaseAdmin
        .from('v_customer_buffer')
        .select(
          'customer_id, assigned_cm_id, concepts_per_week, paused_until, latest_planned_publish_date, last_published_at',
        )
        .eq('customer_id', id)
        .maybeSingle(),
      supabaseAdmin
        .from('attention_snoozes')
        .select('subject_type, subject_id, snoozed_until, released_at, note')
        .in('subject_type', ['onboarding', 'customer_blocking'])
        .eq('subject_id', id)
        .is('released_at', null),
      listEnrichedCmAbsences(supabaseAdmin, {
        customerProfileId: id,
        limit: 10,
      }),
    ]);

  if (error) {
    throw new Error(error.message);
  }

  if (bufferResult.error && !isMissingRelationError(bufferResult.error.message)) {
    throw new Error(bufferResult.error.message || SERVER_COPY.fetchBufferFailed);
  }

  if (snoozesResult.error && !isMissingRelationError(snoozesResult.error.message)) {
    throw new Error(
      snoozesResult.error.message || SERVER_COPY.fetchSnoozesFailed,
    );
  }

  const profileRecord = profile as Record<string, unknown>;
  const derivedStatus = deriveCustomerStatus({
    status: typeof profileRecord.status === 'string' ? profileRecord.status : null,
    archived_at:
      typeof profileRecord.archived_at === 'string'
        ? profileRecord.archived_at
        : null,
    paused_until:
      typeof profileRecord.paused_until === 'string'
        ? profileRecord.paused_until
        : null,
    invited_at:
      typeof profileRecord.invited_at === 'string'
        ? profileRecord.invited_at
        : null,
    concepts_per_week:
      typeof profileRecord.concepts_per_week === 'number'
        ? profileRecord.concepts_per_week
        : null,
    latest_planned_publish_date:
      typeof bufferResult.data?.latest_planned_publish_date === 'string'
        ? bufferResult.data.latest_planned_publish_date
        : null,
    escalation_flag:
      typeof profileRecord.escalation_flag === 'boolean'
        ? profileRecord.escalation_flag
        : null,
  });

  return {
    profile: profileRecord,
    bufferRow: (bufferResult.data ?? null) as CustomerBufferRow | null,
    attentionSnoozes: (snoozesResult.data ?? []) as AttentionSnoozeRow[],
    coverageAbsences: coverageAbsences.map((absence) => ({
      id: absence.id,
      cm_id: absence.cm_id,
      cm_name: absence.cm_name,
      backup_cm_id: absence.backup_cm_id,
      backup_cm_name: absence.backup_cm_name,
      absence_type: absence.absence_type,
      compensation_mode: absence.compensation_mode,
      starts_on: absence.starts_on,
      ends_on: absence.ends_on,
      note: absence.note,
      is_active: absence.is_active,
      is_upcoming: absence.is_upcoming,
    })),
    derivedStatus,
  };
}

export type { CustomerProfileRow };
