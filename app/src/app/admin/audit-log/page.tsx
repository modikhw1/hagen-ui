'use client';

import { useQuery } from '@tanstack/react-query';
import { timeAgoSv } from '@/lib/admin/time';

type AuditPayload = {
  entries: Array<{
    id: string;
    actor_email: string | null;
    actor_role: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>;
  schemaWarnings?: string[];
};

export default function AuditLogPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'audit-log'],
    queryFn: async () => {
      const response = await fetch('/api/admin/audit-log?limit=100', { credentials: 'include' });
      const payload = (await response.json().catch(() => ({}))) as AuditPayload & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte ladda audit-loggen');
      }
      return payload;
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return <div className="py-12 text-sm text-muted-foreground">Laddar audit-logg...</div>;
  }

  if (error || !data) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        {error instanceof Error ? error.message : 'Kunde inte ladda audit-loggen.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Auditlogg</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Spårbar logg över administrativa mutationer.
        </p>
      </div>

      {data.schemaWarnings?.length ? (
        <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">
          {data.schemaWarnings[0]}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="divide-y divide-border">
          {data.entries.length === 0 ? (
            <div className="px-5 py-8 text-sm text-muted-foreground">
              Inga audit-poster hittades.
            </div>
          ) : (
            data.entries.map((entry) => (
              <div key={entry.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[180px_1.2fr_1fr_1fr]">
                <div className="text-xs text-muted-foreground">{timeAgoSv(entry.created_at)}</div>
                <div>
                  <div className="text-sm font-semibold text-foreground">{entry.action}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {entry.entity_type}
                    {entry.entity_id ? ` · ${entry.entity_id}` : ''}
                  </div>
                </div>
                <div className="text-sm text-foreground">
                  {entry.actor_email || 'Okand anvandare'}
                  <div className="mt-1 text-xs text-muted-foreground">
                    {entry.actor_role || 'okand roll'}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {entry.metadata?.summary && typeof entry.metadata.summary === 'string'
                    ? entry.metadata.summary
                    : entry.metadata?.action && typeof entry.metadata.action === 'string'
                      ? entry.metadata.action
                      : 'Ingen extra metadata'}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
