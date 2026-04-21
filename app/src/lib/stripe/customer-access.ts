import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import type { AuthenticatedUser } from '@/lib/auth/api-auth';

export interface AuthorizedCustomerProfile {
  id: string;
  contact_email: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

function normalizeEmail(value: string | null | undefined) {
  return (value || '').trim().toLowerCase();
}

export async function getAuthorizedCustomerProfile(params: {
  supabaseAdmin: SupabaseClient;
  user: AuthenticatedUser;
}) {
  const { supabaseAdmin, user } = params;

  const { data: profileRow } = await supabaseAdmin
    .from('profiles')
    .select('matching_data')
    .eq('id', user.id)
    .maybeSingle();

  const matchingData = profileRow?.matching_data as Record<string, unknown> | null;
  const linkedProfileId =
    typeof matchingData?.customer_profile_id === 'string'
      ? matchingData.customer_profile_id
      : null;

  if (linkedProfileId) {
    const { data: linkedProfile } = await supabaseAdmin
      .from('customer_profiles')
      .select('id, contact_email, stripe_customer_id, stripe_subscription_id')
      .eq('id', linkedProfileId)
      .maybeSingle<AuthorizedCustomerProfile>();

    if (linkedProfile) {
      return linkedProfile;
    }
  }

  const normalizedEmail = normalizeEmail(user.email);
  if (!normalizedEmail) {
    return null;
  }

  const { data: emailProfile } = await supabaseAdmin
    .from('customer_profiles')
    .select('id, contact_email, stripe_customer_id, stripe_subscription_id')
    .ilike('contact_email', normalizedEmail)
    .maybeSingle<AuthorizedCustomerProfile>();

  return emailProfile || null;
}

export function canAccessStripeCustomerResource(
  profile: AuthorizedCustomerProfile | null,
  params: {
    customerId?: string | null;
    subscriptionId?: string | null;
    email?: string | null;
  }
) {
  if (!profile) {
    return false;
  }

  const normalizedProfileEmail = normalizeEmail(profile.contact_email);
  const normalizedEmail = normalizeEmail(params.email);

  if (params.customerId && profile.stripe_customer_id === params.customerId) {
    return true;
  }

  if (
    params.subscriptionId &&
    profile.stripe_subscription_id === params.subscriptionId
  ) {
    return true;
  }

  if (
    normalizedProfileEmail &&
    normalizedEmail &&
    normalizedProfileEmail === normalizedEmail
  ) {
    return true;
  }

  return false;
}

export async function assertInvoiceItemBelongsToCustomer(
  stripe: Stripe,
  itemId: string,
  customerId: string
) {
  const item = await stripe.invoiceItems.retrieve(itemId);
  const itemCustomerId =
    typeof item.customer === 'string' ? item.customer : item.customer?.id ?? null;

  if (itemCustomerId !== customerId) {
    throw new Error('Resursen tillhör inte kunden');
  }

  return item;
}
