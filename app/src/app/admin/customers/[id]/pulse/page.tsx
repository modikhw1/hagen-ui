import { loadCustomerView } from '@/lib/admin/server/customer-view';
import { CustomerPulseRoute } from '@/components/admin/customers/routes/CustomerPulseRoute';

export default async function CustomerPulsePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadCustomerView(id);

  return (
    <CustomerPulseRoute
      customerId={id}
      initialData={data.pulse}
      overview={data.overview}
    />
  );
}
