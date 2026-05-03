import { cn } from '@/lib/utils';
import type { OperatorTone } from '@/lib/admin/copy/operator-glossary';

const toneClass: Record<OperatorTone, string> = {
  success: 'bg-status-success-bg text-status-success-fg',
  warning: 'bg-status-warning-bg text-status-warning-fg',
  danger:  'bg-status-danger-bg text-status-danger-fg',
  info:    'bg-status-info-bg text-status-info-fg',
  neutral: 'bg-status-neutral-bg text-status-neutral-fg',
};

export function StatusPill({
  label,
  tone = 'neutral',
  size = 'sm',
  className,
}: {
  label: string;
  tone?: OperatorTone;
  size?: 'xs' | 'sm';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs',
        toneClass[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}

export function SeverityPill({
  severity,
  className,
}: {
  severity: 'critical' | 'high' | 'medium' | 'low' | string;
  className?: string;
}) {
  const toneMap: Record<string, OperatorTone> = {
    critical: 'danger',
    high: 'warning',
    medium: 'info',
    low: 'neutral',
  };

  const labelMap: Record<string, string> = {
    critical: 'Kritisk',
    high: 'Hög',
    medium: 'Medel',
    low: 'Låg',
  };

  const tone = toneMap[severity] || 'neutral';
  const label = labelMap[severity] || severity;

  return <StatusPill tone={tone} label={label} className={className} />;
}
