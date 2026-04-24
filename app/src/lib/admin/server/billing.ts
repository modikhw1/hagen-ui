import 'server-only';

import { unstable_cache } from 'next/cache';
import type {
  BillingInvoiceStatusFilter,
  BillingSubscriptionStatusFilter,
  EnvFilter,
} from '@/lib/admin/billing';
import { resolveConcreteBillingEnv } from '@/lib/admin/billing';
import {
  billingHealthTag,
  billingInvoicesTag,
  billingSubscriptionsTag,
} from '@/lib/admin/cache-tags';
import { listAdminInvoices, listAdminSubscriptions } from '@/lib/admin/billing-list.server';
import { getBillingHealthSnapshot } from '@/lib/admin/billing-service';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { getStripeEnvironment } from '@/lib/stripe/environment';

type BillingInvoicesServerParams = {
  env: EnvFilter;
  status: BillingInvoiceStatusFilter;
  page: number;
  limit: number;
};

type BillingSubscriptionsServerParams = {
  env: EnvFilter;
  status: BillingSubscriptionStatusFilter;
  page: number;
  limit: number;
};

export async function fetchAdminInvoicesServer(params: BillingInvoicesServerParams) {
  const cacheKey = JSON.stringify(params);

  return unstable_cache(
    async () => {
      const result = await listAdminInvoices({
        supabaseAdmin: createSupabaseAdmin(),
        filters: {
          limit: params.limit,
          page: params.page,
          status: params.status,
          environment: params.env === 'all' ? undefined : params.env,
          includeLineItems: false,
        },
      });

      return {
        invoices: result.invoices,
        pagination: result.pagination,
        summary: result.summary,
        environment: params.env,
      };
    },
    ['admin-billing-invoices', cacheKey],
    {
      revalidate: 30,
      tags: [billingInvoicesTag(params.env)],
    },
  )();
}

export async function fetchAdminSubscriptionsServer(
  params: BillingSubscriptionsServerParams,
) {
  const cacheKey = JSON.stringify(params);

  return unstable_cache(
    async () => {
      const result = await listAdminSubscriptions({
        supabaseAdmin: createSupabaseAdmin(),
        filters: {
          limit: params.limit,
          page: params.page,
          status: params.status,
          environment: params.env === 'all' ? undefined : params.env,
        },
      });

      return {
        subscriptions: result.subscriptions,
        pagination: result.pagination,
        summary: result.summary,
        environment: params.env,
      };
    },
    ['admin-billing-subscriptions', cacheKey],
    {
      revalidate: 30,
      tags: [billingSubscriptionsTag(params.env)],
    },
  )();
}

export async function fetchAdminBillingHealthServer(env: EnvFilter) {
  return unstable_cache(
    async () =>
      getBillingHealthSnapshot({
        supabaseAdmin: createSupabaseAdmin(),
        environment: resolveConcreteBillingEnv(env, getStripeEnvironment()),
      }),
    ['admin-billing-health', env],
    {
      revalidate: 30,
      tags: [billingHealthTag(env)],
    },
  )();
}
