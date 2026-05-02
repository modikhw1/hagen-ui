import 'server-only';

import { revalidateTag } from 'next/cache';

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

export function revalidateAdminOverviewViews() {
  revalidateTag(ADMIN_OVERVIEW_TAG, 'max');
  revalidateTag(ADMIN_OVERVIEW_METRICS_TAG, 'max');
  revalidateTag(ADMIN_OVERVIEW_ATTENTION_TAG, 'max');
  revalidateTag(ADMIN_OVERVIEW_CM_PULSE_TAG, 'max');
  revalidateTag(ADMIN_OVERVIEW_COSTS_TAG, 'max');
}

export function revalidateAdminCustomerViews(id: string) {
  revalidateTag(ADMIN_CUSTOMERS_LIST_TAG, 'max');
  revalidateTag(adminCustomerTag(id), 'max');
  revalidateTag(adminCustomerBillingTag(id), 'max');
  revalidateTag(adminCustomerSubscriptionTag(id), 'max');
  revalidateTag('admin:customer:detail', 'max');
  revalidateTag('admin:customer:billing', 'max');
  revalidateTag('admin:customer:pulse', 'max');
  revalidateAdminOverviewViews();
}

export function revalidateAdminBillingViews() {
  for (const env of ['all', 'test', 'live'] as const) {
    revalidateTag(billingInvoicesTag(env), 'max');
    revalidateTag(billingSubscriptionsTag(env), 'max');
    revalidateTag(billingHealthTag(env), 'max');
  }

  revalidateAdminOverviewViews();
}

export function revalidateAdminTeamViews() {
  revalidateTag(ADMIN_TEAM_TAG, 'max');
  revalidateAdminOverviewViews();
}
