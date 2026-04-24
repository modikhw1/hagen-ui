'use client';

type Props = {
  actor?: string;
  action?: string;
  entity?: string;
  from?: string;
  to?: string;
  actions: string[];
  entities: string[];
  onChange: (updates: Record<string, string | null>) => void;
};

export function AuditLogFilters({
  actor,
  action,
  entity,
  from,
  to,
  actions,
  entities,
  onChange,
}: Props) {
  return (
    <div className="grid gap-3 md:grid-cols-5">
      <input
        value={actor ?? ''}
        onChange={(event) => onChange({ actor: event.target.value || null })}
        placeholder="Filtrera actor"
        className="rounded-md border border-border bg-card px-3 py-2 text-sm"
      />
      <select
        value={action ?? ''}
        onChange={(event) => onChange({ action: event.target.value || null })}
        className="rounded-md border border-border bg-card px-3 py-2 text-sm"
      >
        <option value="">Alla actions</option>
        {actions.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
      <select
        value={entity ?? ''}
        onChange={(event) => onChange({ entity: event.target.value || null })}
        className="rounded-md border border-border bg-card px-3 py-2 text-sm"
      >
        <option value="">Alla entities</option>
        {entities.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={from ?? ''}
        onChange={(event) => onChange({ from: event.target.value || null })}
        className="rounded-md border border-border bg-card px-3 py-2 text-sm"
      />
      <input
        type="date"
        value={to ?? ''}
        onChange={(event) => onChange({ to: event.target.value || null })}
        className="rounded-md border border-border bg-card px-3 py-2 text-sm"
      />
    </div>
  );
}
