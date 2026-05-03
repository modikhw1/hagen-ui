'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/lib/admin/api-client';
import { timeAgoSv } from '@/lib/admin/time';

type Job = {
  id: string;
  scope: 'invoices' | 'subscriptions' | 'all';
  environment: 'live' | 'test';
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  since: string | null;
  result: { syncedCount?: number; skippedCount?: number; durationMs?: number } | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

type ListResponse = { jobs: Job[]; schemaWarning?: string };

const statusStyles: Record<Job['status'], string> = {
  queued: 'bg-muted text-muted-foreground',
  running: 'bg-status-info-bg text-status-info-fg',
  succeeded: 'bg-status-success-bg text-status-success-fg',
  failed: 'bg-status-danger-bg text-status-danger-fg',
  cancelled: 'bg-muted text-muted-foreground',
};

export default function ReconcileJobsList() {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['billing', 'reconcile', 'jobs'],
    queryFn: ({ signal }) =>
      apiClient.get<ListResponse>('/api/admin/billing/reconcile/list', {
        signal,
        query: { limit: 20 },
      }),
    staleTime: 15_000,
    refetchInterval: (q) => {
      const jobs = (q.state.data as ListResponse | undefined)?.jobs ?? [];
      return jobs.some((j) => j.status === 'queued' || j.status === 'running') ? 5000 : false;
    },
  });

  const runMutation = useMutation({
    mutationFn: (jobId?: string) =>
      apiClient.post<{ ok: boolean; status?: string; error?: string }>('/api/admin/billing/reconcile/run', jobId ? { jobId } : {}),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(`Reconcile klar (${res.status ?? 'ok'})`);
      } else {
        toast.error(res.error ?? 'Reconcile misslyckades');
      }
      void queryClient.invalidateQueries({ queryKey: ['billing', 'reconcile', 'jobs'] });
      void queryClient.invalidateQueries({ queryKey: ['billing', 'drift'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  if (data?.schemaWarning) {
    return (
      <div className="rounded-md border border-status-warning-fg/30 bg-status-warning-bg px-3 py-2 text-sm text-status-warning-fg">
        {data.schemaWarning}
      </div>
    );
  }

  const jobs = data?.jobs ?? [];

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Reconcile-historik</h3>
          <p className="text-xs text-muted-foreground">Köade och slutförda jobb (senaste 20)</p>
        </div>
        <button
          type="button"
          onClick={() => runMutation.mutate(undefined)}
          disabled={runMutation.isPending}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          {runMutation.isPending ? 'Kör…' : 'Kör nästa köade'}
        </button>
      </header>

      {isLoading ? (
        <div className="px-4 py-6 text-sm text-muted-foreground">Laddar…</div>
      ) : jobs.length === 0 ? (
        <div className="px-4 py-6 text-sm text-muted-foreground">Inga reconcile-jobb än.</div>
      ) : (
        <ul className="divide-y divide-border">
          {jobs.map((job) => (
            <li key={job.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-xs">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${statusStyles[job.status]}`}>
                    {job.status}
                  </span>
                  <span className="text-muted-foreground">{job.scope}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{job.environment}</span>
                  <span className="ml-auto text-muted-foreground">{timeAgoSv(job.created_at)}</span>
                </div>
                {job.result ? (
                  <div className="mt-1 text-muted-foreground">
                    {job.result.syncedCount ?? 0} synkade, {job.result.skippedCount ?? 0} hoppade
                    {typeof job.result.durationMs === 'number' ? ` · ${Math.round(job.result.durationMs / 100) / 10}s` : ''}
                  </div>
                ) : null}
                {job.error_message ? (
                  <div className="mt-1 text-status-danger-fg">{job.error_message}</div>
                ) : null}
                <div className="mt-1 flex items-center gap-3">
                  <a
                    href={`/admin/audit-log?entityId=${job.id}`}
                    className="text-[11px] text-primary hover:underline"
                  >
                    Audit-spår →
                  </a>
                  {(job.status === 'queued' || job.status === 'failed') ? (
                    <button
                      type="button"
                      onClick={() => runMutation.mutate(job.id)}
                      disabled={runMutation.isPending}
                      className="text-[11px] text-primary hover:underline disabled:opacity-50"
                    >
                      {job.status === 'failed' ? 'Försök igen' : 'Kör nu'}
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
