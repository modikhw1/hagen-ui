'use client';

import Link from 'next/link';
import { Tooltip } from '@mantine/core';
import WorkflowDot from '@/components/admin/team/WorkflowDot';
import { teamCopy } from '@/lib/admin/copy/team';
import { formatSek } from '@/lib/admin/money';
import { longDateSv, shortDateSv } from '@/lib/admin/time';
import type { TeamMemberView } from '@/hooks/admin/useTeam';

const statusDotClassName = {
  active: 'bg-status-success-fg',
  agreed: 'bg-status-success-fg',
  invited: 'bg-status-info-fg',
  default: 'bg-status-warning-fg',
} as const;

const FLOW_DOT_COUNT = 4;

function clampExpectedConcepts(value: number | undefined) {
  return Math.min(7, Math.max(0, value ?? 0));
}

function buildFlowState(customer: TeamMemberView['customers'][number]) {
  const plannedConceptsCount = Math.max(0, customer.planned_concepts_count ?? 0);
  const expectedConceptsPerWeek = clampExpectedConcepts(customer.expected_concepts_per_week);
  const overdueConceptsCount = Math.max(0, customer.overdue_7d_concepts_count ?? 0);
  const cappedPlannedConcepts = Math.min(plannedConceptsCount, expectedConceptsPerWeek || plannedConceptsCount);
  const completionRatio =
    expectedConceptsPerWeek > 0 ? Math.min(1, cappedPlannedConcepts / expectedConceptsPerWeek) : 0;
  const filledDots =
    plannedConceptsCount === 0
      ? 0
      : Math.max(1, Math.min(FLOW_DOT_COUNT, Math.ceil(completionRatio * FLOW_DOT_COUNT)));
  const missingConcepts =
    expectedConceptsPerWeek > 0 ? Math.max(0, expectedConceptsPerWeek - cappedPlannedConcepts) : 0;

  const labelParts = [
    expectedConceptsPerWeek > 0
      ? `${plannedConceptsCount}/${expectedConceptsPerWeek} koncept planerade denna vecka`
      : `${plannedConceptsCount} koncept i planen`,
    expectedConceptsPerWeek > 0
      ? missingConcepts > 0
        ? `${missingConcepts} saknas för att hålla tempot`
        : 'Tempot är täckt för veckan'
      : null,
    overdueConceptsCount > 0 ? `${overdueConceptsCount} sena koncept` : null,
  ].filter(Boolean);

  return {
    filledDots,
    label: labelParts.join(' · '),
  };
}

function buildPublicationHoverLabel(customer: TeamMemberView['customers'][number]) {
  const publicationDate = customer.last_published_at ?? customer.last_upload_at;
  if (!publicationDate) {
    return null;
  }

  const sourceSuffix =
    customer.last_publication_source === 'tiktok'
      ? '(tiktok)'
      : customer.last_publication_source === 'letrend'
        ? '(letrend)'
        : customer.last_upload_at && customer.last_upload_at === publicationDate
          ? '(tiktok)'
        : null;

  return sourceSuffix
    ? `${longDateSv(publicationDate)} ${sourceSuffix}`
    : longDateSv(publicationDate);
}

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
  const flow = buildFlowState(customer);
  const publicationDate = customer.last_published_at ?? customer.last_upload_at;
  const publicationHoverLabel = buildPublicationHoverLabel(customer);

  return (
    <Link
      href={`/admin/customers/${customer.id}`}
      className={`grid grid-cols-[2.2fr_1fr_1fr_1fr_1fr] items-center gap-2 rounded px-2 py-2 transition-colors hover:bg-accent/30 ${
        className ?? ''
      }`}
      style={style}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusClassName}`} />
        <span className="truncate text-sm font-medium text-foreground">{customer.business_name}</span>
        {customer.covered_by_absence ? (
          <span className="rounded-full bg-status-info-bg px-1.5 py-0.5 text-[9px] font-bold uppercase text-status-info-fg">
            {teamCopy.cover}
          </span>
        ) : null}
      </div>
      <div className="text-right text-sm text-foreground tabular-nums">
        {formatSek(customer.monthly_price, { unit: 'sek', fallback: '-' })}
      </div>
      <div className="text-right text-sm text-foreground tabular-nums">
        {customer.followers > 0 ? customer.followers.toLocaleString('sv-SE') : '-'}
      </div>
      <div className="text-right text-xs text-muted-foreground tabular-nums">
        {publicationDate ? (
          <Tooltip label={publicationHoverLabel} position="top" withArrow>
            <span className="cursor-help">{shortDateSv(publicationDate)}</span>
          </Tooltip>
        ) : (
          '-'
        )}
      </div>
      <div className="flex items-center justify-end gap-1.5">
        {Array.from({ length: FLOW_DOT_COUNT }, (_, index) => (
          <WorkflowDot
            key={`${customer.id}-flow-${index}`}
            active={index < flow.filledDots}
            label={flow.label}
          />
        ))}
      </div>
    </Link>
  );
}
