'use client';

import { useMemo, useState } from 'react';
import { AuditLogFilters } from '@/components/admin/audit/AuditLogFilters';
import { AuditLogTable } from '@/components/admin/audit/AuditLogTable';
import { SchemaWarningBanner } from '@/components/admin/shared/SchemaWarningBanner';
import { Select, Text } from '@mantine/core';
import { useAuditLog } from '@/hooks/admin/useAuditLog';
import { useUrlState } from '@/hooks/useUrlState';
import { todayDateInput } from '@/lib/admin/time';
import { PageHeader } from '@/components/admin/ui/layout/PageHeader';

type Props = {
  actor?: string;
  action?: string;
  entity?: string;
  from?: string;
  to?: string;
  onlyErrors?: boolean;
  billingOnly?: boolean;
};

function buildAuditExportUrl(params: {
  actor?: string;
  action?: string;
  entity?: string;
  from?: string;
  to?: string;
  onlyErrors?: boolean;
  billingOnly?: boolean;
  format: 'csv' | 'json';
}) {
  const query = new URLSearchParams({
    ...(params.actor ? { actor: params.actor } : {}),
    ...(params.action ? { action: params.action } : {}),
    ...(params.entity ? { entity: params.entity } : {}),
    ...(params.from ? { from: params.from } : {}),
    ...(params.to ? { to: params.to } : {}),
    ...(params.onlyErrors ? { onlyErrors: '1' } : {}),
    ...(params.billingOnly ? { billingOnly: '1' } : {}),
    format: params.format,
  });

  return `/api/admin/audit-log/export?${query.toString()}`;
}

export function AuditLogScreen({
  actor,
  action,
  entity,
  from,
  to,
  onlyErrors,
  billingOnly,
}: Props) {
  const { get, set } = useUrlState();
  const [exportMode, setExportMode] = useState<string>('');
  const actorValue = get('actor') ?? actor;
  const actionValue = get('action') ?? action;
  const entityValue = get('entity') ?? entity;
  const fromValue = get('from') ?? from;
  const toValue = get('to') ?? to;
  const onlyErrorsParam = get('onlyErrors');
  const billingOnlyParam = get('billingOnly');
  const onlyErrorsValue =
    onlyErrorsParam === '1' || onlyErrorsParam === 'true' || onlyErrors === true;
  const billingOnlyValue =
    billingOnlyParam === '1' || billingOnlyParam === 'true' || billingOnly === true;
  const query = useAuditLog({
    actor: actorValue ?? undefined,
    action: actionValue ?? undefined,
    entity: entityValue ?? undefined,
    from: fromValue ?? undefined,
    to: toValue ?? undefined,
    onlyErrors: onlyErrorsValue,
    billingOnly: billingOnlyValue,
    limit: 50,
  });

  const entries = useMemo(
    () => query.data?.pages.flatMap((page) => page.entries) ?? [],
    [query.data?.pages],
  );
  const firstPage = query.data?.pages[0];

  if (query.isLoading) {
    return <div className="py-12 text-sm text-muted-foreground italic">Laddar audit-logg...</div>;
  }

  if (query.error) {
    return (
      <div className="rounded-md border border-status-danger-fg/30 bg-status-danger-bg px-4 py-3 text-sm text-status-danger-fg">
        {query.error instanceof Error ? query.error.message : 'Kunde inte ladda audit-loggen.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auditlogg"
        subtitle="Spårbar logg över administrativa mutationer."
        actions={
          <div className="w-[200px]">
            <Select
              placeholder="Exportera logg"
              value={exportMode}
              onChange={(next) => {
                if (!next) return;
                setExportMode(next);
                const today = todayDateInput();
                const filteredCsvUrl = buildAuditExportUrl({
                  actor: actorValue ?? undefined,
                  action: actionValue ?? undefined,
                  entity: entityValue ?? undefined,
                  from: fromValue ?? undefined,
                  to: toValue ?? undefined,
                  onlyErrors: onlyErrorsValue,
                  billingOnly: billingOnlyValue,
                  format: 'csv',
                });
                const todayCsvUrl = buildAuditExportUrl({
                  from: `${today}T00:00:00.000Z`,
                  to: `${today}T23:59:59.999Z`,
                  format: 'csv',
                });

                const target =
                  next === 'csv_filtered'
                    ? filteredCsvUrl
                    : next === 'csv_today'
                      ? todayCsvUrl
                      : buildAuditExportUrl({ format: 'json' });
                window.location.assign(target);
                queueMicrotask(() => setExportMode(''));
              }}
              data={[
                { value: 'csv_filtered', label: 'CSV (filtrerade)' },
                { value: 'csv_today', label: 'CSV (alla idag)' },
                { value: 'json_filtered', label: 'JSON (filtrerade)' },
              ]}
            />
          </div>
        }
      />

      <div className="rounded-lg border border-border bg-secondary/20 px-4 py-2.5 text-xs text-muted-foreground">
        Visar audit upp till 90 dagar tillbaka. Äldre data arkiveras nattligt.
      </div>

      <AuditLogFilters
        actor={actorValue ?? undefined}
        action={actionValue ?? undefined}
        entity={entityValue ?? undefined}
        from={fromValue ?? undefined}
        to={toValue ?? undefined}
        viewerEmail={firstPage?.viewer?.email ?? null}
        onlyErrors={onlyErrorsValue}
        billingOnly={billingOnlyValue}
        actors={firstPage?.facets?.actors ?? []}
        actions={firstPage?.facets?.actions ?? []}
        entities={firstPage?.facets?.entities ?? []}
        onChange={(updates) => set(updates)}
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
