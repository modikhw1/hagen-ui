/**
 * Centralized manager for onboarding localStorage keys.
 *
 * Every page that reads/writes onboarding state should go through this
 * module so that key names, clear logic, and fallbacks stay in one place.
 */

const KEYS = {
  email: 'pending_agreement_email',
  businessName: 'onboarding_business_name',
  interval: 'onboarding_interval',
  profileId: 'onboarding_customer_profile_id',
  price: 'onboarding_price',
  data: 'onboarding_data',
  scopeItems: 'onboarding_scope_items',
  invoiceText: 'onboarding_invoice_text',
  firstInvoiceBehavior: 'onboarding_first_invoice_behavior',
  contractStartDate: 'onboarding_contract_start_date',
  billingDayOfMonth: 'onboarding_billing_day_of_month',
  agreementAccepted: 'agreement_accepted',
  agreementSubscriptionId: 'agreement_subscription_id',
  agreementAcceptedTime: 'agreement_accepted_time',
  fromOnboarding: 'from_onboarding',
} as const;

export type OnboardingKeys = typeof KEYS;

export interface OnboardingSession {
  email?: string;
  businessName?: string;
  interval?: string;
  profileId?: string;
  price?: number;
  scopeItems?: string[];
  invoiceText?: string;
  firstInvoiceBehavior?: string;
  contractStartDate?: string;
  billingDayOfMonth?: number;
}

function isBrowser() {
  return typeof window !== 'undefined';
}

/** Read the current onboarding session from localStorage. */
export function loadOnboardingSession(): OnboardingSession | null {
  if (!isBrowser()) return null;

  const profileId = localStorage.getItem(KEYS.profileId);
  if (!profileId) return null;

  let scopeItems: string[] = [];
  try {
    const raw = localStorage.getItem(KEYS.scopeItems);
    if (raw) scopeItems = JSON.parse(raw);
  } catch { /* ignore */ }

  return {
    email: localStorage.getItem(KEYS.email) || undefined,
    businessName: localStorage.getItem(KEYS.businessName) || undefined,
    interval: localStorage.getItem(KEYS.interval) || undefined,
    profileId,
    price: Number(localStorage.getItem(KEYS.price)) || undefined,
    scopeItems,
    invoiceText: localStorage.getItem(KEYS.invoiceText) || undefined,
    firstInvoiceBehavior: localStorage.getItem(KEYS.firstInvoiceBehavior) || undefined,
    contractStartDate: localStorage.getItem(KEYS.contractStartDate) || undefined,
    billingDayOfMonth: Number(localStorage.getItem(KEYS.billingDayOfMonth)) || undefined,
  };
}

/** Write onboarding session data (merges with existing). */
export function saveOnboardingSession(data: OnboardingSession): void {
  if (!isBrowser()) return;

  if (data.email) localStorage.setItem(KEYS.email, data.email);
  if (data.businessName) localStorage.setItem(KEYS.businessName, data.businessName);
  if (data.interval) localStorage.setItem(KEYS.interval, data.interval);
  if (data.profileId) localStorage.setItem(KEYS.profileId, data.profileId);
  if (data.price != null) localStorage.setItem(KEYS.price, String(data.price));
  if (data.scopeItems) localStorage.setItem(KEYS.scopeItems, JSON.stringify(data.scopeItems));
  if (data.invoiceText) localStorage.setItem(KEYS.invoiceText, data.invoiceText);
  if (data.firstInvoiceBehavior) localStorage.setItem(KEYS.firstInvoiceBehavior, data.firstInvoiceBehavior);
  if (data.contractStartDate) localStorage.setItem(KEYS.contractStartDate, data.contractStartDate);
  if (data.billingDayOfMonth != null) localStorage.setItem(KEYS.billingDayOfMonth, String(data.billingDayOfMonth));
}

/** Clear all onboarding + agreement localStorage keys. */
export function clearOnboardingSession(): void {
  if (!isBrowser()) return;

  for (const key of Object.values(KEYS)) {
    localStorage.removeItem(key);
  }
}

/** Get the onboarding customer profile ID (most commonly needed single value). */
export function getOnboardingProfileId(): string | null {
  if (!isBrowser()) return null;
  return localStorage.getItem(KEYS.profileId);
}
