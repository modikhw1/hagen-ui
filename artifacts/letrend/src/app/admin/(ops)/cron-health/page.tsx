import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/admin/api-client';

interface CronInvocation {
  id: string;
  started_at: string;
  finished_at: string | null;
  processed: number;
  imported: number;
  stats_updated: number;
  calls_used: number;
  budget_remaining: number;
  budget_exceeded: boolean;
  stale_locks_cleared: number;
  errors: Array<{ customerId: string; error: string }> | null;
}

interface CustomerRun {
  id: string;
  customer_id: string;
  mode: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  fetched_count: number | null;
  imported_count: number | null;
  stats_updated_count: number | null;
  calls_used: number | null;
  error: string | null;
}

interface FailedCustomer {
  id: string;
  business_name: string | null;
  tiktok_handle: string | null;
  last_history_sync_at: string | null;
  last_sync_error: string | null;
}

interface Payload {
  recent_cron_invocations: CronInvocation[];
  recent_customer_runs: CustomerRun[];
  failed_customers: FailedCustomer[];
}

function fmtTs(value: string | null): string {
  if (!value) return '–';
  try { return new Date(value).toLocaleString('sv-SE'); } catch { return value; }
}

export default function CronHealthPage(): JSX.Element {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    apiClient.get<Payload>('/api/admin/cron-runs')
      .then((payload) => { if (alive) { setData(payload); setLoading(false); } })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'Kunde inte hämta cron-status');
        setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Laddar…</div>;
  if (error) return <div className="p-6 text-sm text-destructive">{error}</div>;
  if (!data) return <div className="p-6 text-sm text-muted-foreground">Ingen data.</div>;

  return (
    <div className="space-y-8 p-2">
      <header>
        <h1 className="text-xl font-semibold">TikTok-sync hälsa</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Översikt över de senaste schemalagda körningarna och kunder vars senaste synk misslyckades.
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Senaste cron-körningar</h2>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-accent/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Start</th>
                <th className="px-3 py-2 text-right">Kunder</th>
                <th className="px-3 py-2 text-right">Importerade</th>
                <th className="px-3 py-2 text-right">Stats-uppd.</th>
                <th className="px-3 py-2 text-right">API-anrop</th>
                <th className="px-3 py-2 text-right">Budget kvar</th>
                <th className="px-3 py-2 text-left">Notering</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.recent_cron_invocations.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">Inga körningar registrerade ännu.</td></tr>
              ) : data.recent_cron_invocations.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2">{fmtTs(row.started_at)}</td>
                  <td className="px-3 py-2 text-right">{row.processed}</td>
                  <td className="px-3 py-2 text-right">{row.imported}</td>
                  <td className="px-3 py-2 text-right">{row.stats_updated}</td>
                  <td className="px-3 py-2 text-right">{row.calls_used}</td>
                  <td className="px-3 py-2 text-right">{row.budget_remaining}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {row.budget_exceeded ? 'Budget nådd · ' : ''}
                    {row.stale_locks_cleared > 0 ? `Rensade lås: ${row.stale_locks_cleared} · ` : ''}
                    {row.errors && row.errors.length > 0 ? `${row.errors.length} fel` : 'OK'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Kunder med synkfel</h2>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-accent/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Kund</th>
                <th className="px-3 py-2 text-left">Handle</th>
                <th className="px-3 py-2 text-left">Senaste lyckade synk</th>
                <th className="px-3 py-2 text-left">Felmeddelande</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.failed_customers.length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">Inga kunder med fel.</td></tr>
              ) : data.failed_customers.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2">{c.business_name ?? c.id.slice(0, 8)}</td>
                  <td className="px-3 py-2">{c.tiktok_handle ?? '–'}</td>
                  <td className="px-3 py-2">{fmtTs(c.last_history_sync_at)}</td>
                  <td className="px-3 py-2 text-xs text-destructive">{c.last_sync_error ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Senaste kund-synker</h2>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-accent/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Start</th>
                <th className="px-3 py-2 text-left">Läge</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Hämtade</th>
                <th className="px-3 py-2 text-right">Importerade</th>
                <th className="px-3 py-2 text-right">Anrop</th>
                <th className="px-3 py-2 text-left">Fel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.recent_customer_runs.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">Inga körningar.</td></tr>
              ) : data.recent_customer_runs.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2">{fmtTs(row.started_at)}</td>
                  <td className="px-3 py-2">{row.mode}</td>
                  <td className="px-3 py-2">{row.status}</td>
                  <td className="px-3 py-2 text-right">{row.fetched_count ?? 0}</td>
                  <td className="px-3 py-2 text-right">{row.imported_count ?? 0}</td>
                  <td className="px-3 py-2 text-right">{row.calls_used ?? 0}</td>
                  <td className="px-3 py-2 text-xs text-destructive">{row.error ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
