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
        user: {
          id: 'admin-rsc',
          is_admin: true,
          role: 'admin',
        },
      });

      return customerDetailPayloadSchema.parse(payload).customer;
    },
    ['admin-customer-detail-rsc', id],
    {
      revalidate: 60,
      tags: [adminCustomerTag(id)],
    },
  )();
}

export async function fetchCustomerSubscriptionServer(
  id: string,
  stripeSubscriptionId: string | null,
): Promise<CustomerSubscription | null> {
  return unstable_cache(
    async () => {
      if (!stripeSubscriptionId) {
        return null;
      }

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

      if (error) {
        throw new Error(error.message || 'Kunde inte ladda abonnemanget');
      }

      return customerSubscriptionPayloadSchema.parse({
        subscription: subscription
          ? {
              stripe_subscription_id: subscription.stripe_subscription_id,
              status: subscription.status ?? '',
              cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
              current_period_end: subscription.current_period_end,
              current_period_start: subscription.current_period_start,
            }
          : null,
      }).subscription;
    },
    ['admin-customer-subscription-rsc', id, stripeSubscriptionId ?? 'none'],
    {
      revalidate: 60,
      tags: [
        adminCustomerTag(id),
        adminCustomerBillingTag(id),
        adminCustomerSubscriptionTag(id),
      ],
    },
  )();
}
