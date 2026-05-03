import {
  billingInvoiceStatuses,
  billingSubscriptionStatuses,
  isEnvFilter,
  type BillingInvoiceStatusFilter,
  type BillingSubscriptionStatusFilter,
  type EnvFilter,
} from '@/lib/admin/billing';

type SearchParamsInput = Record<string, string | string[] | undefined>;

export const BILLING_QUERY_PARAM_INVOICE_STATUS = 'invoiceStatus';
export const BILLING_QUERY_PARAM_SUBSCRIPTION_STATUS = 'subscriptionStatus';
export const BILLING_QUERY_PARAM_LEGACY_STATUS = 'status';

function getStringValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseBillingSearchParams(searchParams: SearchParamsInput) {
  const envParam = getStringValue(searchParams.env);
  const invoiceStatusParam =
    getStringValue(searchParams[BILLING_QUERY_PARAM_INVOICE_STATUS]) ??
    getStringValue(searchParams[BILLING_QUERY_PARAM_LEGACY_STATUS]);
  const subscriptionStatusParam =
    getStringValue(searchParams[BILLING_QUERY_PARAM_SUBSCRIPTION_STATUS]) ??
    getStringValue(searchParams[BILLING_QUERY_PARAM_LEGACY_STATUS]);
  const pageParam = getStringValue(searchParams.page);

  return {
    env: isEnvFilter(envParam) ? envParam : 'all',
    invoiceStatus: (
      billingInvoiceStatuses as readonly string[]
    ).includes(invoiceStatusParam ?? '')
      ? (invoiceStatusParam as BillingInvoiceStatusFilter)
      : 'all',
    subscriptionStatus: (
      billingSubscriptionStatuses as readonly string[]
    ).includes(subscriptionStatusParam ?? '')
      ? (subscriptionStatusParam as BillingSubscriptionStatusFilter)
      : 'active',
    page: parsePositiveInt(pageParam, 1),
  } satisfies {
    env: EnvFilter;
    invoiceStatus: BillingInvoiceStatusFilter;
    subscriptionStatus: BillingSubscriptionStatusFilter;
    page: number;
  };
}
