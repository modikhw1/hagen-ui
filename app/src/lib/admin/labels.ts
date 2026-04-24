import { OPERATOR_COPY } from './copy/operator-glossary';
import { shortDateSv } from './time';

type StatusConfig = {
  label: string;
  className: string;
  tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
};

type SubscriptionStatusInput =
  | string
  | {
      status: string;
      cancel_at_period_end?: boolean;
      paused?: boolean;
    };

export const customerStatusConfig = (status: string): StatusConfig => {
  switch (status) {
    case 'active':
    case 'agreed':
      return { label: 'Aktiv', className: 'bg-status-success-bg text-status-success-fg', tone: 'success' };
    case 'invited':
      return { label: 'Inbjuden', className: 'bg-status-info-bg text-status-info-fg', tone: 'info' };
    case 'pending_payment':
    case 'pending_invoice':
      return { label: 'Väntar på betalning', className: 'bg-status-warning-bg text-status-warning-fg', tone: 'warning' };
    case 'pending':
      return { label: 'Väntande', className: 'bg-status-warning-bg text-status-warning-fg', tone: 'warning' };
    case 'paused':
      return { label: 'Pausad', className: 'bg-status-warning-bg text-status-warning-fg', tone: 'warning' };
    case 'past_due':
      return { label: 'Förfallen', className: 'bg-status-danger-bg text-status-danger-fg', tone: 'danger' };
    case 'canceled':
    case 'cancelled':
      return { label: 'Avslutad', className: 'bg-status-neutral-bg text-status-neutral-fg', tone: 'neutral' };
    case 'archived':
      return { label: 'Arkiverad', className: 'bg-status-neutral-bg text-status-neutral-fg', tone: 'neutral' };
    default:
      return { label: status, className: 'bg-status-neutral-bg text-status-neutral-fg', tone: 'neutral' };
  }
};

export const customerStatusLabel = (status: string) => customerStatusConfig(status).label;

export const invoiceStatusConfig = (status: string): StatusConfig => {
  switch (status) {
    case 'paid':
      return { label: 'Betald', className: 'bg-status-success-bg text-status-success-fg', tone: 'success' };
    case 'partially_refunded':
      return { label: 'Delvis krediterad', className: 'bg-status-info-bg text-status-info-fg', tone: 'info' };
    case 'refunded':
      return { label: 'Återbetald', className: 'bg-status-neutral-bg text-status-neutral-fg', tone: 'neutral' };
    case 'open':
      return { label: 'Obetald', className: 'bg-status-warning-bg text-status-warning-fg', tone: 'warning' };
    case 'void':
      return { label: 'Annullerad', className: 'bg-status-neutral-bg text-status-neutral-fg', tone: 'neutral' };
    case 'draft':
      return { label: 'Utkast', className: 'bg-status-info-bg text-status-info-fg', tone: 'info' };
    case 'uncollectible':
      return { label: 'Oindrivbar', className: 'bg-status-danger-bg text-status-danger-fg', tone: 'danger' };
    default:
      return { label: status, className: 'bg-status-neutral-bg text-status-neutral-fg', tone: 'neutral' };
  }
};

export const invoiceStatusLabel = (status: string) => invoiceStatusConfig(status).label;

