export type DerivedCustomerStatus =
  | 'archived'
  | 'paused'
  | 'invited_new'
  | 'invited_stale'
  | 'live_underfilled'
  | 'live_healthy'
  | 'escalated';

type DeriveCustomerStatusInput = {
  status?: string | null;
  archived_at?: string | null;
  paused_until?: string | null;
  invited_at?: string | null;
  concepts_per_week?: number | null;
  latest_planned_publish_date?: string | null;
  escalation_flag?: boolean | null;
};

function isFutureDate(value?: string | null, now = Date.now()) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now;
}

export function deriveCustomerStatus(
  input: DeriveCustomerStatusInput,
  now = new Date(),
): DerivedCustomerStatus | null {
  const status = (input.status ?? '').toLowerCase();
  const nowMs = now.getTime();

  if (input.archived_at || status === 'archived') {
    return 'archived';
  }

  if (input.escalation_flag === true) {
    return 'escalated';
  }

  if (isFutureDate(input.paused_until, nowMs)) {
    return 'paused';
  }

  if (status === 'invited') {
    const invitedAtMs = input.invited_at ? Date.parse(input.invited_at) : Number.NaN;
    if (Number.isFinite(invitedAtMs)) {
      const staleCutoffMs = nowMs - 14 * 24 * 60 * 60 * 1000;
      return invitedAtMs > staleCutoffMs ? 'invited_new' : 'invited_stale';
    }
    return 'invited_stale';
  }

  if (status === 'active') {
    const conceptsPerWeek =
      typeof input.concepts_per_week === 'number'
        ? input.concepts_per_week
        : null;
    const latestPlannedDateMs = input.latest_planned_publish_date
      ? Date.parse(input.latest_planned_publish_date)
      : Number.NaN;
    if (
      conceptsPerWeek === null ||
      !Number.isFinite(latestPlannedDateMs) ||
      latestPlannedDateMs < nowMs
    ) {
      return 'live_underfilled';
    }
    return 'live_healthy';
  }

  return null;
}
