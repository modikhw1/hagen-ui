'use client';

import { useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AuditLogFilters } from '@/components/admin/audit/AuditLogFilters';
import { AuditLogTable } from '@/components/admin/audit/AuditLogTable';
import { SchemaWarningBanner } from '@/components/admin/shared/SchemaWarningBanner';
import { useAuditLog } from '@/hooks/admin/useAuditLog';

type Props = {
  actor?: string;
  action?: string;
  entity?: string;
  from?: string;
  to?: string;
};

export function AuditLogScreen({ actor, action, entity, from, to }: Props) {
  const router = useRouter();
  const pathname = usePathname() ?? '/admin/audit-log';
  const searchParams = useSearchParams();
  const query = useAuditLog({
    actor,
    action,
    entity,
    from,
    to,
    limit: 50,
  });

  const updateSearch = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams?.toString() ?? '');
    for (const [key, value] of Object.entries(updates)) {
      if (!value) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    const queryString = next.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname);
  };

  const entries = useMemo(
    () => query.data?.pages.flatMap((page) => page.entries) ?? [],
    [query.data?.pages],
  );
  const firstPage = query.data?.pages[0];
  const exportUrl = `/api/admin/audit-log/export?${new URLSearchParams({
    ...(actor ? { actor } : {}),
    ...(action ? { action } : {}),
    ...(entity ? { entity } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  }).toString()}`;

  if (query.isLoading) {
    return <div className="py-12 text-sm text-muted-foreground">Laddar audit-logg...</div>;
  }

  if (query.error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        {query.error instanceof Error ? query.error.message : 'Kunde inte ladda audit-loggen.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Auditlogg</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sparbar logg over administrativa mutationer.
          </p>
        </div>
        <a
          href={exportUrl}
          className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          Exportera CSV
        </a>
      </div>

      <AuditLogFilters
        actor={actor}
        action={action}
        entity={entity}
        from={from}
        to={to}
        actions={firstPage?.facets?.actions ?? []}
        entities={firstPage?.facets?.entities ?? []}
        onChange={updateSearch}
      />

      <SchemaWarningBanner warnings={firstPage?.schemaWarnings} />

      <AuditLogTable
        entries={entries}
        hasNextPage={Boolean(query.hasNextPage)}
        isFetchingNextPage={query.isFetchingNextPage}
        onLoadMore={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) {
            void query.fetchNextPage();
          }
        }}
      />
    </div>
  );
}
