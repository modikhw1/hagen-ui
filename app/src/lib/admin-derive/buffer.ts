export type CustomerBufferInput = {
  pace: 1 | 2 | 3 | 4 | 5;
  latestPlannedPublishDate: Date | null;
  pausedUntil: Date | null;
  today: Date;
};

const REQUIREMENTS: Record<1 | 2 | 3 | 4 | 5, { min: number; goal: number }> = {
  1: { min: 3, goal: 7 },
  2: { min: 3, goal: 6 },
  3: { min: 3, goal: 5 },
  4: { min: 2, goal: 4 },
  5: { min: 2, goal: 4 },
};

export type CustomerBufferStatus = 'ok' | 'thin' | 'under' | 'paused' | 'blocked';

export function bufferDays(input: CustomerBufferInput): number {
  if (!input.latestPlannedPublishDate) return 0;
  const diff = Math.floor((+input.latestPlannedPublishDate - +input.today) / 86_400_000);
  return Math.max(0, diff);
}

export function customerBufferStatus(input: {
  pace: 1 | 2 | 3 | 4 | 5;
  latestPlannedPublishDate: Date | null;
  pausedUntil: Date | null;
  today: Date;
  overdue7dConceptsCount?: number;
}, blockedDays: number): CustomerBufferStatus {
  if (input.pausedUntil && input.pausedUntil > input.today) return 'paused';

  const days = bufferDays(input);
  const requirement = REQUIREMENTS[input.pace];

  // If we have concepts overdue by 7+ days, or if publication has stalled for 7+ days
  if ((input.overdue7dConceptsCount || 0) > 0 || (blockedDays >= 7 && days >= requirement.min)) return 'blocked';
  if (days >= requirement.goal) return 'ok';
  if (days >= requirement.min) return 'thin';
  return 'under';
}
