'use client';

import { Tooltip, Text, Box, Stack, Group } from '@mantine/core';
import { teamCopy } from '@/lib/admin/copy/team';
import { formatSek } from '@/lib/admin/money';
import type { TeamMemberView } from '@/hooks/admin/useTeam';

function PulseMetric({
  title,
  value,
  subtitle,
  align = 'center',
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  align?: 'left' | 'center';
}) {
  return (
    <div
      className={`rounded-lg border border-border/70 bg-secondary/20 px-3 py-2 ${
        align === 'left' ? 'text-left' : 'text-center'
      }`}
    >
      <div className="text-base font-semibold leading-none text-foreground tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{title}</div>
      {subtitle ? <div className="mt-1 text-[11px] text-muted-foreground">{subtitle}</div> : null}
    </div>
  );
}

export default function TeamMemberKpiCluster({
  member,
}: {
  member: TeamMemberView;
}) {
  const pulse = member.pulse;
  const pulseSummary = [
    pulse.counts.n_under > 0 ? `${pulse.counts.n_under} under` : null,
    pulse.counts.n_blocked > 0 ? `${pulse.counts.n_blocked} blockerade` : null,
    pulse.counts.n_ok > 0 ? `${pulse.counts.n_ok} i fas` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="grid min-w-0 gap-2 sm:grid-cols-3 xl:min-w-[470px]">
      <PulseMetric title={teamCopy.customers} value={member.customerCount} />

      <Tooltip
        withArrow
        position="top"
        label={
          <Stack gap={4} p={4} w={200}>
            <Group justify="space-between">
              <Text size="xs" c="dimmed">{teamCopy.totalMrr}</Text>
              <Text size="xs" fw={600}>{formatSek(member.mrr_ore)}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                {teamCopy.compensationPreview(Math.round(member.commission_rate * 100))}
              </Text>
              <Text size="xs" fw={600}>
                {formatSek(Math.round(member.mrr_ore * member.commission_rate))}
              </Text>
            </Group>
            <Box style={(theme) => ({ borderTop: `1px solid ${theme.colors.gray[7]}`, paddingTop: 4 })}>
              <Text size="10px" c="dimmed">
                {teamCopy.basedOnMrr}
              </Text>
            </Box>
          </Stack>
        }
      >
        <div className="cursor-help">
          <PulseMetric title={teamCopy.mrr} value={formatSek(member.mrr_ore)} />
        </div>
      </Tooltip>

      <div className="rounded-lg border border-border/70 bg-secondary/20 px-3 py-2">
        <div className="flex items-center justify-center">
          <div className="h-1.5 w-full max-w-[132px] overflow-hidden rounded-full bg-accent/40">
            <div
              className="h-full rounded-full bg-primary/70 transition-all"
              style={{ width: `${Math.min(pulse.fillPct, 100)}%` }}
            />
          </div>
        </div>
        <div className="mt-2 text-center text-sm font-semibold text-foreground tabular-nums">
          {pulse.barLabel}
        </div>
        <div className="mt-1 min-h-[16px] text-center text-[11px] text-muted-foreground">
          {pulseSummary || 'Ingen plan aktiv ännu'}
        </div>
      </div>
    </div>
  );
}
