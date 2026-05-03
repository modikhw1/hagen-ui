const loadStyles = {
  ok: 'border-status-success-fg/30 bg-status-success-bg text-status-success-fg',
  warn: 'border-status-warning-fg/30 bg-status-warning-bg text-status-warning-fg',
  overload: 'border-status-danger-fg/30 bg-status-danger-bg text-status-danger-fg',
} as const;

const loadWidths = {
  ok: 'w-1/4',
  warn: 'w-1/2',
  overload: 'w-full',
} as const;

export default function CustomerLoadPill({
  level,
  label,
  count,
}: {
  level: keyof typeof loadStyles;
  label: string;
  count: number;
}) {
  return (
    <div className="w-24">
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase font-bold text-muted-foreground">
        <span>{label}</span>
        <span>{count}</span>
      </div>
      <div className={`h-1.5 overflow-hidden rounded-full border bg-secondary ${loadStyles[level]}`}>
        <div className={`h-full rounded-full bg-current ${loadWidths[level]}`} />
      </div>
    </div>
  );
}
