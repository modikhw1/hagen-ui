import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  listEnrichedCmAbsences,
} from '@/lib/admin/cm-absences';
import type { CustomerInvitePayload } from '@/lib/schemas/customer';
import type { Database, Tables } from '@/types/database';

type CustomerProfileRow = Tables<'customer_profiles'>;
type CustomerBufferRow = Database['public']['Views']['v_customer_buffer']['Row'];
type AttentionSnoozeRow = Database['public']['Tables']['attention_snoozes']['Row'];
type CustomerDetailRpcPayload = {
  profile: Record<string, unknown> | null;
  buffer_row?: Record<string, unknown> | null;
  attention_snoozes?: Array<Record<string, unknown>>;
  coverage_absences?: Array<Record<string, unknown>>;
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

export function buildCustomerPayload(
  profile: Record<string, unknown>,
  options?: {
    bufferRow?: Record<string, unknown> | null;
    attentionSnoozes?: Array<Record<string, unknown>>;
    coverageAbsences?: Array<Record<string, unknown>>;
  },
) {
  return {
    customer: {
      ...profile,
      latest_planned_publish_date:
        options?.bufferRow?.latest_planned_publish_date ?? null,
      last_published_at: options?.bufferRow?.last_published_at ?? null,
      attention_snoozes: options?.attentionSnoozes ?? [],
      coverage_absences: options?.coverageAbsences ?? [],
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
  const rpcPayload = await loadCustomerDetailFromRpc(supabaseAdmin, id);
  const fallbackPayload =
    rpcPayload ?? (await loadCustomerDetailFromRelations(supabaseAdmin, id));
  const profile = fallbackPayload.profile;

  if (!user.is_admin && user.role !== 'admin') {
    const isAssignedContentManager =
      user.role === 'content_manager' &&
      profile?.account_manager_profile_id === user.id;
    const isCustomerOwner =
      user.role === 'customer' &&
      (profile?.user_id === user.id || profile?.id === user.id);

    if (!isAssignedContentManager && !isCustomerOwner) {
      const accessError = new Error('Du saknar behorighet');
      Object.assign(accessError, { statusCode: 403 });
      throw accessError;
    }
  }

  return buildCustomerPayload(profile as Record<string, unknown>, {
    bufferRow: (fallbackPayload.bufferRow ?? null) as CustomerBufferRow | null,
    attentionSnoozes: (fallbackPayload.attentionSnoozes ?? []) as AttentionSnoozeRow[],
    coverageAbsences: fallbackPayload.coverageAbsences,
  });
}

async function loadCustomerDetailFromRpc(
  supabaseAdmin: SupabaseClient<Database>,
  id: string,
) {
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

    throw new Error(error.message || 'Kunde inte hamta kunddetaljer');
  }

  if (!data?.profile) {
    throw new Error('Kunden hittades inte');
  }

  return {
    profile: data.profile,
    bufferRow: data.buffer_row ?? null,
    attentionSnoozes: data.attention_snoozes ?? [],
    coverageAbsences: data.coverage_absences ?? [],
  };
}

async function loadCustomerDetailFromRelations(
  supabaseAdmin: SupabaseClient<Database>,
  id: string,
) {
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
    throw new Error(bufferResult.error.message || 'Kunde inte hamta bufferdata');
  }

  if (snoozesResult.error && !isMissingRelationError(snoozesResult.error.message)) {
    throw new Error(
      snoozesResult.error.message || 'Kunde inte hamta hanteras-markeringar',
    );
  }

  return {
    profile: profile as Record<string, unknown>,
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
  };
}

export type { CustomerProfileRow };
