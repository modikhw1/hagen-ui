import HealthRoute from '@/components/admin/billing/health/HealthRoute';
import { useSearchParams } from '@/lib/navigation-compat';
import { resolveConcreteBillingEnv } from '@/lib/admin/billing';
import { parseBillingSearchParams } from '@/lib/admin/billing-search-params';
import { getStripeEnvironment } from '@/lib/stripe-client';

export default function BillingHealthPage() {
  const [searchParamsRaw] = useSearchParams();

  const rawParams: Record<string, string | string[] | undefined> = {};
  if (searchParamsRaw) {
    searchParamsRaw.forEach((value, key) => {
      rawParams[key] = value;
    });
  }

  const params = parseBillingSearchParams(rawParams);
  const defaultHealthEnv = getStripeEnvironment();
  const env = resolveConcreteBillingEnv(
    params.env === 'all' ? defaultHealthEnv : params.env,
    defaultHealthEnv,
  );

  return <HealthRoute env={env} />;
}
