import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingColumnError, isMissingRelationError } from '@/lib/admin/schema-guards';

type SubscriptionSyncSource = {
  id: string;
  stripe_subscription_id: string | null;
  paused_until: string | null;
  monthly_price: number | null;
  upcoming_monthly_price: number | null;
  upcoming_price_effective_date: string | null;
};

export async function syncOperationalSubscriptionState(params: {
  supabaseAdmin: SupabaseClient;
  customerProfileId: string;
  profile?: SubscriptionSyncSource | null;
}) {
  const profile = params.profile ?? (await readCustomerProfile(params.supabaseAdmin, params.customerProfileId));
  if (!profile) return { status: 'missing_customer' as const };

  const payload = {
    pause_until: profile.paused_until,
    scheduled_price_change: buildScheduledPriceChange(profile),
  };

  const result = await (((params.supabaseAdmin.from('subscriptions' as never) as never) as {
    update: (value: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error: { message?: string } | null }>;
    };
  }).update(payload)).eq('customer_profile_id', params.customerProfileId);

  if (result.error) {
    if (isMissingRelationError(result.error.message) || isMissingColumnError(result.error.message)) {
      return { status: 'skipped_missing_schema' as const };
    }

    throw new Error(result.error.message || 'Kunde inte synca subscriptions-spegeln');
  }

  return { status: 'synced' as const };
}

export function buildScheduledPriceChange(profile: Pick<
  SubscriptionSyncSource,
  'monthly_price' | 'upcoming_monthly_price' | 'upcoming_price_effective_date'
>) {
  if (!profile.upcoming_monthly_price || !profile.upcoming_price_effective_date) {
    return null;
  }

  return {
    current_monthly_price: Number(profile.monthly_price) || 0,
    next_monthly_price: Number(profile.upcoming_monthly_price) || 0,
    effective_date: profile.upcoming_price_effective_date,
  };
}

async function readCustomerProfile(
  supabaseAdmin: SupabaseClient,
  customerProfileId: string,
): Promise<SubscriptionSyncSource | null> {
  const { data, error } = await supabaseAdmin
    .from('customer_profiles')
    .select(
      'id, stripe_subscription_id, paused_until, monthly_price, upcoming_monthly_price, upcoming_price_effective_date',
    )
    .eq('id', customerProfileId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as SubscriptionSyncSource | null;
}

