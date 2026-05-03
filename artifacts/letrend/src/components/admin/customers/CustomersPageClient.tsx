// app/src/components/admin/customers/CustomersPageClient.tsx

'use client';

import { useDeferredValue, useEffect, useState } from 'react';

import { PageHeader } from '@/components/admin/ui/layout/PageHeader';
import { CustomersTable } from '@/components/admin/customers/CustomersTable';
import { CustomersFilters } from '@/components/admin/customers/CustomersFilters';
import { CustomersPagination } from '@/components/admin/customers/CustomersPagination';
import { ExportCustomersLink } from '@/components/admin/customers/ExportCustomersLink';
import { AddCustomerButton } from '@/components/admin/customers/AddCustomerButton';
import { useCustomerListParamsState } from '@/hooks/admin/useCustomerListParamsState';
import { useAdminRefresh } from '@/hooks/admin/useAdminRefresh';
import type { AdminCustomerListItem } from '@/lib/admin/customers/list.types';

export interface CustomersPageClientProps {
  initialItems: AdminCustomerListItem[];
  initialTotal: number;
  initialPageSize: number;
}

export function CustomersPageClient({
  initialItems,
  initialTotal,
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kunder"
        subtitle={`${initialTotal} kund${initialTotal === 1 ? '' : 'er'}`}
        actions={
          <div className="flex items-center gap-2">
            <ExportCustomersLink params={params} />
            <AddCustomerButton onCreated={() => refresh(['customers'])} />
          </div>
        }
      />

      <CustomersFilters
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        onSubmitSearch={submitSearch}
        filter={params.filter}
        onFilterChange={(value) => dispatch({ type: 'SET_FILTER', value })}
        isPending={isPending}
      />

      <CustomersTable
        items={initialItems}
        isPending={isPending}
        currentSort={params.sort}
        onSortChange={(value) => dispatch({ type: 'SET_SORT', value })}
        onMutated={() => refresh(['customers'])}
        onLocalPatch={() => {}} // Disabled as we rely on server state for stability
      />

      <CustomersPagination
        currentPage={params.page}
        pageSize={initialPageSize}
        total={initialTotal}
        onPageChange={(page) => dispatch({ type: 'SET_PAGE', value: page })}
      />
    </div>
  );
}
