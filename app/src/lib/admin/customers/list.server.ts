import 'server-only';

import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { deriveCustomerOperationalSignals, type BlockingState, type CustomerBufferStatus, type OnboardingState } from '@/lib/admin-derive/index.server';

export type CustomerListFilter = 'all' | 'active' | 'pipeline' | 'archived';
export type CustomerListSort = 'newest' | 'oldest';

export type AdminCustomerListItem = {
  id: string;
  business_name: string;
  contact_email: string;
  customer_contact_name: string | null;
  account_manager: string | null;
  monthly_price: number | null;
  pricing_status: 'fixed' | 'unknown' | null;
  created_at: string;
  status: string;
  onboardingState: OnboardingState;
  onboardingNeedsAttention: boolean;
  onboardingAttentionDays: number;
  bufferStatus: CustomerBufferStatus;
  blocking: { state: BlockingState };
  blockingDisplayDays: number;
  isNew: boolean;
};

export type AdminTeamOption = {
  id: string;
  name: string;
  email: string | null;
  color: string | null;
};

function normalizeFilter(value?: string | null): CustomerListFilter {
  return value === 'active' || value === 'pipeline' || value === 'archived' ? value : 'all';
}

function normalizeSort(value?: string | null): CustomerListSort {
  return value === 'oldest' ? 'oldest' : 'newest';
}

function normalizePage(value?: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function parseCustomerListParams(searchParams: Record<string, string | string[] | undefined>) {
  const value = (key: string) => {
    const input = searchParams[key];
    return Array.isArray(input) ? input[0] : input;
  };

  return {
    search: value('q')?.trim() ?? '',
    filter: normalizeFilter(value('filter')),
    sort: normalizeSort(value('sort')),
    page: normalizePage(value('page')),
  };
}

function matchesFilter(status: string, filter: CustomerListFilter) {
  if (filter === 'all') return true;
  if (filter === 'active') {
    return ['active', 'agreed', 'paused', 'past_due'].includes(status);
  }
  if (filter === 'pipeline') {
    return ['invited', 'pending', 'pending_payment', 'pending_invoice'].includes(status);
  }
  return status === 'archived';
}

export async function loadAdminCustomers(params: {
  search: string;
  filter: CustomerListFilter;
  sort: CustomerListSort;
  page: number;
  pageSize?: number;
}) {
  const supabaseAdmin = createSupabaseAdmin();
  const pageSize = params.pageSize ?? 25;
  const [{ data: customers, error: customerError }, { data: bufferRows, error: bufferError }, { data: teamRows, error: teamError }] =
    await Promise.all([
      supabaseAdmin.from('customer_profiles').select('*').order('created_at', { ascending: false }),
      supabaseAdmin
        .from('v_customer_buffer')
        .select(
          'customer_id, assigned_cm_id, concepts_per_week, paused_until, latest_planned_publish_date, last_published_at',
        ),
      supabaseAdmin
        .from('team_members')
        .select('id, name, email, color')
        .eq('is_active', true)
        .order('name'),
    ]);

  if (customerError) {
    throw new Error(customerError.message);
  }

  if (bufferError) {
    throw new Error(bufferError.message || 'Kunde inte hamta bufferdata');
  }

  if (teamError) {
    throw new Error(teamError.message || 'Kunde inte hamta teammedlemmar');
  }

  const today = new Date();
  const q = params.search.toLowerCase();
  const bufferByCustomerId = new Map((bufferRows ?? []).map((row) => [row.customer_id, row]));

  const filtered = (customers ?? [])
    .map((customer) => {
      const buffer = bufferByCustomerId.get(customer.id);
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
        latest_planned_publish_date: buffer?.latest_planned_publish_date ?? null,
        last_published_at: buffer?.last_published_at ?? null,
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

      return {
        id: customer.id,
        business_name: customer.business_name ?? '',
        contact_email: customer.contact_email ?? '',
        customer_contact_name: customer.customer_contact_name ?? null,
        account_manager: customer.account_manager ?? null,
        monthly_price: customer.monthly_price ?? null,
        pricing_status: customer.pricing_status === 'unknown' ? 'unknown' : 'fixed',
        created_at: customer.created_at ?? new Date(0).toISOString(),
        status: customer.status ?? 'pending',
        onboardingState: signals.onboardingState,
        onboardingNeedsAttention: signals.onboardingState === 'cm_ready' && onboardingAttentionDays >= 7,
        onboardingAttentionDays,
        bufferStatus: signals.bufferStatus,
        blocking: { state: signals.blocking.state },
        blockingDisplayDays: signals.visibleBlockingDays,
        isNew: signals.onboardingState !== 'settled',
      } satisfies AdminCustomerListItem;
    })
    .filter((customer) => {
      const matchesSearch =
        !q ||
        customer.business_name.toLowerCase().includes(q) ||
        customer.contact_email.toLowerCase().includes(q);
      return matchesSearch && matchesFilter(customer.status, params.filter);
    })
    .sort((left, right) => {
      const leftValue = new Date(left.created_at).getTime();
      const rightValue = new Date(right.created_at).getTime();
      return params.sort === 'newest' ? rightValue - leftValue : leftValue - rightValue;
    });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(params.page, totalPages);
  const startIndex = (page - 1) * pageSize;
  const rows = filtered.slice(startIndex, startIndex + pageSize);

  return {
    rows,
    total,
    page,
    pageSize,
    totalPages,
    team: (teamRows ?? []) as AdminTeamOption[],
  };
}
