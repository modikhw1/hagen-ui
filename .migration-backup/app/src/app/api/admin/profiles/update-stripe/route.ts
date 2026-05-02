import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe/dynamic-config';
import { withAuth } from '@/lib/auth/api-auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// POST - Update user profile with Stripe info
export const POST = withAuth(async (request: NextRequest, user) => {
  try {
    const body = await request.json();
    const { subscriptionId } = body;

    if (!subscriptionId) {
      return NextResponse.json({ error: 'subscriptionId required' }, { status: 400 });
    }

    const userId = user.id;

    // Get subscription details from Stripe
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const stripeCustomerId = subscription.customer as string;

    // Update profile with Stripe info
    const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        stripe_customer_id: stripeCustomerId,
        subscription_id: subscriptionId,
        subscription_status: subscription.status,
        has_paid: subscription.status === 'active',
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Error updating profile:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error updating stripe info:', error);
    return NextResponse.json({ error: 'Failed to update stripe info' }, { status: 500 });
  }
}, ['admin', 'customer']); // Allow customers to update their own Stripe info
