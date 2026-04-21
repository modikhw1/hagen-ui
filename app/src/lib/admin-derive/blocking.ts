export type BlockingState = 'none' | 'blocked' | 'escalated';

export type BlockingReference = 'none' | 'publication' | 'activation';

export function customerBlocking(input: {
  lastPublishedAt: Date | null;
  activatedAt: Date | null;
  isLive: boolean;
  pausedUntil: Date | null;
  today: Date;
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
  if (days >= 7) {
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
