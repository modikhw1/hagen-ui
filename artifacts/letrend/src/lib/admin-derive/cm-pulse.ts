import { differenceInCalendarDays } from 'date-fns';
import type { CustomerBufferStatus } from './buffer';

export type CmPulseInput = {
  cm: { id: string; name: string; avatarUrl: string | null };
  activeAbsence?: {
    absenceType: string;
    startsOn: string;
    endsOn: string;
    backupCmName: string | null;
  } | null;
  customers: {
    id: string;
    name: string;
    bufferStatus: CustomerBufferStatus;
    pace: 1 | 2 | 3 | 4 | 5;
    onboardingState: 'invited' | 'cm_ready' | 'live' | 'settled';
    lastPublishedAt?: Date | null;
    plannedConceptsCount?: number;
    overdue7dConceptsCount?: number;
  }[];
  interactions7d: { type: string; created_at: Date }[];
  lastInteractionAt: Date | null;
  now: Date;
};

export type CmStatus = 'away' | 'ok' | 'watch' | 'needs_action';
export type SortMode = 'standard' | 'lowest_activity';

export function cmAggregate(input: CmPulseInput) {
  const active = input.customers.filter((customer) => customer.bufferStatus !== 'paused');
  const n_blocked = active.filter((c) => (c.overdue7dConceptsCount || 0) > 0 || c.bufferStatus === 'blocked').length;
  const n_under = active.filter((c) => (c.plannedConceptsCount || 0) < c.pace && !((c.overdue7dConceptsCount || 0) > 0 || c.bufferStatus === 'blocked')).length;
  const n_ok = active.length - n_under - n_blocked;
  const n_thin = active.filter((c) => (c.plannedConceptsCount || 0) >= c.pace && c.bufferStatus !== 'ok' && !((c.overdue7dConceptsCount || 0) > 0 || c.bufferStatus === 'blocked')).length;
  const n_paused = input.customers.length - active.length;

  const last_interaction_days = input.lastInteractionAt
    ? differenceInCalendarDays(input.now, input.lastInteractionAt)
    : 999;

  // x = total concepts currently planned across all active customers (capped at pace per customer)
  const planned_concepts_total = active.reduce((sum, customer) => sum + Math.min(customer.plannedConceptsCount || 0, customer.pace), 0);
  
  // y = total expected concepts per week across all active customers
  const expected_concepts_7d = active.reduce((sum, customer) => sum + customer.pace, 0);

  let status: CmStatus;
  if (input.activeAbsence) status = 'away';
  else if (last_interaction_days >= 5 || n_under >= 2 || (expected_concepts_7d > 0 && planned_concepts_total < expected_concepts_7d * 0.5)) status = 'needs_action';
  else if (n_under === 1 || n_thin >= 2 || last_interaction_days >= 3 || (expected_concepts_7d > 0 && planned_concepts_total < expected_concepts_7d)) status = 'watch';
  else status = 'ok';

  const fillPct = expected_concepts_7d === 0
    ? 100
    : Math.min(150, Math.round((planned_concepts_total / expected_concepts_7d) * 100));

  return {
    cmId: input.cm.id,
    status,
    activeAbsence: input.activeAbsence ?? null,
    counts: { n_under, n_thin, n_blocked, n_ok, n_paused },
    totalCustomers: input.customers.length,
    lastInteractionAt: input.lastInteractionAt,
    last_interaction_days,
    planned_concepts_total,
    expected_concepts_7d,
    fillPct,
    overflow: fillPct > 100,
    barLabel: `${planned_concepts_total}/${expected_concepts_7d} koncept`,
    interaction_count_7d: input.interactions7d?.length ?? 0,
    newCustomers: input.customers.filter((customer) => customer.onboardingState === 'invited' || customer.onboardingState === 'cm_ready'),
    recentPublications: [...input.customers]
      .filter((customer) => customer.lastPublishedAt)
      .sort((a, b) => +((b.lastPublishedAt as Date)) - +((a.lastPublishedAt as Date)))
      .slice(0, 3),
  };
}

export function sortCmRows(rows: any[], mode: SortMode) {
  const order = { needs_action: 0, watch: 1, away: 2, ok: 3 } as const;

  return [...rows].sort((a, b) => {
    const aggA = a.aggregate || a;
    const aggB = b.aggregate || b;
    
    // 1. If "Operativ status", status is the absolute first priority (Red groups together)
    if (mode === 'standard') {
      const sA = order[aggA.status as keyof typeof order] ?? 99;
      const sB = order[aggB.status as keyof typeof order] ?? 99;
      if (sA !== sB) return sA - sB;
    }

    // 2. RATIO FIRST (This is what the user sees and expects)
    // Lowest percentage (e.g. 0%, 29%, 33%) always comes first
    const fA = aggA.fillPct ?? 0;
    const fB = aggB.fillPct ?? 0;
    if (fA !== fB) return fA - fB;

    // 3. INACTIVITY (Idle time)
    // If ratios are equal, the one who has been away longest comes first
    const idleA = aggA.last_interaction_days ?? 0;
    const idleB = aggB.last_interaction_days ?? 0;
    if (idleA !== idleB) return idleB - idleA;

    // 4. Fallback: Newest CM first
    const memA = a.member || {};
    const memB = b.member || {};
    const tA = memA.created_at ? new Date(memA.created_at).getTime() : 0;
    const tB = memB.created_at ? new Date(memB.created_at).getTime() : 0;
    return tB - tA;
  });
}
