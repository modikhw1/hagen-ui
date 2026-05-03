import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { DemosBoard } from '@/components/admin/demos/DemosBoard';
import { qk } from '@/lib/admin/queryKeys';
import { fetchDemosBoardServer } from '@/lib/admin/server/demos';

export const dynamic = 'force-dynamic';

type DemosPageProps = {
  searchParams: Promise<{
    days?: string;
    focus?: string;
    action?: string;
    convert?: string;
  }>;
};

export default async function DemosPage({ searchParams }: DemosPageProps) {
  const sp = await searchParams;
  const parsedDays = Number(sp.days ?? 30);
  const days = Number.isFinite(parsedDays) && parsedDays >= 1 ? parsedDays : 30;
  const queryClient = new QueryClient();

  await queryClient.prefetchQuery({
    queryKey: qk.demos.board(days),
    queryFn: () => fetchDemosBoardServer(days),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DemosBoard days={days} />
    </HydrationBoundary>
  );
}
