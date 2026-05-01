export type DerivedCustomerStatus =
  | 'archived'
  | 'paused'
  | 'prospect'
  | 'invited_new'
  | 'invited_stale'
  | 'stripe_error'
  | 'live_underfilled'
  | 'live_healthy'
  | 'escalated';

type DeriveCustomerStatusInput = {
  status?: string | null;
  archived_at?: string | null;
  paused_until?: string | null;
  invited_at?: string | null;
  concepts_per_week?: number | null;
  expected_concepts_per_week?: number | null;
  latest_planned_publish_date?: string | null;
  escalation_flag?: boolean | null;
  stripe_customer_id?: string | null;
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

  if (status === 'prospect') {
    return 'prospect';
  }

  if (isFutureDate(input.paused_until, nowMs)) {
    return 'paused';
  }

  if (status === 'invited' || status === 'pending') {
    // Om kunden är inbjuden men saknar Stripe-koppling är det ett kritiskt fel
    if (!input.stripe_customer_id) {
      return 'stripe_error';
    }

    const invitedAtMs = input.invited_at ? Date.parse(input.invited_at) : Number.NaN;
    if (Number.isFinite(invitedAtMs)) {
      const staleCutoffMs = nowMs - 7 * 24 * 60 * 60 * 1000; // 7 dagar istället för 14
      return invitedAtMs > staleCutoffMs ? 'invited_new' : 'invited_stale';
    }
    return 'invited_stale';
  }

  if (status === 'active' || status === 'agreed') {
    const expected = input.expected_concepts_per_week ?? 2;
    const latestPlannedDateMs = input.latest_planned_publish_date
      ? Date.parse(input.latest_planned_publish_date)
      : Number.NaN;
    
    // Om vi inte har planerat koncept för de närmaste 1.5 veckorna (buffert-check)
    const bufferCutoffMs = nowMs + (expected > 0 ? 10 : 0) * 24 * 60 * 60 * 1000;

    if (
      !Number.isFinite(latestPlannedDateMs) ||
      latestPlannedDateMs < bufferCutoffMs
    ) {
      return 'live_underfilled';
    }
    return 'live_healthy';
  }

  return null;
}
