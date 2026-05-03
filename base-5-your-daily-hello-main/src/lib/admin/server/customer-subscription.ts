// app/src/lib/admin/server/customer-subscription.ts
import 'server-only';

import { unstable_cache } from 'next/cache';
import {
  customerDetailPayloadSchema,
  type CustomerDetail,
} from '@/lib/admin/dtos/customer';
import {
  customerSubscriptionPayloadSchema,
  type CustomerSubscription,
} from '@/lib/admin/dtos/billing';
import {
  adminCustomerBillingTag,
  adminCustomerSubscriptionTag,
  adminCustomerTag,
} from '@/lib/admin/cache-tags';
import { loadCustomerDetail } from '@/lib/admin/customer-detail/load';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export async function fetchCustomerDetailServer(id: string): Promise<CustomerDetail> {
  return unstable_cache(
    async () => {
      const payload = await loadCustomerDetail({
        supabaseAdmin: createSupabaseAdmin(),
        id,
        user: { id: 'admin-rsc', is_admin: true, role: 'admin' },
      });
      return customerDetailPayloadSchema.parse(payload).customer;
    },
    ['admin-customer-detail-rsc-v2', id],
    { revalidate: 30, tags: [adminCustomerTag(id)] },
  )();
}

export async function fetchCustomerSubscriptionServer(
  id: string,
  stripeSubscriptionId: string | null,
): Promise<CustomerSubscription | null> {
  if (!stripeSubscriptionId) return null;

  // Cache-key inkluderar INTE stripeSubscriptionId — det är inte sökkriterium
  // utan en filter (vi tar senaste raden för kunden + sub-id ändå). Tag-driven
  // invalidation hanterar bytet.
  return unstable_cache(
    async () => {
      const supabaseAdmin = createSupabaseAdmin();
      const { data: subscription, error } = await supabaseAdmin
        .from('subscriptions')
        .select(
          'stripe_subscription_id, status, cancel_at_period_end, current_period_end, current_period_start, created',
        )
        .eq('customer_profile_id', id)
        .eq('stripe_subscription_id', stripeSubscriptionId)
        .order('created', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw new Error(error.message || 'Kunde inte ladda abonnemanget');
      if (!subscription) return null;

      return customerSubscriptionPayloadSchema.parse({
        subscription: {
          stripe_subscription_id: subscription.stripe_subscription_id,
          status: subscription.status ?? '',
          cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
          current_period_end: subscription.current_period_end,
          current_period_start: subscription.current_period_start,
        },
      }).subscription;
    },
    ['admin-customer-subscription-rsc-v2', id],
    {
      revalidate: 30,
      tags: [
        adminCustomerTag(id),
        adminCustomerBillingTag(id),
        adminCustomerSubscriptionTag(id),
      ],
    },
  )();
}

// NEW: helper som kallas från RSC subscription-page för att hämta båda parallellt
export async function fetchCustomerWithSubscription(id: string) {
  const customer = await fetchCustomerDetailServer(id);
  const subscription = await fetchCustomerSubscriptionServer(
    id,
    customer.stripe_subscription_id,
  );
  return { customer, subscription };
}