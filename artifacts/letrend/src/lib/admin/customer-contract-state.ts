export type CustomerContractState =
  | 'onboarding_no_price'
  | 'onboarding_priced'
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused'
  | 'cancelled'
  | 'no_billing_env';

export interface CustomerContractStateInput {
  pricing_status: string | null | undefined;
  monthly_price_ore: number | null | undefined;
  subscription_status: string | null | undefined;
  stripe_customer_id: string | null | undefined;
  stripe_subscription_id: string | null | undefined;
  environment_warning?: { message: string } | null;
}

export function deriveCustomerContractState(
  input: CustomerContractStateInput,
): CustomerContractState {
  if (input.environment_warning) return 'no_billing_env';

  const sub = (input.subscription_status ?? '').toLowerCase();
  if (sub === 'paused') return 'paused';
  if (sub === 'canceled' || sub === 'cancelled') return 'cancelled';
  if (sub === 'trialing') return 'trialing';
  if (sub === 'past_due') return 'past_due';
  if (sub === 'unpaid') return 'unpaid';
  if (sub === 'incomplete') return 'incomplete';
  if (sub === 'incomplete_expired') return 'incomplete_expired';

  const hasSubscription = Boolean(input.stripe_subscription_id);
  if (hasSubscription) return 'active';

  const priceSet =
    (input.pricing_status ?? '') === 'fixed' && (input.monthly_price_ore ?? 0) > 0;
  return priceSet ? 'onboarding_priced' : 'onboarding_no_price';
}

export function describeContractState(state: CustomerContractState): {
  label: string;
  tone: 'gray' | 'blue' | 'orange' | 'red' | 'yellow';
} {
  switch (state) {
    case 'onboarding_no_price':
      return { label: 'Onboarding – pris ej satt', tone: 'yellow' };
    case 'onboarding_priced':
      return { label: 'Onboarding – väntar aktivering', tone: 'blue' };
    case 'active':
      return { label: 'Aktivt', tone: 'blue' };
    case 'trialing':
      return { label: 'Provperiod', tone: 'blue' };
    case 'past_due':
      return { label: 'Förfallen betalning', tone: 'orange' };
    case 'unpaid':
      return { label: 'Obetald', tone: 'red' };
    case 'incomplete':
      return { label: 'Ofullständig (väntar betalning)', tone: 'yellow' };
    case 'incomplete_expired':
      return { label: 'Ofullständig (löpt ut)', tone: 'red' };
    case 'paused':
      return { label: 'Pausat', tone: 'orange' };
    case 'cancelled':
      return { label: 'Avslutat', tone: 'gray' };
    case 'no_billing_env':
      return { label: 'Ingen billing-miljö', tone: 'red' };
  }
}
