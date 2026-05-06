import { useEffect, useState, type ReactElement } from 'react';
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
  thumbnails_refreshed: number | null;
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
  has_never_logged: boolean;
  fallback_cron_sync_runs: CustomerRun[];
}

interface DryRunCustomer {
  id: string;
  tiktok_handle: string | null;
  last_history_sync_at: string | null;
  reason?: string; // only on skipped
}

interface RunNowResult {
  processed: number;
  imported: number;
  statsUpdated: number;
  callsUsed: number;
  budgetRemaining: number;
  budgetExceeded: boolean;
  staleLocksCleared: number;
  thumbnailsRefreshed?: number;
  errors: Array<{ customerId: string; error: string }>;
  cronLogWritten?: boolean;
  dryRun?: boolean;
  eligibleCustomers?: DryRunCustomer[];
  skippedCustomers?: DryRunCustomer[];
  wouldProcessCount?: number;
}

function fmtTs(value: string | null): string {
  if (!value) return '–';
  try { return new Date(value).toLocaleString('sv-SE'); } catch { return value; }
}

function InvocationNote({ row }: { row: CronInvocation }): ReactElement {
  const parts: string[] = [];
  if (row.budget_exceeded) parts.push('Budget nådd');
  if (row.stale_locks_cleared > 0) parts.push(`Rensade lås: ${row.stale_locks_cleared}`);
  if ((row.thumbnails_refreshed ?? 0) > 0) parts.push(`Miniatyrer: ${row.thumbnails_refreshed}`);
  if (row.processed === 0) parts.push('0 kunder matchade');
  if (row.errors && row.errors.length > 0) parts.push(`${row.errors.length} fel`);
  if (parts.length === 0) parts.push('OK');
  return <span>{parts.join(' · ')}</span>;
}

const SKIP_REASON_LABEL: Record<string, string> = {
  missing_handle: 'Saknar TikTok-handle',
  recently_synced: 'Nyligen synkad',
  quiet_recently_synced: 'Tyst kund — synkad idag',
};

