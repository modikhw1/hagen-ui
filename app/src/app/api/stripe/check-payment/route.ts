import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/dynamic-config';
import { createClient } from '@supabase/supabase-js';
import { validateApiRequest } from '@/lib/auth/api-auth';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase not configured');
  }
  return createClient(url, key);
}

// POST - Check and sync payment status for a subscription
export async function POST(request: NextRequest) {
  try {
    const authUser = await validateApiRequest(request);

    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const { subscriptionId, userId, email } = await request.json();

    // Users can only update their own profile
    if (userId && userId !== authUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!subscriptionId && !email) {
      return NextResponse.json({ error: 'subscriptionId or email required' }, { status: 400 });
    }

    let subscription;

    if (subscriptionId) {
      subscription = await stripe.subscriptions.retrieve(subscriptionId);
    } else if (email) {
      // Find customer by email
      const customers = await stripe.customers.list({ email, limit: 1 });
      if (customers.data.length === 0) {
        return NextResponse.json({ found: false, message: 'No customer found' });
      }

      const customerId = customers.data[0].id;
      const subs = await stripe.subscriptions.list({ customer: customerId, limit: 1 });

      if (subs.data.length === 0) {
        return NextResponse.json({ found: false, message: 'No subscription found' });
      }

      subscription = subs.data[0];
    }

    if (!subscription) {
      return NextResponse.json({ found: false, message: 'Subscription not found' });
    }

    // Map Stripe status to our status
    const status = subscription.status;
    const isPaid = status === 'active';
    
    // Get the latest invoice to check if it's paid
    const invoices = await stripe.invoices.list({
      subscription: subscription.id,
      limit: 1,
    });
    
    const latestInvoice = invoices.data[0];
    const invoicePaid = latestInvoice?.status === 'paid';

    const subWithPeriod = subscription as unknown as { current_period_end?: number };

    // Update profile if we have userId
    let profileUpdated = false;
    if (userId) {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase
        .from('profiles')
        .update({
          subscription_status: status,
          subscription_id: subscription.id,
          has_paid: isPaid,
          stripe_customer_id: subscription.customer as string,
          current_period_end: subWithPeriod.current_period_end
            ? new Date(subWithPeriod.current_period_end * 1000).toISOString()
            : null,
        })
        .eq('id', userId);

      profileUpdated = !error;
      if (error) {
        console.error('Failed to update profile:', error);
      }
    }

    return NextResponse.json({
      found: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        isPaid: invoicePaid,
        currentPeriodEnd: subWithPeriod.current_period_end
          ? new Date(subWithPeriod.current_period_end * 1000).toISOString()
          : null,
      },
      invoice: latestInvoice ? {
        id: latestInvoice.id,
        status: latestInvoice.status,
        amount_paid: latestInvoice.amount_paid,
        amount_due: latestInvoice.amount_due,
      } : null,
      profileUpdated,
    });
  } catch (error) {
    console.error('Check payment error:', error);
    return NextResponse.json({ error: 'Failed to check payment' }, { status: 500 });
  }
}

// GET - Quick status check by email (no profile update)
export async function GET(request: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json({ error: 'email required' }, { status: 400 });
    }

    // Find customer by email
    const customers = await stripe.customers.list({ email, limit: 1 });
    if (customers.data.length === 0) {
      return NextResponse.json({ hasSubscription: false });
    }

    const customerId = customers.data[0].id;
    const subs = await stripe.subscriptions.list({ customer: customerId, limit: 1 });

    if (subs.data.length === 0) {
      return NextResponse.json({ hasSubscription: false, customerId });
    }

    const sub = subs.data[0];
    const subWithPeriod = sub as unknown as { current_period_end?: number };
    return NextResponse.json({
      hasSubscription: true,
      customerId,
      status: sub.status,
      isPaid: sub.status === 'active' || sub.status === 'trialing',
      currentPeriodEnd: subWithPeriod.current_period_end 
        ? new Date(subWithPeriod.current_period_end * 1000).toISOString() 
        : null,
    });
  } catch (error) {
    console.error('Check payment error:', error);
    return NextResponse.json({ error: 'Failed to check payment' }, { status: 500 });
  }
}
