// app/src/lib/admin/customers/list.server.ts
import 'server-only';

import { unstable_cache } from 'next/cache';
import { ADMIN_CUSTOMERS_LIST_TAG, ADMIN_TEAM_TAG } from '@/lib/admin/cache-tags';
import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import { deriveCustomerStatus } from '@/lib/admin/customer-status';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { deriveCustomerOperationalSignals } from '@/lib/admin-derive/index.server';
import { CUSTOMERS_PAGE_SIZE } from '@/lib/admin/customers/list.constants';
import { customerListParamsInputSchema } from '@/lib/admin/customers/list.schemas';
import type {
  AdminCustomerListItem,
  AdminTeamOption,
  CustomerListFilter,
  CustomerListSort,
} from '@/lib/admin/customers/list.types';

export function parseCustomerListParams(
  searchParams: Record<string, string | string[] | undefined>,
) {
  const parsed = customerListParamsInputSchema.safeParse(searchParams);
  return parsed.success ? parsed.data : customerListParamsInputSchema.parse({});
}

function cacheKey(p: { search: string; filter: string; sort: string; page: number; pageSize: number }) {
  return [p.search, p.filter, p.sort, String(p.page), String(p.pageSize)];
}

async function loadActiveTeam(): Promise<AdminTeamOption[]> {
  return unstable_cache(
    async () => {
      const supabaseAdmin = createSupabaseAdmin();
      const { data, error } = await supabaseAdmin
        .from('team_members')
        .select('id, name, email, avatar_url')
        .eq('is_active', true)
        .order('name');
      if (error) throw new Error(error.message);
      return (data ?? []) as AdminTeamOption[];
    },
    ['admin-team-members-active-v2'],
    { revalidate: 600, tags: [ADMIN_TEAM_TAG] },
  )();
}

export async function loadAdminCustomers(params: {
  search: string;
  filter: CustomerListFilter;
  sort: CustomerListSort;
  page: number;
  pageSize?: number;
}) {
  const pageSize = params.pageSize ?? CUSTOMERS_PAGE_SIZE;
  const cacheParams = {
    search: params.search,
    filter: params.filter,
    sort: params.sort,
    page: params.page,
    pageSize,
  };

  return unstable_cache(
    async () => loadAdminCustomersSnapshot(cacheParams),
    ['admin-customers-list-v2', ...cacheKey(cacheParams)],
    { revalidate: 30, tags: [ADMIN_CUSTOMERS_LIST_TAG, ADMIN_TEAM_TAG] },
  )();
}

async function loadAdminCustomersSnapshot(params: {
  search: string;
  filter: CustomerListFilter;
  sort: CustomerListSort;
  page: number;
  pageSize: number;
}) {
  const supabaseAdmin = createSupabaseAdmin();
  const offset = (params.page - 1) * params.pageSize;
  const useInMemorySort = params.sort === 'needs_action';
  const team = await loadActiveTeam();

  const rpcResult = await supabaseAdmin.rpc('admin_get_customer_list' as any, {
    p_search: params.search.trim(),
    p_filter: params.filter,
    p_sort: useInMemorySort ? 'newest' : params.sort,
    p_offset: useInMemorySort ? 0 : offset,
    p_limit: useInMemorySort ? 500 : params.pageSize,
  });

  if (rpcResult.error) {
    return loadAdminCustomersFallback({
      supabaseAdmin,
      team,
      params,
      reason: rpcResult.error.message || SERVER_COPY.fetchCustomersFailed,
    });
  }

  const payload = rpcResult.data as { rows: any[]; total: number } | null;
  const rawRows = payload?.rows ?? [];
  const allMappedRows = mapAdminCustomers(rawRows, team);

  let pagedRows = allMappedRows;
  if (useInMemorySort) {
    pagedRows = sortAdminCustomers(allMappedRows, params.sort).slice(offset, offset + params.pageSize);
  }

  const total = payload?.total ?? allMappedRows.length;
  const totalPages = Math.max(1, Math.ceil(total / params.pageSize));

  return {
    rows: pagedRows,
    total,
    page: params.page,
    totalPages,
    team,
  };
}

