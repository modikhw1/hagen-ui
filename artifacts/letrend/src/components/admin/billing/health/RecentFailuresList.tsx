import type { BillingHealthResponse } from '@/lib/admin/dtos/billing';
import { shortDateSv } from '@/lib/admin/time';

export default function RecentFailuresList({
  entries,
  isLoading,
}: {
  entries: BillingHealthResponse['recentFailures'];
  isLoading: boolean;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">Recent failures</h3>
      <p className="mt-1 text-xs text-muted-foreground">Handelser som kraver uppfoljning</p>

      {isLoading ? (
        <div className="mt-3 text-sm text-muted-foreground">Laddar...</div>
      ) : entries.length === 0 ? (
        <div className="mt-3 text-sm text-muted-foreground">Inga misslyckade handelser.</div>
      ) : (
        <ul className="mt-3 space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-md border border-border p-3">
              <div className="text-sm font-medium text-foreground">{entry.event_type}</div>
              <div className="mt-1 text-xs text-muted-foreground">{shortDateSv(entry.created_at)}</div>
              {entry.error_message ? (
                <div className="mt-2 text-xs text-destructive">{entry.error_message}</div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