export const subscriptionStatusConfig = (
  input: SubscriptionStatusInput,
): StatusConfig => {
  const status = typeof input === 'string' ? input : input.status;
  const cancelAtPeriodEnd =
    typeof input === 'string' ? false : Boolean(input.cancel_at_period_end);
  const paused = typeof input === 'string' ? false : Boolean(input.paused);

  if (cancelAtPeriodEnd) {
    return { label: 'Avslutas', className: 'bg-status-warning-bg text-status-warning-fg', tone: 'warning' };
  }
  if (paused || status === 'paused') {
    return { label: 'Pausad', className: 'bg-status-warning-bg text-status-warning-fg', tone: 'warning' };
  }

  switch (status) {
    case 'active':
      return { label: 'Aktiv', className: 'bg-status-success-bg text-status-success-fg', tone: 'success' };
    case 'trialing':
      return { label: 'Provperiod', className: 'bg-status-info-bg text-status-info-fg', tone: 'info' };
    case 'past_due':
      return { label: 'Förfallen', className: 'bg-status-danger-bg text-status-danger-fg', tone: 'danger' };
    case 'canceled':
    case 'cancelled':
      return { label: 'Avslutad', className: 'bg-status-neutral-bg text-status-neutral-fg', tone: 'neutral' };
    case 'incomplete':
      return { label: 'Ofullständig', className: 'bg-status-warning-bg text-status-warning-fg', tone: 'warning' };
    default:
      return { label: status, className: 'bg-status-neutral-bg text-status-neutral-fg', tone: 'neutral' };
  }
};

export const subscriptionStatusLabel = (status: string) =>
  subscriptionStatusConfig(status).label;

export function subscriptionStatusRich(sub: {
  status: string;
  cancel_at_period_end: boolean;
  current_period_end?: string | null;
  ended_at?: string | null;
  created?: string | null;
}) {
  const { status, cancel_at_period_end, current_period_end, created } = sub;

  if (status === 'active' && !cancel_at_period_end) return 'Aktiv';
  if (status === 'active' && cancel_at_period_end) {
    return `Aktiv · slutar ${current_period_end ? shortDateSv(current_period_end) : 'snart'}`;
  }
  if (status === 'trialing') {
    return `Provperiod till ${current_period_end ? shortDateSv(current_period_end) : '—'}`;
  }
  if (status === 'past_due') {
    if (created) {
      const days = Math.floor((Date.now() - new Date(created).getTime()) / (1000 * 60 * 60 * 24));
      return `Förfallet · ${days}d`;
    }
    return 'Förfallet';
  }
  if (status === 'canceled' || status === 'cancelled') return 'Avslutat';
  if (status === 'incomplete') return 'Ofullständig';
  
  return status;
}

export function onboardingLabel(state: keyof typeof OPERATOR_COPY.onboarding) {
  return OPERATOR_COPY.onboarding[state].label;
}

export function onboardingTone(state: keyof typeof OPERATOR_COPY.onboarding) {
  return OPERATOR_COPY.onboarding[state].tone;
}

export function bufferLabel(state: keyof typeof OPERATOR_COPY.contentQueue) {
  return OPERATOR_COPY.contentQueue[state].label;
}

export function contentQueueLabel(state: keyof typeof OPERATOR_COPY.contentQueue) {
  return OPERATOR_COPY.contentQueue[state].label;
}

export function contentQueueTone(state: keyof typeof OPERATOR_COPY.contentQueue) {
  return OPERATOR_COPY.contentQueue[state].tone;
}

export function bufferTone(state: keyof typeof OPERATOR_COPY.contentQueue) {
  return OPERATOR_COPY.contentQueue[state].tone;
}

export function cmStatusLabel(status: keyof typeof OPERATOR_COPY.cmStatus) {
  return OPERATOR_COPY.cmStatus[status].label;
}

export function cmStatusTone(status: keyof typeof OPERATOR_COPY.cmStatus) {
  return OPERATOR_COPY.cmStatus[status].tone;
}

export function blockingLabel(state: 'none' | 'blocked' | 'escalated') {
  return state === 'escalated' ? 'Eskalerad' : 'Blockerad';
}

export const intervalLabel = (interval: string) =>
  interval === 'month'
    ? '/mån'
    : interval === 'quarter'
      ? '/kvartal'
      : interval === 'year'
        ? '/år'
        : '';

export const intervalLong = (interval: string) =>
  interval === 'month'
    ? 'Månadsvis'
    : interval === 'quarter'
      ? 'Kvartalsvis'
      : interval === 'year'
        ? 'Årsvis'
        : interval;
