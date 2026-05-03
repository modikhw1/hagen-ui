export type BlockingState = 'none' | 'blocked' | 'escalated';

export type BlockingReference = 'none' | 'publication' | 'activation';

export function customerBlocking(input: {
  lastPublishedAt: Date | null;
  activatedAt: Date | null;
  isLive: boolean;
  pausedUntil: Date | null;
  today: Date;
  overdue7dConceptsCount?: number;
}): {
  state: BlockingState;
  daysSincePublish: number;
  reference: BlockingReference;
  daysSinceReference: number;
} {
  if (input.pausedUntil && input.pausedUntil > input.today) {
    return {
      state: 'none',
      daysSincePublish: 0,
      reference: 'none',
      daysSinceReference: 0,
    };
  }

  // If we have concepts that are 7+ days overdue, mark as blocked.
  const hasSignificantOverdue = (input.overdue7dConceptsCount || 0) > 0;

  if (!input.lastPublishedAt) {
    if (!input.isLive || !input.activatedAt) {
      return {
        state: 'none',
        daysSincePublish: 0,
        reference: 'none',
        daysSinceReference: 0,
      };
    }

    return {
      state: 'escalated',
      daysSincePublish: 999,
      reference: 'activation',
      daysSinceReference: Math.max(
        0,
        Math.floor((+input.today - +input.activatedAt) / 86_400_000),
      ),
    };
  }

  const days = Math.floor((+input.today - +input.lastPublishedAt) / 86_400_000);
  
  if (days >= 10) {
    return {
      state: 'escalated',
      daysSincePublish: days,
      reference: 'publication',
      daysSinceReference: days,
    };
  }

  // Blocked if: 7 days since last pub OR we have concepts overdue by 7+ days
  if (days >= 7 || hasSignificantOverdue) {
    return {
      state: 'blocked',
      daysSincePublish: days,
      reference: 'publication',
      daysSinceReference: days,
    };
  }

  return {
    state: 'none',
    daysSincePublish: days,
    reference: 'publication',
    daysSinceReference: days,
  };
}

export function blockingDisplayDays(input: {
  daysSincePublish: number;
  daysSinceReference: number;
  reference: BlockingReference;
}) {
  return input.reference === 'activation'
    ? input.daysSinceReference
    : input.daysSincePublish;
}
