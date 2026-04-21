import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

type CustomerLookup = {
  id: string;
  status: string | null;
};

async function findCustomerProfile(params: {
  stripeCustomerId?: string | null;
  subscriptionId?: string | null;
}) {
  const supabaseAdmin = createSupabaseAdmin();
  const { stripeCustomerId, subscriptionId } = params;

  if (stripeCustomerId) {
    const { data, error } = await supabaseAdmin
      .from('customer_profiles')
      .select('id, status')
      .eq('stripe_customer_id', stripeCustomerId);

    if (error) {
      return { error, profile: null };
    }

    if (data && data.length > 0) {
      return { error: null, profile: data[0] as CustomerLookup };
    }
  }

  if (!subscriptionId) {
    return { error: null, profile: null };
  }

  const { data, error } = await supabaseAdmin
    .from('customer_profiles')
    .select('id, status')
    .eq('stripe_subscription_id', subscriptionId);

  if (error) {
    return { error, profile: null };
  }

  return {
    error: null,
    profile: data && data.length > 0 ? (data[0] as CustomerLookup) : null,
  };
}

export const POST = withAuth(async (request: NextRequest) => {
  try {
    const body = await request.json().catch(() => ({}));
    const stripeCustomerId =
      typeof body.stripeCustomerId === 'string' ? body.stripeCustomerId : null;
    const subscriptionId =
      typeof body.subscriptionId === 'string' ? body.subscriptionId : null;

    if (!stripeCustomerId && !subscriptionId) {
      return jsonError(
        'stripeCustomerId eller subscriptionId kravs',
        400,
      );
    }

    const supabaseAdmin = createSupabaseAdmin();
    const { profile, error: findError } = await findCustomerProfile({
      stripeCustomerId,
      subscriptionId,
    });

    if (findError) {
      console.error('[decline-agreement] Kunde inte hitta kundprofil:', findError);
      return jsonError(findError.message, 500);
    }

    if (!profile) {
      return jsonError('Kundprofil hittades inte', 404);
    }

    const { error: updateError } = await supabaseAdmin
      .from('customer_profiles')
      .update({
        status: 'pending_payment',
        declined_at: new Date().toISOString(),
      } as never)
      .eq('id', profile.id);

    if (updateError) {
      return jsonError(updateError.message, 500);
    }

    return jsonOk({
      message: 'Status uppdaterad till pending_payment',
      profileId: profile.id,
    });
  } catch (error) {
    console.error('[decline-agreement] Ovantat fel:', error);
    return jsonError('Kunde inte uppdatera status', 500);
  }
}, ['admin']);
