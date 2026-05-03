import HealthRoute from '@/components/admin/billing/health/HealthRoute';
import { useSearchParams } from '@/lib/navigation-compat';
import type { EnvFilter } from '@/lib/admin/billing';
export default function BillingHealthPage() {
  const [searchParams] = useSearchParams();
  const env = (searchParams.get('env') ?? 'live') as EnvFilter;
  return <HealthRoute env={env} />;
}
