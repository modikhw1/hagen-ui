'use client';

import Link from 'next/link';
import WorkflowDot from '@/components/admin/team/WorkflowDot';
import { teamCopy } from '@/lib/admin/copy/team';
import { formatPriceSEK } from '@/lib/admin/money';
import { shortDateSv } from '@/lib/admin/time';
import type { TeamMemberView } from '@/hooks/admin/useTeam';

const statusDotClassName = {
  active: 'bg-status-success-fg',
  agreed: 'bg-status-success-fg',
  invited: 'bg-status-info-fg',
  default: 'bg-status-warning-fg',
} as const;

export default function TeamCustomerRow({
  customer,
  className,
  style,
}: {
  customer: TeamMemberView['customers'][number];
  className?: string;
  style?: React.CSSProperties;
}) {
  const statusClassName =
    statusDotClassName[customer.status as keyof typeof statusDotClassName] ??
    statusDotClassName.default;

  return (
    <Link
      href={`/admin/customers/${customer.id}`}
      className={`grid grid-cols-[2.2fr_1fr_1fr_1fr_0.8fr] items-center gap-2 rounded px-2 py-2 transition-colors hover:bg-accent/30 ${
        className ?? ''
      }`}
      style={style}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusClassName}`} />
        <span className="truncate text-sm font-medium text-foreground">{customer.business_name}</span>
        {customer.covered_by_absence ? (
          <span className="rounded-full bg-status-info-bg px-1.5 py-0.5 text-[9px] font-bold text-status-info-fg uppercase">
            {teamCopy.cover}
          </span>
        ) : null}
      </div>
      <div className="text-right text-sm text-foreground tabular-nums">
        {formatPriceSEK(customer.monthly_price, { fallback: '-' })}
      </div>
      <div className="text-right text-sm text-foreground tabular-nums">
        {customer.followers ? customer.followers.toLocaleString('sv-SE') : '-'}
      </div>
      <div className="text-right text-xs text-muted-foreground tabular-nums">
        {customer.last_upload_at ? shortDateSv(customer.last_upload_at) : '—'}
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <WorkflowDot active={Boolean(customer.last_upload_at)} label="Har publicerat" />
        <WorkflowDot active={customer.videos_last_7d > 0} label="Aktivitet 7d" />
        <WorkflowDot active={customer.engagement_rate > 3} label="Engagement > 3%" />
      </div>
    </Link>
  );
}
