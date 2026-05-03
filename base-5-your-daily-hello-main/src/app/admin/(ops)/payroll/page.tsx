import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { PayrollScreen } from '@/components/admin/payroll/PayrollScreen';
import { qk } from '@/lib/admin/queryKeys';
import { fetchPayrollServer } from '@/lib/admin/server/payroll';

import { getAdminActionSession } from '@/app/admin/_actions/shared';

export const dynamic = 'force-dynamic';

type PayrollPageProps = {
  searchParams: Promise<{
    period?: string;
  }>;
};

export default async function PayrollPage({ searchParams }: PayrollPageProps) {
  const sp = await searchParams;
  const periodKey = sp.period ?? null;
  const queryClient = new QueryClient();

  // Parallelize auth and data prefetching
  await Promise.all([
    getAdminActionSession('team.read'), // Assuming team.read covers payroll
    queryClient.prefetchQuery({
      queryKey: qk.payroll.period(periodKey),
      queryFn: () => fetchPayrollServer(periodKey),
    }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PayrollScreen periodKey={periodKey} />
    </HydrationBoundary>
  );
}
