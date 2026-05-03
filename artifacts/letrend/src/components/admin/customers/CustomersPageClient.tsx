// app/src/components/admin/customers/CustomersPageClient.tsx

'use client';

import { useEffect, useMemo, useState } from 'react';

import { PageHeader } from '@/components/admin/ui/layout/PageHeader';
import { CustomersTable } from '@/components/admin/customers/CustomersTable';
import { CustomersFilters } from '@/components/admin/customers/CustomersFilters';
import { CustomersPagination } from '@/components/admin/customers/CustomersPagination';
import { ExportCustomersLink } from '@/components/admin/customers/ExportCustomersLink';
import { AddCustomerButton } from '@/components/admin/customers/AddCustomerButton';
import { useCustomerListParamsState } from '@/hooks/admin/useCustomerListParamsState';
import { useAdminRefresh } from '@/hooks/admin/useAdminRefresh';
import { apiClient } from '@/lib/admin/api-client';
import { deriveCustomerOperationalSignals } from '@/lib/admin-derive';
import { resolveExpectedConceptsPerWeek } from '@/lib/admin-derive/expected-per-week';
import { deriveCustomerStatus } from '@/lib/admin/customer-status';
import type {
  AdminCustomerListItem,
  AdminTeamOption,
  CustomerListFilter,
  CustomerListSort,
} from '@/lib/admin/customers/list.types';

export interface CustomersPageClientProps {
  initialItems: AdminCustomerListItem[];
  initialTotal: number;
  initialPageSize: number;
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
      brief: customer.brief ?? null,
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

    const cmInTeam = team.find(
      (member) =>
        (member.profile_id && member.profile_id === customer.account_manager_profile_id) ||
        (member.id === customer.account_manager_profile_id),
    );
    const legacyAccountManager =
      typeof customer.account_manager === 'string' && !customer.account_manager.includes('@')
        ? customer.account_manager
        : null;

    const cm_full_name =
      cmInTeam?.name || customer.cm_full_name || legacyAccountManager || null;
    const cm_avatar_url = cmInTeam?.avatar_url || customer.cm_avatar_url || null;

    const expected = resolveExpectedConceptsPerWeek({
      brief: customer.brief ?? null,
      expected_concepts_per_week: customer.expected_concepts_per_week ?? null,
      concepts_per_week: customer.concepts_per_week ?? null,
    });
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

function applyFilter(rows: AdminCustomerListItem[], filter: CustomerListFilter) {
  return rows.filter((c) => {
    switch (filter) {
      case 'all': return c.status !== 'prospect';
      case 'active': return ['active', 'agreed'].includes(c.status);
      case 'pending': return ['invited', 'pending', 'pending_payment', 'pending_invoice', 'past_due'].includes(c.status);
      case 'paused': return c.status === 'paused';
      case 'archived': return c.status === 'archived';
      case 'prospect': return c.status === 'prospect';
      default: return true;
    }
  });
}

function applySort(rows: AdminCustomerListItem[], sort: CustomerListSort) {
  return [...rows].sort((a, b) => {
    switch (sort) {
      case 'name_asc':
      case 'alphabetical':
        return a.business_name.localeCompare(b.business_name, 'sv');
      case 'name_desc':
        return b.business_name.localeCompare(a.business_name, 'sv');
      case 'cm_asc': {
        const x = a.cm_full_name || 'ÖÖÖ';
        const y = b.cm_full_name || 'ÖÖÖ';
        return x.localeCompare(y, 'sv');
      }
      case 'cm_desc': {
        const x = a.cm_full_name || '';
        const y = b.cm_full_name || '';
        return y.localeCompare(x, 'sv');
      }
      case 'price_asc':
        return (a.monthly_price ?? Number.POSITIVE_INFINITY) - (b.monthly_price ?? Number.POSITIVE_INFINITY);
      case 'price_desc':
        return (b.monthly_price ?? Number.NEGATIVE_INFINITY) - (a.monthly_price ?? Number.NEGATIVE_INFINITY);
      case 'status_asc':
        return (a.status ?? '').localeCompare(b.status ?? '', 'sv');
      case 'status_desc':
        return (b.status ?? '').localeCompare(a.status ?? '', 'sv');
      case 'needs_action': {
        const aScore = (a.operational_signals as any)?.attention_score ?? 0;
        const bScore = (b.operational_signals as any)?.attention_score ?? 0;
        return bScore - aScore;
      }
      case 'recent':
      default:
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });
}

export function CustomersPageClient({
  initialItems,
  initialPageSize,
}: CustomersPageClientProps) {
  const {
    params,
    searchInput,
    setSearchInput,
    submitSearch,
    dispatch,
    isPending,
  } = useCustomerListParamsState();

  const refresh = useAdminRefresh();
  const [allItems, setAllItems] = useState<AdminCustomerListItem[]>(initialItems);
  const [team, setTeam] = useState<AdminTeamOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Refetch when search changes (server-side filtering on q for performance)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const query: Record<string, string | number> = { limit: 200 };
    if (params.search.trim().length >= 2) query['q'] = params.search.trim();

    Promise.all([
      apiClient.get<{ customers: any[] }>('/api/admin/customers', { query }),
      apiClient.get<{ members: AdminTeamOption[] }>('/api/admin/team/lite').catch(() => ({ members: [] })),
    ])
      .then(([customersRes, teamRes]) => {
        if (cancelled) return;
        const teamData = teamRes.members ?? [];
        setTeam(teamData);
        setAllItems(mapAdminCustomers(customersRes.customers ?? [], teamData));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Kunde inte ladda kunder');
        setAllItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params.search, reloadKey]);

  const handleRefresh = () => {
    refresh(['customers']);
    setReloadKey((n) => n + 1);
  };

  const filtered = useMemo(() => applyFilter(allItems, params.filter), [allItems, params.filter]);
  const sorted = useMemo(() => applySort(filtered, params.sort), [filtered, params.sort]);
  const total = sorted.length;
  const offset = (params.page - 1) * initialPageSize;
  const pageItems = sorted.slice(offset, offset + initialPageSize);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kunder"
        subtitle={loading ? 'Laddar...' : `${total} kund${total === 1 ? '' : 'er'}`}
        actions={
          <div className="flex items-center gap-2">
            <ExportCustomersLink params={params} />
            <AddCustomerButton onCreated={handleRefresh} />
          </div>
        }
      />

      <CustomersFilters
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        onSubmitSearch={submitSearch}
        filter={params.filter}
        onFilterChange={(value) => dispatch({ type: 'SET_FILTER', value })}
        isPending={isPending || loading}
      />

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <CustomersTable
        items={pageItems}
        isPending={isPending || loading}
        currentSort={params.sort}
        onSortChange={(value) => dispatch({ type: 'SET_SORT', value })}
        onMutated={handleRefresh}
        onLocalPatch={() => {}}
      />

      <CustomersPagination
        currentPage={params.page}
        pageSize={initialPageSize}
        total={total}
        onPageChange={(page) => dispatch({ type: 'SET_PAGE', value: page })}
      />
    </div>
  );
}
