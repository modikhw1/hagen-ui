import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import type { CustomerInvitePayload } from '@/lib/schemas/customer';

interface ExistingProfileStripeState {
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

interface ExistingAuthUser {
  id: string;
  email: string | null;
  email_confirmed_at: string | null;
}

export type SendInviteResult =
  | {
      ok: true;
      profile: Record<string, unknown>;
      stripeCustomerId: string | null;
      stripeSubscriptionId: string | null;
    }
  | {
      ok: false;
      status: number;
      error: string;
      already_registered?: boolean;
      user_id?: string;
      stripe_error?: boolean;
    };

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizePricingStatus(value: string | undefined) {
  return value === 'unknown' ? 'unknown' : 'fixed';
}

function normalizeBillingDay(value: number | undefined) {
  return Math.max(1, Math.min(28, Number(value) || 25));
}

async function findExistingUserByEmail(
  supabaseAdmin: SupabaseClient,
  email: string
): Promise<ExistingAuthUser | null> {
  const normalizedTarget = normalizeEmail(email);
  const maxPages = 10;
  const perPage = 200;

  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users || [];
    if (users.length === 0) break;

    const match = users.find((candidate) => normalizeEmail(candidate.email || '') === normalizedTarget);
    if (match) {
      return {
        id: match.id,
        email: match.email || null,
        email_confirmed_at: match.email_confirmed_at || null,
      };
    }

    if (users.length < perPage) break;
  }

  return null;
}

async function createSubscriptionForCustomer(
  stripeClient: Stripe,
  customerId: string,
  profileId: string,
  payload: CustomerInvitePayload
) {
  const subscriptionInterval = payload.subscription_interval || 'month';
  const stripeInterval: 'day' | 'week' | 'month' | 'year' =
    subscriptionInterval === 'quarter'
      ? 'month'
      : (subscriptionInterval === 'year' ? 'year' : 'month');
  const intervalCount = subscriptionInterval === 'quarter' ? 3 : 1;
  const intervalText = subscriptionInterval === 'month'
    ? 'månadsvis'
    : subscriptionInterval === 'quarter'
      ? 'kvartalsvis'
      : 'årligen';

  const product = await stripeClient.products.create({
    name: 'LeTrend Prenumeration',
    description: payload.invoice_text || `${payload.business_name} - ${intervalText}`,
    tax_code: 'txcd_10000000',
    metadata: {
      scope_items: JSON.stringify(payload.scope_items || []),
      invoice_text: payload.invoice_text || '',
      contract_start_date: payload.contract_start_date || '',
      billing_day_of_month: String(normalizeBillingDay(payload.billing_day_of_month)),
      first_invoice_behavior: payload.first_invoice_behavior || 'prorated',
      upcoming_monthly_price: String(payload.upcoming_monthly_price || ''),
      upcoming_price_effective_date: payload.upcoming_price_effective_date || '',
    },
  });

  const price = await stripeClient.prices.create({
    unit_amount: Math.round((payload.monthly_price || 0) * 100),
    currency: 'sek',
    tax_behavior: 'exclusive',
    recurring: {
      interval: stripeInterval,
      interval_count: intervalCount,
    },
    product: product.id,
  });

  const subscription = await stripeClient.subscriptions.create({
    customer: customerId,
    items: [{ price: price.id }],
    collection_method: 'send_invoice',
    days_until_due: 14,
    automatic_tax: { enabled: true },
    metadata: {
      customer_profile_id: profileId,
      scope_items: JSON.stringify(payload.scope_items || []),
      invoice_text: payload.invoice_text || '',
      pricing_status: normalizePricingStatus(payload.pricing_status),
      contract_start_date: payload.contract_start_date || '',
      billing_day_of_month: String(normalizeBillingDay(payload.billing_day_of_month)),
      first_invoice_behavior: payload.first_invoice_behavior || 'prorated',
      upcoming_monthly_price: String(payload.upcoming_monthly_price || ''),
      upcoming_price_effective_date: payload.upcoming_price_effective_date || '',
    },
  });

  return subscription.id;
}

