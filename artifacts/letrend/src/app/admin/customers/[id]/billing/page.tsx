import { useParams } from 'wouter';
import { useSearchParams } from '@/lib/navigation-compat';
import { CustomerBillingRoute } from '@/components/admin/customers/routes/CustomerBillingRoute';
export default function CustomerBillingPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const invoice = searchParams.get('invoice') ?? undefined;
  if (!id) return null;
  return <CustomerBillingRoute customerId={id} initialData={null} initialInvoiceId={invoice} />;
}
