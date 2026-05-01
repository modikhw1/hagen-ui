import { loadCustomerView } from '@/lib/admin/server/customer-view';
import { CustomerOrganisationRoute } from '@/components/admin/customers/routes/CustomerOrganisationRoute';

export default async function CustomerOrganisationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadCustomerView(id);

  return (
    <CustomerOrganisationRoute
      customerId={id}
      initialData={data.organisation}
    />
  );
}
