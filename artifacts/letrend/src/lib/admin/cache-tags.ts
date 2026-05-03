export const ADMIN_CUSTOMERS_LIST_TAG = 'admin:customers:list';
export const ADMIN_OVERVIEW_TAG = 'admin:overview';
export const ADMIN_OVERVIEW_METRICS_TAG = 'admin:overview:metrics';
export const ADMIN_OVERVIEW_ATTENTION_TAG = 'admin:overview:attention';
export const ADMIN_OVERVIEW_CM_PULSE_TAG = 'admin:overview:cm-pulse';
export const ADMIN_OVERVIEW_COSTS_TAG = 'admin:overview:costs';
export const ADMIN_TEAM_TAG = 'admin:team';

export function adminCustomerTag(id: string) {
  return `admin:customer:${id}`;
}

export function adminCustomerBillingTag(id: string) {
  return `${adminCustomerTag(id)}:billing`;
}

export function adminCustomerSubscriptionTag(id: string) {
  return `${adminCustomerTag(id)}:subscription`;
}

export function billingInvoicesTag(env: 'all' | 'test' | 'live') {
  return `admin:billing:invoices:${env}`;
}

export function billingSubscriptionsTag(env: 'all' | 'test' | 'live') {
  return `admin:billing:subscriptions:${env}`;
}

export function billingHealthTag(env: 'all' | 'test' | 'live' = 'all') {
  return `admin:billing:health:${env}`;
}

export function revalidateAdminOverviewViews() {}
export function revalidateAdminCustomerViews(_id: string) {}
export function revalidateAdminBillingViews() {}
export function revalidateAdminTeamViews() {}
