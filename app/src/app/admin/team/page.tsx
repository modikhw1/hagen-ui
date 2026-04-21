'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import AdminAvatar from '@/components/admin/AdminAvatar';
import AddCMDialog from '@/components/admin/team/AddCMDialog';
import CMEditDialog from '@/components/admin/team/CMEditDialog';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import type { DailyDot } from '@/lib/admin-derive/team-flow';
import { formatSek } from '@/lib/admin/money';
import { useTeam, type TeamMemberView } from '@/hooks/admin/useTeam';

export default function TeamPage() {
  const { data: team = [], isLoading, refetch } = useTeam();
  const [selected, setSelected] = useState<TeamMemberView | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [sortMode, setSortMode] = useState<'standard' | 'anomalous'>('standard');

  const cmOptions = useMemo(
    () =>
      team.map((member) => ({
        id: member.id,
        name: member.name,
        is_active: member.is_active,
      })),
    [team],
  );

  const sortedTeam = useMemo(() => {
    return [...team].sort((left, right) => {
      if (sortMode === 'anomalous') {
        const rightDeviation = right.activityDeviation;
        const leftDeviation = left.activityDeviation;
        if (rightDeviation !== leftDeviation) {
          return rightDeviation - leftDeviation;
        }
      }

      return right.mrr_ore - left.mrr_ore || right.customerCount - left.customerCount;
    });
  }, [sortMode, team]);

  if (isLoading) {
    return <div className="py-12 text-sm text-muted-foreground">Laddar team...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Team</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Content managers och deras kundpuls
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSortMode((mode) => (mode === 'standard' ? 'anomalous' : 'standard'))}
            className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            {sortMode === 'anomalous' ? 'Standardordning' : 'Avvikande aktivitet forst'}
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            + Lagg till
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {sortedTeam.map((member) => (
          <div key={member.id} className="rounded-lg border border-border bg-card p-5">
            <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <div className="shrink-0">
                  <AdminAvatar name={member.name} avatarUrl={member.avatar_url} size="lg" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-foreground">{member.name}</div>
                    <span className="rounded-full bg-secondary px-2 py-1 text-[11px] font-medium text-muted-foreground">
                      Avvikelse {Math.round(member.activityDeviation * 100)}%
                    </span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {member.city || member.email || 'Ingen ort angiven'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6 lg:ml-auto">
                <CMStat label="Kunder" value={member.customerCount} />
                <HoverCard openDelay={200}>
                  <HoverCardTrigger asChild>
                    <div className="cursor-help text-right">
                      <div className="text-sm font-semibold text-foreground">
                        {formatSek(member.mrr_ore)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">MRR</div>
                    </div>
                  </HoverCardTrigger>
                  <HoverCardContent side="top" className="w-56 p-3">
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total MRR</span>
                        <span className="font-semibold text-foreground">
                          {formatSek(member.mrr_ore)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">~20% ersattning</span>
                        <span className="font-semibold text-foreground">
                          {formatSek(Math.round(member.mrr_ore * 0.2))}
                        </span>
                      </div>
                      <div className="border-t border-border pt-1.5 text-[11px] text-muted-foreground">
                        Baserat pa total MRR for servade kunder
                      </div>
                    </div>
                  </HoverCardContent>
                </HoverCard>
                <div className="flex min-w-[210px] flex-col items-end gap-2">
                  <CustomerLoadPill
                    className={member.customerLoadClass}
                    overloaded={member.overloaded}
                    label={member.customerLoadLabel}
                    count={member.customerCount}
                  />
                  <ActivityDotMatrix dots={member.activityDots} />
                  <div className="text-[11px] text-muted-foreground">
                    {member.activitySummary.activeDays}/{member.activitySummary.total} aktiva dagar
                    {' · '}
                    median {member.activitySummary.median}
                    {' · '}
                    langsta vila {member.activitySummary.longestRest}d
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelected(member)}
                  className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Redigera
                </button>
              </div>
            </div>

            {member.customers.length > 0 ? (
              <div className="border-t border-border pt-3">
                <div className="mb-2 grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <div>Kund</div>
                  <div className="text-right">MRR</div>
                  <div className="text-right">Foljare</div>
                  <div className="text-right">Flode</div>
                </div>
                {member.customers.map((customer) => (
                  <Link
                    key={customer.id}
                    href={`/admin/customers/${customer.id}`}
                    className="grid grid-cols-[2fr_1fr_1fr_1fr] items-center gap-2 rounded px-2 py-2 transition-colors hover:bg-accent/30"
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
                      <span className="truncate text-sm text-foreground">
                        {customer.business_name}
                      </span>
                    </div>
                    <div className="text-right text-sm text-foreground">
                      {customer.monthly_price > 0
                        ? formatSek(Math.round(customer.monthly_price * 100))
                        : '-'}
                    </div>
                    <div className="text-right text-sm text-foreground">
                      {customer.followers
                        ? customer.followers.toLocaleString('sv-SE')
                        : '-'}
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      <WorkflowDot active={Boolean(customer.last_upload_at)} />
                      <WorkflowDot active={customer.videos_last_7d > 0} />
                      <WorkflowDot active={customer.engagement_rate > 3} />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-secondary/30 px-4 py-4 text-sm text-muted-foreground">
                Inga kunder kopplade annu.
              </div>
            )}
          </div>
        ))}
      </div>

      <AddCMDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSaved={async () => {
          setShowAdd(false);
          await refetch();
        }}
      />

      {selected ? (
        <CMEditDialog
          open={Boolean(selected)}
          cm={selected}
          allCMs={cmOptions}
          onClose={() => setSelected(null)}
          onSaved={async () => {
            setSelected(null);
            await refetch();
          }}
        />
      ) : null}
    </div>
  );
}

function ActivityDotMatrix({ dots }: { dots: DailyDot[] }) {
  return (
    <div
      className="flex items-center gap-1"
      title="Senaste 14 dagarnas aktivitet relativt mot 90-dagarsbaseline"
    >
      {dots.map((dot) => (
        <span
          key={dot.date.toISOString()}
          className={dotClassName(dot)}
          title={`${dot.date.toLocaleDateString('sv-SE')}: ${dot.count} handelser`}
        />
      ))}
    </div>
  );
}

function dotClassName(dot: DailyDot) {
  const base = 'inline-flex h-2.5 w-2.5 rounded-full border border-border/50';
  if (dot.level === 'empty') return `${base} bg-muted`;
  if (dot.level === 'low') return `${base} bg-primary/20 border-primary/20`;
  if (dot.level === 'mid') return `${base} bg-primary/50 border-primary/40`;
  if (dot.level === 'high') return `${base} bg-primary border-primary`;
  return `${base} bg-primary ring-2 ring-primary/40 border-primary`;
}

function CustomerLoadPill({
  className,
  overloaded,
  label,
  count,
}: {
  className: 'w-1/4' | 'w-1/2' | 'w-full';
  overloaded: boolean;
  label: string;
  count: number;
}) {
  return (
    <div className="w-24">
      <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span>{count}</span>
      </div>
      <div
        className={`h-2 overflow-hidden rounded-full border bg-secondary ${
          overloaded ? 'border-destructive/60' : 'border-border'
        }`}
      >
        <div
          className={`h-full rounded-full ${className} ${
            overloaded ? 'bg-destructive' : 'bg-primary'
          }`}
        />
      </div>
    </div>
  );
}

function CMStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-right">
      <div className="text-sm font-semibold text-foreground">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function WorkflowDot({ active }: { active: boolean }) {
  return (
    <span
      className={`h-2.5 w-2.5 rounded-full ${
        active ? 'bg-success' : 'bg-muted'
      }`}
    />
  );
}