function mapAdminCustomers(rawRows: any[], team: AdminTeamOption[]): AdminCustomerListItem[] {
  const nowTs = Date.now();
  return rawRows.map((customer: any) => {
    const signals = deriveCustomerOperationalSignals({
      status: customer.status ?? 'pending',
      created_at: customer.created_at ?? new Date(0).toISOString(),
      agreed_at: customer.agreed_at ?? null,
      onboarding_state:
        customer.onboarding_state === 'cm_ready' ||
        customer.onboarding_state === 'live' ||
        customer.onboarding_state === 'settled' ||
        customer.onboarding_state === 'invited'
          ? customer.onboarding_state
          : null,
      expected_concepts_per_week: customer.expected_concepts_per_week ?? null,
      concepts_per_week: customer.concepts_per_week ?? null,
      latest_planned_publish_date: customer.latest_planned_publish_date ?? null,
      last_published_at: customer.last_published_at ?? null,
      paused_until: customer.paused_until ?? null,
      tiktok_handle: customer.tiktok_handle ?? null,
      attention_snoozes: Array.isArray(customer.attention_snoozes) ? customer.attention_snoozes : [],
      planned_concepts_count: customer.planned_concepts_count ?? 0,
    });

    const derived = deriveCustomerStatus({
      status: customer.status ?? null,
      paused_until: customer.paused_until ?? null,
      invited_at: customer.invited_at ?? null,
      expected_concepts_per_week: customer.expected_concepts_per_week ?? null,
      concepts_per_week: customer.concepts_per_week ?? null,
      latest_planned_publish_date: customer.latest_planned_publish_date ?? null,
      stripe_customer_id: customer.stripe_customer_id ?? null,
    });

    const cmInTeam = team.find((member) => member.id === customer.account_manager_profile_id);
    // `customer.account_manager` is a legacy column that often holds the CM's
    // email address rather than a real name. Never surface it as a display name
    // — fall back to "Ej tilldelad" instead so the table stays clean.
    const legacyAccountManager =
      typeof customer.account_manager === 'string' && !customer.account_manager.includes('@')
        ? customer.account_manager
        : null;
    const cm_full_name =
      cmInTeam?.name || customer.cm_full_name || legacyAccountManager || 'Ej tilldelad';
    const cm_avatar_url = cmInTeam?.avatar_url || customer.cm_avatar_url || null;

    // Compute the operational pulse server-side so SSR and client agree.
    const expected = customer.expected_concepts_per_week ?? 2;
    const planned = customer.planned_concepts_count ?? 0;
    const lastCmActionMs = customer.last_cm_action_at
      ? new Date(customer.last_cm_action_at).getTime()
      : null;
    const lastPublishedMs = customer.last_published_at
      ? new Date(customer.last_published_at).getTime()
      : null;
    const daysSinceCM = lastCmActionMs ? (nowTs - lastCmActionMs) / 86_400_000 : 999;
    const daysSinceUpload = lastPublishedMs ? (nowTs - lastPublishedMs) / 86_400_000 : 999;

    let pulse_status: 'ok' | 'stagnant' | 'needs_action' | 'resting' = 'ok';
    let pulse_reason = 'Allt rullar på som det ska';

    if (planned < expected * 1.5) {
      pulse_status = 'needs_action';
      pulse_reason = `Koncept behövs (bara ${planned} kvar)`;
    } else if (daysSinceCM > 7 || daysSinceUpload > 7) {
      pulse_status = 'stagnant';
      if (daysSinceCM > 7 && daysSinceUpload > 7) {
        pulse_reason = 'Står still (ingen CM-aktivitet eller uppladdning)';
      } else if (daysSinceCM > 7) {
        pulse_reason = `Står still (${Math.floor(daysSinceCM)}d sedan CM-åtgärd)`;
      } else {
        pulse_reason = `Står still (${Math.floor(daysSinceUpload)}d sedan uppladdning)`;
      }
    } else if (customer.status === 'paused' || customer.paused_until) {
      pulse_status = 'resting';
      pulse_reason = 'Vilande / Pausad';
    }

    return {
      ...customer,
      cm_full_name,
      cm_avatar_url,
      derived_status: derived ?? customer.status,
      operational_signals: signals,
      pulse_status,
      pulse_reason,
    } as AdminCustomerListItem;
  });
}