export async function sendCustomerInvite(params: {
  supabaseAdmin: SupabaseClient;
  stripeClient: Stripe | null;
  profileId: string;
  payload: CustomerInvitePayload;
  appUrl: string;
}): Promise<SendInviteResult> {
  const { supabaseAdmin, stripeClient, profileId, payload, appUrl } = params;
  const pricingStatus = normalizePricingStatus(payload.pricing_status);
  const monthlyPrice = Number(payload.monthly_price) || 0;

  const existingAuthUser = await findExistingUserByEmail(supabaseAdmin, payload.contact_email);
  if (existingAuthUser?.email_confirmed_at) {
    return {
      ok: false,
      status: 409,
      error: 'Användaren har redan ett verifierat konto. Länka profilen manuellt.',
      already_registered: true,
      user_id: existingAuthUser.id,
    };
  }

  const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
    .from('customer_profiles')
    .select('stripe_customer_id, stripe_subscription_id')
    .eq('id', profileId)
    .single<ExistingProfileStripeState>();

  if (existingProfileError) {
    return {
      ok: false,
      status: 404,
      error: existingProfileError.message,
    };
  }

  let stripeCustomerId = existingProfile?.stripe_customer_id || null;
  let stripeSubscriptionId = existingProfile?.stripe_subscription_id || null;
  let createdStripeCustomerId: string | null = null;

  try {
    if (stripeClient && pricingStatus === 'fixed' && monthlyPrice > 0) {
      if (!stripeCustomerId) {
        const customer = await stripeClient.customers.create({
          email: payload.contact_email,
          name: payload.business_name,
          address: {
            country: 'SE',
          },
          preferred_locales: ['sv'],
          metadata: {
            customer_profile_id: profileId,
            pricing_status: pricingStatus,
          },
        });
        stripeCustomerId = customer.id;
        createdStripeCustomerId = customer.id;
      }

      if (stripeCustomerId && !stripeSubscriptionId) {
        stripeSubscriptionId = await createSubscriptionForCustomer(
          stripeClient,
          stripeCustomerId,
          profileId,
          payload
        );
      }
    }
  } catch (stripeError) {
    if (stripeClient && createdStripeCustomerId && !stripeSubscriptionId) {
      try {
        await stripeClient.customers.del(createdStripeCustomerId);
      } catch {
        // Ignore cleanup failure - original Stripe error should be returned.
      }
    }

    const msg = stripeError instanceof Error ? stripeError.message : 'Stripe-fel';
    return {
      ok: false,
      status: 502,
      error: `Kunde inte skapa Stripe-prenumeration: ${msg}. Invite skickades INTE.`,
      stripe_error: true,
    };
  }

  const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    payload.contact_email,
    {
      data: {
        business_name: payload.business_name,
        customer_profile_id: profileId,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
      },
      redirectTo: `${appUrl}/auth/callback`,
    }
  );

  if (inviteError) {
    return {
      ok: false,
      status: 500,
      error: inviteError.message,
    };
  }

  const updateData: Record<string, unknown> = {
    status: 'invited',
    invited_at: new Date().toISOString(),
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: stripeSubscriptionId,
    invoice_text: payload.invoice_text || null,
    scope_items: payload.scope_items || [],
    subscription_interval: payload.subscription_interval || 'month',
    pricing_status: pricingStatus,
    contract_start_date: payload.contract_start_date || null,
    billing_day_of_month: normalizeBillingDay(payload.billing_day_of_month),
    first_invoice_behavior: payload.first_invoice_behavior || 'prorated',
    upcoming_monthly_price: Number(payload.upcoming_monthly_price) || null,
    upcoming_price_effective_date: payload.upcoming_price_effective_date || null,
  };

  const { data: profile, error: updateError } = await supabaseAdmin
    .from('customer_profiles')
    .update(updateData)
    .eq('id', profileId)
    .select()
    .single();

  if (updateError) {
    return {
      ok: false,
      status: 500,
      error: updateError.message,
    };
  }

  return {
    ok: true,
    profile: (profile || {}) as Record<string, unknown>,
    stripeCustomerId,
    stripeSubscriptionId,
  };
}
