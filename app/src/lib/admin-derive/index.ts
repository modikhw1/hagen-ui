import { customerBufferStatus, type CustomerBufferStatus } from '@/lib/admin-derive/buffer';
import {
  blockingDisplayDays,
  customerBlocking,
  type BlockingState,
} from '@/lib/admin-derive/blocking';
import {
  deriveOnboardingState,
  settleIfDue,
  type OnboardingState,
} from '@/lib/admin-derive/onboarding';

type CustomerOperationalInput = {
  status: string;
  created_at: string;
  agreed_at: string | null;
  onboarding_state: OnboardingState | null;
  expected_concepts_per_week?: number | null;
  concepts_per_week?: number | null;
  latest_planned_publish_date: string | null;
  last_published_at: string | null;
  paused_until: string | null;
  tiktok_handle: string | null;
  attention_snoozes: Array<{
    subject_type: 'onboarding' | 'customer_blocking';
    subject_id: string;
    snoozed_until: string | null;
    released_at: string | null;
    note: string | null;
  }>;
};

export type BlockingSignal = ReturnType<typeof customerBlocking>;

export type DerivedCustomerOperationalSignals = {
  blocking: BlockingSignal;
  visibleBlockingDays: number;
  onboardingChecklist: {
    contractSigned: true;
    contentPlanSet: boolean;
    startConceptsLoaded: boolean;
    tiktokHandleConfirmed: boolean;
    firstPublication: boolean;
  };
  onboardingState: OnboardingState;
  blockedDays: number;
  bufferStatus: CustomerBufferStatus;
  activeSnooze:
    | CustomerOperationalInput['attention_snoozes'][number]
    | undefined;
};

export function deriveCustomerOperationalSignals(
  customer: CustomerOperationalInput,
  today = new Date(),
): DerivedCustomerOperationalSignals {
  const blocking = customerBlocking({
    lastPublishedAt: customer.last_published_at ? new Date(customer.last_published_at) : null,
    activatedAt:
      customer.agreed_at || customer.created_at
        ? new Date(customer.agreed_at || customer.created_at)
        : null,
    isLive:
      customer.status === 'active' ||
      customer.status === 'agreed' ||
      customer.onboarding_state === 'live' ||
      customer.onboarding_state === 'settled',
    pausedUntil: customer.paused_until ? new Date(customer.paused_until) : null,
    today,
  });

  const onboardingChecklist = {
    contractSigned: true as const,
    contentPlanSet: (customer.expected_concepts_per_week ?? customer.concepts_per_week ?? 2) >= 1,
    startConceptsLoaded: Boolean(customer.latest_planned_publish_date),
    tiktokHandleConfirmed: Boolean(customer.tiktok_handle),
    firstPublication: Boolean(customer.last_published_at),
  };

  const onboardingState = settleIfDue(
    customer.onboarding_state ?? deriveOnboardingState(onboardingChecklist),
    customer.last_published_at ? new Date(customer.last_published_at) : null,
    today,
  );

  const blockedDays =
    blocking.daysSincePublish === 999 ? 999 : Math.max(0, blocking.daysSincePublish);

  const bufferStatus = customerBufferStatus(
    {
      pace: (customer.expected_concepts_per_week ?? customer.concepts_per_week ?? 2) as
        | 1
        | 2
        | 3
        | 4
        | 5,
      latestPlannedPublishDate: customer.latest_planned_publish_date
        ? new Date(customer.latest_planned_publish_date)
        : null,
      pausedUntil: customer.paused_until ? new Date(customer.paused_until) : null,
      today,
    },
    blockedDays,
  );

  const activeSnooze = customer.attention_snoozes.find((snooze) => {
    if (snooze.released_at) return false;
    if (!snooze.snoozed_until) return true;
    return new Date(snooze.snoozed_until) > today;
  });

  return {
    blocking,
    visibleBlockingDays: blockingDisplayDays(blocking),
    onboardingChecklist,
    onboardingState,
    blockedDays,
    bufferStatus,
    activeSnooze,
  };
}

export type { CustomerBufferStatus, BlockingState, OnboardingState };