function sortAdminCustomers(rows: AdminCustomerListItem[], sort: CustomerListSort) {
  return [...rows].sort((a, b) => {
    switch (sort) {
      case 'name_asc':
      case 'alphabetical':
        return a.business_name.localeCompare(b.business_name, 'sv');
      case 'name_desc':
        return b.business_name.localeCompare(a.business_name, 'sv');
      case 'cm_asc':
        return (a.cm_full_name ?? a.account_manager ?? '').localeCompare(
          b.cm_full_name ?? b.account_manager ?? '',
          'sv',
        );
      case 'cm_desc':
        return (b.cm_full_name ?? b.account_manager ?? '').localeCompare(
          a.cm_full_name ?? a.account_manager ?? '',
          'sv',
        );
      case 'price_asc':
        return (a.monthly_price ?? Number.POSITIVE_INFINITY) - (b.monthly_price ?? Number.POSITIVE_INFINITY);
      case 'price_desc':
        return (b.monthly_price ?? Number.NEGATIVE_INFINITY) - (a.monthly_price ?? Number.NEGATIVE_INFINITY);
      case 'status_asc':
        return (a.status ?? '').localeCompare(b.status ?? '', 'sv');
      case 'status_desc':
        return (b.status ?? '').localeCompare(a.status ?? '', 'sv');
      case 'needs_action': {
        const aScore = a.operational_signals?.attention_score ?? 0;
        const bScore = b.operational_signals?.attention_score ?? 0;
        return bScore - aScore;
      }
      case 'recent':
      default:
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });
}

async function loadAdminCustomersFallback(input: {
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>;
  team: AdminTeamOption[];
  reason: string;
  params: {
    search: string;
    filter: CustomerListFilter;
    sort: CustomerListSort;
    page: number;
    pageSize: number;
  };
}) {
  const { supabaseAdmin, team, reason, params } = input;
  const offset = (params.page - 1) * params.pageSize;
  const { data, error } = await (supabaseAdmin as any).from('v_admin_customer_list').select('*');

  if (error) {
    throw new Error(reason);
  }

  const searchTerm = params.search.trim().toLocaleLowerCase('sv-SE');
  const mappedRows = mapAdminCustomers((data ?? []) as any[], team);
  const filteredRows = mappedRows.filter((customer) => {
    const statusMatch =
      params.filter === 'all'
        ? customer.status !== 'prospect'
        : params.filter === 'active'
          ? ['active', 'agreed'].includes(customer.status)
          : params.filter === 'pending'
            ? ['invited', 'pending', 'pending_payment', 'pending_invoice', 'past_due'].includes(customer.status)
            : params.filter === 'paused'
              ? customer.status === 'paused'
              : params.filter === 'archived'
                ? customer.status === 'archived'
                : params.filter === 'prospect'
                  ? customer.status === 'prospect'
                  : true;

    if (!statusMatch) return false;
    if (!searchTerm) return true;

    const haystack = [
      customer.business_name,
      customer.contact_email,
      customer.customer_contact_name,
      customer.cm_full_name,
      customer.account_manager,
    ]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .join(' ')
      .toLocaleLowerCase('sv-SE');

    return haystack.includes(searchTerm);
  });

  const sortedRows = sortAdminCustomers(filteredRows, params.sort);
  const pagedRows = sortedRows.slice(offset, offset + params.pageSize);
  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / params.pageSize));

  return {
    rows: pagedRows,
    total,
    page: params.page,
    totalPages,
    team,
  };
}
