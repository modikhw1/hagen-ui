import Link from 'next/link';
import { formatSek } from '@/lib/admin/money';
import type { TeamMemberView } from '@/hooks/admin/useTeam';
import WorkflowDot from '@/components/admin/team/WorkflowDot';

export default function TeamCustomerRow({
  customer,
  className,
  style,
}: {
  customer: TeamMemberView['customers'][number];
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Link
      href={`/admin/customers/${customer.id}`}
      className={`grid grid-cols-[2fr_1fr_1fr_1fr] items-center gap-2 rounded px-2 py-2 transition-colors hover:bg-accent/30 ${
        className ?? ''
      }`}
      style={style}
    >
      <div className="flex items-center gap-2">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{
            backgroundColor:
              customer.status === 'active' || customer.status === 'agreed'
                ? 'hsl(var(--success))'
                : customer.status === 'invited'
                  ? 'hsl(var(--info))'
                  : 'hsl(var(--warning))',
          }}
        />
        <span className="truncate text-sm text-foreground">{customer.business_name}</span>
        {customer.covered_by_absence ? (
          <span className="rounded-full bg-info/10 px-2 py-0.5 text-[10px] font-semibold text-info">
            Cover
          </span>
        ) : null}
      </div>
      <div className="text-right text-sm text-foreground">
        {customer.monthly_price > 0 ? formatSek(Math.round(customer.monthly_price * 100)) : '-'}
      </div>
      <div className="text-right text-sm text-foreground">
        {customer.followers ? customer.followers.toLocaleString('sv-SE') : '-'}
      </div>
      <div className="flex items-center justify-end gap-1">
        <WorkflowDot active={Boolean(customer.last_upload_at)} />
        <WorkflowDot active={customer.videos_last_7d > 0} />
        <WorkflowDot active={customer.engagement_rate > 3} />
      </div>
    </Link>
  );
}
