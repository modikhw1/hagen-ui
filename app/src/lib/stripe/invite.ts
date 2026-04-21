import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import type { CustomerInvitePayload } from '@/lib/schemas/customer';
import { stripeEnvironment } from '@/lib/stripe/dynamic-config';
import { upsertInvoiceMirror, upsertSubscriptionMirror } from '@/lib/stripe/mirror';
import { recurringUnitAmountFromMonthlySek } from '@/lib/stripe/price-amounts';

interface ExistingProfileStripeState {
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

interface ExistingAuthUser {
  id: string;
  email: string | null;
  email_confirmed_at: string | null;
}

type EnsuredStripeSubscription = {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscription: Stripe.Subscription | null;
  createdStripeCustomerId: string | null;
};

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
    unit_amount: recurringUnitAmountFromMonthlySek({
      monthlyPriceSek: Number(payload.monthly_price) || 0,
      interval: stripeInterval,
      intervalCount,
    }),
    currency: 'sek',
    tax_behavior: 'exclusive',
    recurring: {
      interval: stripeInterval,
      interval_count: intervalCount,
    },
    product: product.id,
  });

  return stripeClient.subscriptions.create({
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
    expand: ['latest_invoice', 'items.data.price.product'],
  });
}

async function syncInviteMirrors(params: {
  supabaseAdmin: SupabaseClient;
  stripeClient: Stripe;
  subscription: Stripe.Subscription;
}) {
  const { supabaseAdmin, stripeClient, subscription } = params;

  await upsertSubscriptionMirror({
    supabaseAdmin,
    subscription,
    environment: stripeEnvironment,
  });

  const latestInvoiceId =
    typeof subscription.latest_invoice === 'string'
      ? subscription.latest_invoice
      : subscription.latest_invoice?.id ?? null;

  if (!latestInvoiceId) {
    return;
  }

  const invoice = await stripeClient.invoices.retrieve(latestInvoiceId, {
    expand: ['lines.data'],
  });

  await upsertInvoiceMirror({
    supabaseAdmin,
    invoice,
    environment: stripeEnvironment,
  });
}

function isReusableSubscription(subscription: Stripe.Subscription | null) {
  if (!subscription) return false;

  if (
    subscription.status === 'canceled' ||
    subscription.status === 'incomplete_expired' ||
    subscription.status === 'unpaid'
  ) {
    return false;
  }

  if (subscription.ended_at || subscription.canceled_at) {
    return false;
  }

  return true;
}

async function ensureStripeCustomer(args: {
  stripeClient: Stripe;
  existingCustomerId: string | null;
  profileId: string;
  payload: CustomerInvitePayload;
}) {
  const metadata = {
    customer_profile_id: args.profileId,
    pricing_status: normalizePricingStatus(args.payload.pricing_status),
  };

  if (args.existingCustomerId) {
    try {
      const updatedCustomer = await args.stripeClient.customers.update(
        args.existingCustomerId,
        {
          email: args.payload.contact_email,
          name: args.payload.business_name,
          address: { country: 'SE' },
          preferred_locales: ['sv'],
          metadata,
        }
      );

      return {
        customerId: updatedCustomer.id,
        createdStripeCustomerId: null,
      };
    } catch {
      // Fall through and create a fresh customer if the stored Stripe ID is no longer usable.
    }
  }

  const customer = await args.stripeClient.customers.create({
    email: args.payload.contact_email,
    name: args.payload.business_name,
    address: {
      country: 'SE',
    },
    preferred_locales: ['sv'],
    metadata,
  });

  return {
    customerId: customer.id,
    createdStripeCustomerId: customer.id,
  };
}

export async function ensureStripeSubscriptionForProfile(params: {
  supabaseAdmin: SupabaseClient;
  stripeClient: Stripe | null;
  profileId: string;
  payload: CustomerInvitePayload;
}): Promise<EnsuredStripeSubscription> {
  const { supabaseAdmin, stripeClient, profileId, payload } = params;
  const pricingStatus = normalizePricingStatus(payload.pricing_status);
  const monthlyPrice = Number(payload.monthly_price) || 0;

  const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
    .from('customer_profiles')
    .select('stripe_customer_id, stripe_subscription_id')
    .eq('id', profileId)
    .single<ExistingProfileStripeState>();

  if (existingProfileError) {
    throw new Error(existingProfileError.message);
  }

  let stripeCustomerId = existingProfile?.stripe_customer_id || null;
  let stripeSubscriptionId = existingProfile?.stripe_subscription_id || null;
  let subscription: Stripe.Subscription | null = null;
  let createdStripeCustomerId: string | null = null;

  if (!stripeClient || pricingStatus !== 'fixed' || monthlyPrice <= 0) {
    return {
      stripeCustomerId,
      stripeSubscriptionId,
      subscription,
      createdStripeCustomerId,
    };
  }

  const ensuredCustomer = await ensureStripeCustomer({
    stripeClient,
    existingCustomerId: stripeCustomerId,
    profileId,
    payload,
  });
  stripeCustomerId = ensuredCustomer.customerId;
  createdStripeCustomerId = ensuredCustomer.createdStripeCustomerId;

  if (stripeSubscriptionId) {
    try {
      const existingSubscription = await stripeClient.subscriptions.retrieve(
        stripeSubscriptionId,
        { expand: ['latest_invoice', 'items.data.price.product'] }
      );

      if (isReusableSubscription(existingSubscription)) {
        subscription = existingSubscription;
      } else {
        stripeSubscriptionId = null;
      }
    } catch {
      stripeSubscriptionId = null;
    }
  }

  if (!stripeSubscriptionId && stripeCustomerId) {
    subscription = await createSubscriptionForCustomer(
      stripeClient,
      stripeCustomerId,
      profileId,
      payload
    );
    stripeSubscriptionId = subscription.id;
  }

  if (subscription) {
    await syncInviteMirrors({
      supabaseAdmin,
      stripeClient,
      subscription,
    });
  }

  return {
    stripeCustomerId,
    stripeSubscriptionId,
    subscription,
    createdStripeCustomerId,
  };
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

  try {
    const ensuredStripe = await ensureStripeSubscriptionForProfile({
      supabaseAdmin,
      stripeClient,
      profileId,
      payload,
    });
    const stripeCustomerId = ensuredStripe.stripeCustomerId;
    const stripeSubscriptionId = ensuredStripe.stripeSubscriptionId;

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
  } catch (stripeError) {
    const msg = stripeError instanceof Error ? stripeError.message : 'Stripe-fel';
    return {
      ok: false,
      status: 502,
      error: `Kunde inte skapa Stripe-prenumeration: ${msg}. Invite skickades INTE.`,
      stripe_error: true,
    };
  }
}
