import 'server-only';

import { unstable_cache } from 'next/cache';
import type { Tables } from '@/types/database';
import { ADMIN_CUSTOMERS_LIST_TAG } from '@/lib/admin/cache-tags';
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

export function parseCustomerListParams(searchParams: Record<string, string | string[] | undefined>) {
  const parsed = customerListParamsInputSchema.safeParse(searchParams);
  return parsed.success
    ? parsed.data
    : customerListParamsInputSchema.parse({});
}

export async function loadAdminCustomers(params: {
  search: string;
  filter: CustomerListFilter;
  sort: CustomerListSort;
  page: number;
  pageSize?: number;
}) {
  const cacheKey = JSON.stringify(params);
  return unstable_cache(
    async () => loadAdminCustomersSnapshot(params),
    ['admin-customers-list', cacheKey],
    {
      revalidate: 60,
      tags: [ADMIN_CUSTOMERS_LIST_TAG],
    },
  )();
}

async function loadAdminCustomersSnapshot(params: {
  search: string;
  filter: CustomerListFilter;
  sort: CustomerListSort;
  page: number;
  pageSize?: number;
}) {
  const supabaseAdmin = createSupabaseAdmin();
  const pageSize = params.pageSize ?? CUSTOMERS_PAGE_SIZE;
  const ascending = params.sort === 'oldest';
  const requestedPage = params.page;
  const startIndex = (requestedPage - 1) * pageSize;
  const endIndex = startIndex + pageSize - 1;
  const q = params.search.trim();

  // Use the new unified view that combines profiles and buffer data
  let customerQuery = supabaseAdmin
    .from('v_admin_customer_list' as any)
    .select('*', { count: 'exact' });

  if (q) {
    const pattern = `%${q}%`;
    customerQuery = customerQuery.or(
      `business_name.ilike.${pattern},contact_email.ilike.${pattern}`,
    );
  }

  if (params.filter === 'active') {
    customerQuery = customerQuery.in('status', ['active', 'agreed', 'paused', 'past_due']);
  } else if (params.filter === 'pipeline') {
    customerQuery = customerQuery.in('status', [
      'invited',
      'pending',
      'pending_payment',
      'pending_invoice',
    ]);
  } else if (params.filter === 'archived') {
    customerQuery = customerQuery.eq('status', 'archived');
  }

  // Handle sorting
  if (params.sort === 'newest') {
    customerQuery = customerQuery.order('created_at', { ascending: false });
  } else if (params.sort === 'oldest') {
    customerQuery = customerQuery.order('created_at', { ascending: true });
  } else if (params.sort === 'alphabetical') {
    customerQuery = customerQuery.order('business_name', { ascending: true });
  }

  // If sorting by needs_action, we might need to fetch all and sort in memory
  // because the signals are derived in code.
  // For other sorts, we can use server-side pagination.
  const useInMemorySort = params.sort === 'needs_action';
  
  if (!useInMemorySort) {
    customerQuery = customerQuery.range(startIndex, endIndex);
  }

  // Fetch unified customer data and team members in parallel
  const [customerResult, teamResult] = await Promise.all([
    customerQuery,
    unstable_cache(
      async () => {
        const { data, error } = await supabaseAdmin
          .from('team_members')
          .select('id, name, email')
          .eq('is_active', true)
          .order('name');
        if (error) throw error;
        return data;
      },
      ['admin-team-members-active'],
      { revalidate: 300, tags: ['admin-team'] }
    )()
  ]);

  if (customerResult.error) throw new Error(customerResult.error.message);

  const unifiedRows = (customerResult.data ?? []) as any[];
  const total = customerResult.count ?? unifiedRows.length;
  
  const today = new Date();
  const teamRows = teamResult ?? [];

  const allMappedRows = unifiedRows.map((customer) => {
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
      attention_snoozes: [],
    }, today);

    const onboardingAttentionDays =
      signals.onboardingState === 'cm_ready' && customer.onboarding_state_changed_at
        ? Math.max(
            0,
            Math.floor(
              (today.getTime() - new Date(customer.onboarding_state_changed_at).getTime()) /
                86_400_000,
            ),
          )
        : 0;

    const item: AdminCustomerListItem = {
      id: customer.id,
      business_name: customer.business_name ?? '',
      contact_email: customer.contact_email ?? '',
      customer_contact_name: customer.customer_contact_name ?? null,
      account_manager: customer.account_manager ?? null,
      account_manager_profile_id: customer.account_manager_profile_id ?? null,
      monthly_price: customer.monthly_price ?? null,
      pricing_status: customer.pricing_status === 'unknown' ? 'unknown' : 'fixed',
      created_at: customer.created_at ?? new Date(0).toISOString(),
      status: customer.status ?? 'pending',
      onboardingState: signals.onboardingState,
      onboardingNeedsAttention:
        signals.onboardingState === 'cm_ready' && onboardingAttentionDays >= 7,
      onboardingAttentionDays,
      bufferStatus: signals.bufferStatus,
      blocking: { state: signals.blocking.state },
      blockingDisplayDays: signals.visibleBlockingDays,
      isNew: signals.onboardingState !== 'settled',
      derived_status: deriveCustomerStatus({
        status: customer.status ?? 'pending',
        archived_at: null,
        paused_until: customer.paused_until ?? null,
        invited_at: customer.invited_at ?? null,
        concepts_per_week: customer.concepts_per_week ?? null,
        latest_planned_publish_date: customer.latest_planned_publish_date ?? null,
        escalation_flag: signals.blocking.state === 'escalated',
      }),
      last_upload_at: customer.last_upload_at ?? null,
      concepts_per_week: customer.concepts_per_week ?? null,
      scheduled_cm_change: customer.scheduled_cm_change
        ? {
            effective_date: customer.scheduled_cm_change.effective_date,
            next_cm_name: customer.scheduled_cm_change.next_cm_name || 'Okänd',
          }
        : null,
      paused_until: customer.paused_until ?? null,
    };
    return item;
  });

  let finalRows = allMappedRows;
  if (useInMemorySort) {
    finalRows.sort((a, b) => {
      const score = (item: AdminCustomerListItem) => {
        if (item.blocking.state === 'escalated') return 4;
        if (item.onboardingNeedsAttention) return 3;
        if (item.bufferStatus === 'under' || item.bufferStatus === 'thin') return 2;
        if (item.status === 'past_due') return 1;
        return 0;
      };
      return score(b) - score(a);
    });
    // Paginate manually
    finalRows = finalRows.slice(startIndex, startIndex + pageSize);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);

  return {
    rows: finalRows,
    total,
    page,
    pageSize,
    totalPages,
    team: (teamRows ?? []) as AdminTeamOption[],
  };
}
