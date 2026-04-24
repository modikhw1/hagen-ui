import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { redirect } from 'next/navigation';
import HealthRoute from '@/components/admin/billing/health/HealthRoute';
import { getAdminActionSession } from '@/app/admin/_actions/shared';
import { resolveConcreteBillingEnv } from '@/lib/admin/billing';
import { parseBillingSearchParams } from '@/lib/admin/billing-search-params';
import { qk } from '@/lib/admin/queryKeys';
import { fetchAdminBillingHealthServer } from '@/lib/admin/server/billing';
import { getStripeEnvironment } from '@/lib/stripe/environment';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function BillingHealthPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = parseBillingSearchParams(await searchParams);
  const defaultHealthEnv = getStripeEnvironment();

  if (params.env === 'all') {
    redirect(`/admin/billing/health?env=${defaultHealthEnv}`);
  }

  const env = resolveConcreteBillingEnv(params.env, defaultHealthEnv);
  const queryClient = new QueryClient();

  // Parallelize auth and data fetching
  await Promise.all([
    getAdminActionSession('billing.health.read'),
    queryClient.prefetchQuery({
      queryKey: qk.billing.healthStatus(env),
      queryFn: () => fetchAdminBillingHealthServer(env),
    }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <HealthRoute env={env} />
    </HydrationBoundary>
  );
}
