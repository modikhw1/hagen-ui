import CustomersPageClient from '@/components/admin/customers/CustomersPageClient';
import { loadAdminCustomers, parseCustomerListParams } from '@/lib/admin/customers/list.server';

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CustomersPage({ searchParams }: PageProps) {
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
