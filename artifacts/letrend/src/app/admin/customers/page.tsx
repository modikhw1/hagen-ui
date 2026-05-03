import { CustomersPageClient } from '@/components/admin/customers/CustomersPageClient';
import { CUSTOMERS_PAGE_SIZE } from '@/lib/admin/customers/list.constants';

export default function CustomersPage() {
  return (
    <CustomersPageClient
      initialItems={[]}
      initialTotal={0}
      initialPageSize={CUSTOMERS_PAGE_SIZE}
    />
  );
}
