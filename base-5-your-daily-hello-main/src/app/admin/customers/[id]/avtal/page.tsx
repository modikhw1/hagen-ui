import { loadCustomerView } from '@/lib/admin/server/customer-view';
import { CustomerAvtalRoute } from '@/components/admin/customers/routes/CustomerAvtalRoute';
import { getAuthenticatedUser } from '@/lib/auth/shared-auth';
import { hasAdminScope } from '@/lib/auth/api-auth';

export default async function CustomerAvtalPage({
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
    <CustomerAvtalRoute
      customerId={id}
      organisation={data.organisation}
      billing={{
        customerId: id,
        customerName: data.organisation.business_name,
        initialData: data.billing,
        initialInvoiceId: query?.invoice,
        initialStandaloneOpen: query?.manualInvoice === '1',
        permissions: {
          canManageBilling: hasAdminScope(user, 'super_admin'),
        },
      }}
      ops={{
        stripe_customer_id: data.billing.stripe_customer_id,
        stripe_subscription_id: data.billing.stripe_subscription_id,
        tiktok_handle: data.organisation.tiktok_handle ?? null,
        environment_warning: data.billing.environment_warning?.message ?? null,
      }}
    />
  );
}
