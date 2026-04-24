import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { AuditLogScreen } from '@/components/admin/audit/AuditLogScreen';
import { qk } from '@/lib/admin/queryKeys';
import { type AuditLogFilter } from '@/lib/admin/schemas/audit';
import { fetchAuditLogServer } from '@/lib/admin/server/audit';

export const dynamic = 'force-dynamic';

type AuditLogPageProps = {
  searchParams: Promise<{
    actor?: string;
    action?: string;
    entity?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function AuditLogPage({ searchParams }: AuditLogPageProps) {
  const sp = await searchParams;
  const filter: AuditLogFilter = {
    actor: sp.actor,
    action: sp.action,
    entity: sp.entity,
    from: sp.from,
    to: sp.to,
    limit: 50,
    cursor: null,
  };
  const queryClient = new QueryClient();

  await queryClient.prefetchInfiniteQuery({
    queryKey: qk.auditLog.list(filter),
    queryFn: ({ pageParam }) =>
      fetchAuditLogServer({
        ...filter,
        cursor: typeof pageParam === 'string' ? pageParam : filter.cursor ?? null,
      }),
    initialPageParam: null,
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AuditLogScreen
        actor={sp.actor}
        action={sp.action}
        entity={sp.entity}
        from={sp.from}
        to={sp.to}
      />
    </HydrationBoundary>
  );
}
