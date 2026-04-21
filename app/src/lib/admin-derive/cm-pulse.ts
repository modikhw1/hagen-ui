import { differenceInCalendarDays } from 'date-fns';
import type { CustomerBufferStatus } from './buffer';

export type CmPulseInput = {
  cm: { id: string; name: string; avatarUrl: string | null };
  customers: {
    id: string;
    name: string;
    bufferStatus: CustomerBufferStatus;
    pace: 1 | 2 | 3 | 4 | 5;
    onboardingState: 'invited' | 'cm_ready' | 'live' | 'settled';
    lastPublishedAt?: Date | null;
  }[];
  interactions7d: { type: string; created_at: Date }[];
  lastInteractionAt: Date | null;
  now: Date;
};

export type CmStatus = 'in_phase' | 'watch' | 'needs_action';
export type SortMode = 'standard' | 'lowest_activity';

export function cmAggregate(input: CmPulseInput) {
  const active = input.customers.filter((customer) => customer.bufferStatus !== 'paused');
  const n_under = active.filter((customer) => customer.bufferStatus === 'under').length;
  const n_thin = active.filter((customer) => customer.bufferStatus === 'thin').length;
  const n_blocked = active.filter((customer) => customer.bufferStatus === 'blocked').length;
  const n_ok = active.filter((customer) => customer.bufferStatus === 'ok').length;
  const n_paused = input.customers.length - active.length;

  const last_interaction_days = input.lastInteractionAt
    ? differenceInCalendarDays(input.now, input.lastInteractionAt)
    : 999;

  const interaction_count_7d = input.interactions7d.length;
  const expected_concepts_7d = active.reduce((sum, customer) => sum + customer.pace, 0);

  let status: CmStatus;
  if (last_interaction_days >= 5 || n_under >= 2) status = 'needs_action';
  else if (n_under === 1 || n_thin >= 2 || last_interaction_days >= 3) status = 'watch';
  else status = 'in_phase';

  const fillPct = expected_concepts_7d === 0
    ? 100
    : Math.min(150, Math.round((interaction_count_7d / expected_concepts_7d) * 100));

  return {
    cmId: input.cm.id,
    status,
    counts: { n_under, n_thin, n_blocked, n_ok, n_paused },
    last_interaction_days,
    interaction_count_7d,
    expected_concepts_7d,
    fillPct,
    overflow: fillPct > 100,
    barLabel: `${interaction_count_7d}/${expected_concepts_7d} koncept`,
    newCustomers: input.customers.filter((customer) => customer.onboardingState === 'invited' || customer.onboardingState === 'cm_ready'),
    recentPublications: [...input.customers]
      .filter((customer) => customer.lastPublishedAt)
      .sort((a, b) => +((b.lastPublishedAt as Date)) - +((a.lastPublishedAt as Date)))
      .slice(0, 3),
  };
}

export function sortCmRows(rows: ReturnType<typeof cmAggregate>[], mode: SortMode) {
  const order = { needs_action: 0, watch: 1, in_phase: 2 } as const;

  if (mode === 'standard') {
    return [...rows].sort((a, b) =>
      order[a.status] - order[b.status] ||
      b.last_interaction_days - a.last_interaction_days,
    );
  }

  return [...rows].sort((a, b) => a.interaction_count_7d - b.interaction_count_7d);
}
