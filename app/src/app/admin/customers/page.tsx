import { Suspense } from 'react';
import CustomersPageClient from '@/components/admin/customers/CustomersPageClient';
import { Skeleton } from '@/components/ui/skeleton';
import { loadAdminCustomers, parseCustomerListParams } from '@/lib/admin/customers/list.server';

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
      rows={data.rows}
      total={data.total}
      page={data.page}
      totalPages={data.totalPages}
      search={params.search}
      filter={params.filter}
      sort={params.sort}
      team={data.team}
    />
  );
}

function CustomersTableSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28 rounded-md" />
          <Skeleton className="h-10 w-32 rounded-md" />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-10 w-72 rounded-md" />
        <Skeleton className="h-10 w-64 rounded-md" />
        <Skeleton className="h-10 w-36 rounded-md" />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_120px] gap-4 border-b border-border px-5 py-3">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-3 w-full max-w-24" />
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
              <Skeleton className="h-12 w-full rounded-md" />
              <Skeleton className="h-12 w-full rounded-md" />
              <Skeleton className="h-12 w-full rounded-md" />
              <Skeleton className="h-12 w-full rounded-md" />
              <Skeleton className="h-12 w-full rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
