import { loadCustomerView } from '@/lib/admin/server/customer-view';
import { CustomerBillingRoute } from '@/components/admin/customers/routes/CustomerBillingRoute';
import { getAuthenticatedUser } from '@/lib/auth/shared-auth';
import { hasAdminScope } from '@/lib/auth/api-auth';

export default async function CustomerBillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ invoice?: string; manualInvoice?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const [data, user] = await Promise.all([
    loadCustomerView(id),
    getAuthenticatedUser(),
  ]);

  return (
    <CustomerBillingRoute
      customerId={id}
      customerName={data.organisation.business_name}
      initialData={data.billing}
      initialInvoiceId={query?.invoice}
      initialStandaloneOpen={query?.manualInvoice === '1'}
      permissions={{
        canManageBilling: hasAdminScope(user, 'super_admin'),
      }}
    />
  );
}
