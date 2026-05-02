// lib/admin-derive/customer-alert.ts
import { deriveCustomerOperationalSignals } from './index';
import type { CustomerDetail } from '@/lib/admin/dtos/customer';

export type CustomerHeaderAlert = {
  label: string;
  href: string;
  tone: 'warning' | 'danger';
};

export function deriveCustomerHeaderAlert(
  customer: CustomerDetail,
  today = new Date()
): CustomerHeaderAlert | null {
  const signals = deriveCustomerOperationalSignals(customer, today);
  const { blocking, onboardingState, activeSnooze } = signals;

  // 1. escalated blocking
  if (blocking.state === 'escalated' && !activeSnooze) {
    return {
      label: 'Eskalerad blockering',
      href: `#studio`,
      tone: 'danger',
    };
  }

  // 2. customer_blocked >= 3 days
  if (blocking.state === 'blocked' && (blocking.daysSincePublish ?? 0) >= 3 && !activeSnooze) {
    return {
      label: `Väntat på kunden i ${blocking.daysSincePublish} dagar`,
      href: `#studio`,
      tone: 'warning',
    };
  }

  // 3. invoice_unpaid (>0 days past due)
  // Vi antar att vi har info om förfallna fakturor i customer-objektet eller så kollar vi status
  if (customer.status === 'past_due' && !activeSnooze) {
     return {
       label: 'Obetald faktura',
       href: `/admin/customers/${customer.id}/billing`,
       tone: 'danger',
     };
  }

  // 4. onboarding_stuck
  // (Förenklad logik här, kan utökas baserat på onboardingState och dagar)
  if (onboardingState === 'cm_ready' && !activeSnooze) {
     return {
       label: 'Onboarding har fastnat',
       href: `/admin/customers/${customer.id}`,
       tone: 'warning',
     };
  }

  // 5. pause_resume_due_today
  // (Kolla om paused_until är idag)
  if (customer.paused_until) {
    const pauseDate = new Date(customer.paused_until);
    if (pauseDate.toDateString() === today.toDateString()) {
      return {
        label: 'Paus slutar idag',
        href: `/admin/customers/${customer.id}/operations`,
        tone: 'warning',
      };
    }
  }

  return null;
}
