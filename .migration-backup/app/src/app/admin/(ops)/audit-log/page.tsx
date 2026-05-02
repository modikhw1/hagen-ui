import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { AuditLogScreen } from '@/components/admin/audit/AuditLogScreen';
import { qk } from '@/lib/admin/queryKeys';
import { type AuditLogFilter } from '@/lib/admin/schemas/audit';
import { fetchAuditLogServer } from '@/lib/admin/server/audit';

import { getAdminActionSession } from '@/app/admin/_actions/shared';

export const dynamic = 'force-dynamic';

type AuditLogPageProps = {
  searchParams: Promise<{
    actor?: string;
    action?: string;
    entity?: string;
    from?: string;
    to?: string;
    onlyErrors?: string;
    billingOnly?: string;
  }>;
};

export default async function AuditLogPage({ searchParams }: AuditLogPageProps) {
  const sp = await searchParams;
  const onlyErrors = sp.onlyErrors === '1' || sp.onlyErrors === 'true';
  const billingOnly = sp.billingOnly === '1' || sp.billingOnly === 'true';
  const filter: AuditLogFilter = {
    actor: sp.actor,
    action: sp.action,
    entity: sp.entity,
    from: sp.from,
    to: sp.to,
    onlyErrors,
    billingOnly,
    limit: 50,
    cursor: null,
  };
  const queryClient = new QueryClient();

  // Parallelize auth and infinite query prefetching
  await Promise.all([
    getAdminActionSession('audit.read' as any),
    queryClient.prefetchInfiniteQuery({
      queryKey: qk.auditLog.list(filter),
      queryFn: ({ pageParam }) =>
        fetchAuditLogServer({
          ...filter,
          cursor: typeof pageParam === 'string' ? pageParam : filter.cursor ?? null,
        }),
      initialPageParam: null,
    }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AuditLogScreen
        actor={sp.actor}
        action={sp.action}
        entity={sp.entity}
        from={sp.from}
        to={sp.to}
        onlyErrors={onlyErrors}
        billingOnly={billingOnly}
      />
    </HydrationBoundary>
  );
}
