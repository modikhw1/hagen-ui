import { Suspense } from 'react';
import { CustomersPageClient } from '@/components/admin/customers/CustomersPageClient';
import { Skeleton } from '@mantine/core';
import { loadAdminCustomers, parseCustomerListParams } from '@/lib/admin/customers/list.server';
import { CUSTOMERS_PAGE_SIZE } from '@/lib/admin/customers/list.constants';

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function CustomersPage(props: PageProps) {
  return (
    <Suspense fallback={<CustomersTableSkeleton />}>
      <CustomersPageContent {...props} />
    </Suspense>
  );
}

async function CustomersPageContent({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const params = parseCustomerListParams(resolvedSearchParams);
  const data = await loadAdminCustomers(params);

  return (
    <CustomersPageClient
      initialItems={data.rows}
      initialTotal={data.total}
      initialPageSize={CUSTOMERS_PAGE_SIZE}
    />
  );
}

function CustomersTableSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton height={32} width={128} />
          <Skeleton height={16} width={96} />
        </div>
        <div className="flex gap-2">
          <Skeleton height={40} width={112} radius="md" />
          <Skeleton height={40} width={128} radius="md" />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Skeleton height={40} width={288} radius="md" />
        <Skeleton height={40} width={256} radius="md" />
        <Skeleton height={40} width={144} radius="md" />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_120px] gap-4 border-b border-border px-5 py-3">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} height={12} width="100%" />
          ))}
        </div>
        <div className="space-y-0">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className={`grid grid-cols-[2fr_1fr_1fr_1fr_120px] gap-4 px-5 py-4 ${
                index < 5 ? 'border-b border-border' : ''
              }`}
            >
              <Skeleton height={48} width="100%" radius="md" />
              <Skeleton height={48} width="100%" radius="md" />
              <Skeleton height={48} width="100%" radius="md" />
              <Skeleton height={48} width="100%" radius="md" />
              <Skeleton height={48} width="100%" radius="md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
