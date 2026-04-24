import { cn } from '@/lib/utils';

const toneClassName: Record<
  NonNullable<SummaryCardProps['tone']>,
  string
> = {
  neutral: 'text-foreground',
  success: 'text-status-success-fg',
  warning: 'text-status-warning-fg',
  info: 'text-status-info-fg',
  destructive: 'text-status-danger-fg',
};

export type SummaryCardProps = {
  label: string;
  value: string | { primary: string; secondary?: string };
  tone?: 'neutral' | 'success' | 'warning' | 'info' | 'destructive';
  compact?: boolean;
  className?: string;
  delta?: number;
  trend?: 'up' | 'down' | 'flat';
};

function trendTone(trend: 'up' | 'down' | 'flat') {
  if (trend === 'up') return 'text-status-success-fg';
  if (trend === 'down') return 'text-status-danger-fg';
  return 'text-muted-foreground';
}

function trendSymbol(trend: 'up' | 'down' | 'flat') {
  if (trend === 'up') return '↑';
  if (trend === 'down') return '↓';
  return '→';
}

export default function SummaryCard({
  label,
  value,
  tone = 'neutral',
  compact = false,
  className,
  delta,
  trend = 'flat',
}: SummaryCardProps) {
  const primaryValue = typeof value === 'string' ? value : value.primary;
  const secondaryValue = typeof value === 'string' ? null : value.secondary;

  return (
    <div
      className={cn(
        'flex-1 rounded-lg border border-border bg-card',
        compact ? 'p-3' : 'p-4',
        className,
      )}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{label}</div>
      <div className="flex items-baseline gap-2">
        <div
          className={cn(
            'font-bold',
            compact ? 'mt-1 text-base' : 'mt-1 text-xl',
            toneClassName[tone],
          )}
        >
          {primaryValue}
        </div>
        {secondaryValue ? (
          <div className="text-xs font-medium text-muted-foreground">{secondaryValue}</div>
        ) : null}
      </div>
      {typeof delta === 'number' ? (
        <div className={cn('mt-1 text-xs font-semibold', trendTone(trend))}>
          {trendSymbol(trend)} {delta > 0 ? '+' : ''}
          {delta}
        </div>
      ) : null}
    </div>
  );
}