function RunNowPanel(): ReactElement {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunNowResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [maxCustomers, setMaxCustomers] = useState<string>('3');
  const [dryRun, setDryRun] = useState(false);

  async function handleRunNow() {
    setRunning(true);
    setResult(null);
    setRunError(null);
    try {
      const max = parseInt(maxCustomers, 10);
      const body: Record<string, unknown> = {};
      if (!isNaN(max) && max > 0) body['maxCustomers'] = max;
      if (dryRun) body['dryRun'] = true;
      const res = await apiClient.post<RunNowResult>('/api/admin/cron-runs/run-now', body);
      setResult(res);
    } catch (err: unknown) {
      setRunError(err instanceof Error ? err.message : 'Körning misslyckades');
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="rounded-md border border-border p-4">
      <h2 className="mb-3 text-sm font-semibold">Manuell batch-körning</h2>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-muted-foreground" htmlFor="max-customers">
          Max kunder:
        </label>
        <input
          id="max-customers"
          type="number"
          min={1}
          max={200}
          value={maxCustomers}
          onChange={(e) => setMaxCustomers(e.target.value)}
          className="w-20 rounded border border-border px-2 py-1 text-sm"
          disabled={running}
        />
        <label className="flex cursor-pointer items-center gap-1.5 text-sm select-none">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
            disabled={running}
            className="h-4 w-4 rounded border-border"
          />
          <span>Förhandsgranska (dry run)</span>
        </label>
        <button
          onClick={handleRunNow}
          disabled={running}
          className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {running
            ? dryRun ? 'Förhandsgranskar…' : 'Kör…'
            : dryRun ? 'Förhandsgranska' : 'Kör sync nu'}
        </button>
        {running && !dryRun && (
          <span className="text-sm text-muted-foreground">Synkar TikTok-historik — kan ta upp till 1 minut…</span>
        )}
      </div>

      {runError && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {runError}
        </div>
      )}

      {result?.dryRun && (
        <div className="mt-4 space-y-3">
          <div className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            <strong>Dry run — ingen sync kördes, inget budget användes.</strong>{' '}
            {result.wouldProcessCount} kund(er) skulle ha synkats. Budget kvar: {result.budgetRemaining} anrop.
          </div>

          {(result.eligibleCustomers?.length ?? 0) > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold text-green-700">
                Skulle synkas ({result.eligibleCustomers!.length})
              </div>
              <div className="space-y-1">
                {result.eligibleCustomers!.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded border border-green-200 bg-green-50 px-3 py-1.5 text-xs"
                  >
                    <span className="font-mono">{c.tiktok_handle ?? c.id.slice(0, 8)}</span>
                    <span className="text-muted-foreground">
                      Senast: {fmtTs(c.last_history_sync_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(result.skippedCustomers?.length ?? 0) > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold text-muted-foreground">
                Hoppas över ({result.skippedCustomers!.length})
              </div>
              <div className="space-y-1">
                {result.skippedCustomers!.map((c) => (
                  <div
                    key={c.id + (c.reason ?? '')}
                    className="flex items-center justify-between rounded border border-border bg-muted/30 px-3 py-1.5 text-xs"
                  >
                    <span className="font-mono">{c.tiktok_handle ?? c.id.slice(0, 8)}</span>
                    <span className="text-muted-foreground">
                      {SKIP_REASON_LABEL[c.reason ?? ''] ?? c.reason ?? '–'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {result && !result.dryRun && (
        <div className="mt-4 space-y-2">
          <div className="grid grid-cols-3 gap-2 text-sm sm:grid-cols-6">
            {[
              ['Kunder', result.processed],
              ['Importerade', result.imported],
              ['Stats-uppd.', result.statsUpdated],
              ['API-anrop', result.callsUsed],
              ['Budget kvar', result.budgetRemaining],
              ['Miniatyrer', result.thumbnailsRefreshed ?? 0],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-md border border-border p-2 text-center">
                <div className="text-xs text-muted-foreground">{label as string}</div>
                <div className="text-base font-semibold">{value as number}</div>
              </div>
            ))}
          </div>

          {result.cronLogWritten === false && (
            <div className="rounded-md border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-800">
              <strong>Varning:</strong> Batch-körningen lyckades men cron_run_log-raden skrevs inte. Kontrollera
              server-loggar för <code className="font-mono">cron_run_log insert failed</code> med fullständig
              PostgrestError (message, details, code, hint).
            </div>
          )}
          {result.cronLogWritten === true && (
            <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
              Batch-körning klar — cron_run_log uppdaterad.
              {result.budgetExceeded && ' Budget nåddes.'}
              {result.errors.length > 0 && ` ${result.errors.length} kund(er) misslyckades.`}
            </div>
          )}
          {result.errors.length > 0 && (
            <div className="rounded-md border border-border px-3 py-2 text-xs text-destructive">
              Fel: {result.errors.map((e) => `${e.customerId.slice(0, 8)}: ${e.error}`).join(' | ')}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default function CronHealthPage(): ReactElement {
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

  const hasNeverLogged = data.has_never_logged;
  const lastInvocation = data.recent_cron_invocations[0] ?? null;
  const lastHadZeroCustomers =
    !hasNeverLogged && lastInvocation !== null && lastInvocation.processed === 0;

  return (
    <div className="space-y-8 p-2">
      <header>
        <h1 className="text-xl font-semibold">TikTok-sync hälsa</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Översikt över de senaste schemalagda körningarna och kunder vars senaste synk misslyckades.
        </p>
      </header>

      {/* Manual run-now panel */}
      <RunNowPanel />

      {/* Status banners */}
      {hasNeverLogged && data.fallback_cron_sync_runs.length > 0 && (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          <strong>Cron har aldrig loggats i cron_run_log.</strong>{' '}
          Per-kund sync_runs med mode=cron körs (se fallback nedan), men ingen aggregerad cron-körning har skrivits ännu.
          Det beror troligen på ett insert-fel — kontrollera server-loggar för{' '}
          <code className="font-mono">cron_run_log insert failed</code>.
        </div>
      )}
      {hasNeverLogged && data.fallback_cron_sync_runs.length === 0 && (
        <div className="rounded-md border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          <strong>Ingen cron-aktivitet registrerad.</strong>{' '}
          Varken cron_run_log eller cron-mode sync_runs finns. Kontrollera att cron-jobbet är aktivt
          eller använd "Kör sync nu" ovan för att trigga en manuell körning.
        </div>
      )}
      {lastHadZeroCustomers && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Senaste cron-körning matchade <strong>0 kunder</strong> — alla kunder kan ha synkats nyligen eller sakna TikTok-handle.
        </div>
      )}

      {/* Aggregated cron invocations */}
      <section>
        <h2 className="mb-3 text-sm font-semibold">
          Senaste cron-körningar
          {hasNeverLogged && <span className="ml-2 font-normal text-muted-foreground">(inga ännu)</span>}
        </h2>
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
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">
                    Inga körningar registrerade ännu.
                  </td>
                </tr>
              ) : data.recent_cron_invocations.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2">{fmtTs(row.started_at)}</td>
                  <td className="px-3 py-2 text-right">{row.processed}</td>
                  <td className="px-3 py-2 text-right">{row.imported}</td>
                  <td className="px-3 py-2 text-right">{row.stats_updated}</td>
                  <td className="px-3 py-2 text-right">{row.calls_used}</td>
                  <td className="px-3 py-2 text-right">{row.budget_remaining}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    <InvocationNote row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Fallback: per-customer cron sync_runs when cron_run_log is empty */}
      {hasNeverLogged && data.fallback_cron_sync_runs.length > 0 && (
        <section>
          <h2 className="mb-1 text-sm font-semibold">Fallback: senaste cron-synker per kund</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Visar sync_runs med mode=cron eftersom cron_run_log saknar rader. Varje rad är ett per-kund-jobb, inte en aggregerad invokation.
          </p>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-accent/30 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Start</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Hämtade</th>
                  <th className="px-3 py-2 text-right">Importerade</th>
                  <th className="px-3 py-2 text-right">Anrop</th>
                  <th className="px-3 py-2 text-left">Fel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.fallback_cron_sync_runs.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2">{fmtTs(row.started_at)}</td>
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
      )}

      {/* Failed customers */}
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
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                    Inga kunder med fel.
                  </td>
                </tr>
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

      {/* All recent customer runs */}
      <section>
        <h2 className="mb-3 text-sm font-semibold">Senaste kund-synker (alla lägen)</h2>
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
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">
                    Inga körningar.
                  </td>
                </tr>
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
