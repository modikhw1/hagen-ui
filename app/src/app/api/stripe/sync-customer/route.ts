import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/config';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '@/lib/env';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

// Lazy initialization to avoid build-time errors
function getSupabaseAdmin() {
  const config = getSupabaseConfig();
  if (!config.isConfigured || !config.serviceKey) {
    console.warn('Supabase service role key not configured - sync will fail');
    return null;
  }
  return createClient(config.url, config.serviceKey);
}

// POST - Sync Stripe customer data to Supabase profile
// Called after login to check if user has a pre-registered subscription
export async function POST(request: NextRequest) {
  try {
    // Rate limit: 20 requests per minute per IP
    const ip = getClientIp(request.headers);
    const limit = rateLimit(`sync-customer:${ip}`, { limit: 20, window: 60 });
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: limit.resetIn },
        { status: 429 }
      );
    }

    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const { email, userId } = await request.json();

    if (!email || !userId) {
      return NextResponse.json({ error: 'Email and userId required' }, { status: 400 });
    }

    // Find customer by email in Stripe
    const customers = await stripe.customers.list({
      email: email,
      limit: 1,
    });

    if (customers.data.length === 0) {
      // No Stripe customer found - nothing to sync
      return NextResponse.json({ synced: false, message: 'No Stripe customer found' });
    }

    const customer = customers.data[0];

    // Check for subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'all',
      limit: 10,
    });

    // Find the most relevant subscription (active first, then incomplete, then others)
    const activeSubscription = subscriptions.data.find(sub => sub.status === 'active');
    const incompleteSubscription = subscriptions.data.find(sub =>
      sub.status === 'incomplete' ||
      sub.status === 'past_due' ||
      sub.status === 'trialing'
    );

    const subscription = activeSubscription || incompleteSubscription;

    // Check if active subscription has unpaid invoice (invoice-based billing)
    // Check for both 'open' (sent) and 'draft' (not yet sent) invoices
    let hasUnpaidInvoice = false;
    if (activeSubscription) {
      const openInvoices = await stripe.invoices.list({
        subscription: activeSubscription.id,
        status: 'open',
        limit: 1,
      });
      const draftInvoices = await stripe.invoices.list({
        subscription: activeSubscription.id,
        status: 'draft',
        limit: 1,
      });
      hasUnpaidInvoice = openInvoices.data.length > 0 || draftInvoices.data.length > 0;
    }

    // Also check for standalone open invoices (not tied to subscription)
    const openInvoices = await stripe.invoices.list({
      customer: customer.id,
      status: 'open',
      limit: 1,
    });
    const hasOpenInvoice = openInvoices.data.length > 0;

    // Prepare update data
    const updateData: Record<string, unknown> = {
      stripe_customer_id: customer.id,
    };

    if (subscription) {
      updateData.subscription_id = subscription.id;

      // If active but has unpaid invoice, mark as 'pending_payment' for routing
      if (subscription.status === 'active' && hasUnpaidInvoice) {
        updateData.subscription_status = 'pending_payment';
        updateData.has_paid = false;
      } else {
        updateData.subscription_status = subscription.status;
        updateData.has_paid = subscription.status === 'active' || subscription.status === 'trialing';
      }

      // Get plan info from subscription metadata or price
      const item = subscription.items.data[0];
      if (item?.price?.metadata?.plan_id) {
        updateData.subscription_type = item.price.metadata.plan_id;
      } else if (subscription.metadata?.plan_id) {
        updateData.subscription_type = subscription.metadata.plan_id;
      }

      // Set period end - cast for Stripe type compatibility
      const subData = subscription as unknown as { current_period_end?: number };
      if (subData.current_period_end) {
        updateData.current_period_end = new Date(subData.current_period_end * 1000).toISOString();
      }
    } else if (hasOpenInvoice) {
      // Customer has open invoice but no subscription
      updateData.subscription_status = 'pending_invoice';
      updateData.has_paid = false;
    }

    // Update Supabase profile
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }
    const { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', userId);

    if (error) {
      console.error('Failed to sync customer to Supabase:', error);
      return NextResponse.json({ error: 'Failed to sync' }, { status: 500 });
    }

    return NextResponse.json({
      synced: true,
      customerId: customer.id,
      subscriptionStatus: updateData.subscription_status || null,
      subscriptionId: subscription?.id || null,
      hasUnpaidInvoice,
    });

  } catch (error) {
    console.error('Error syncing customer:', error);
    return NextResponse.json(
      { error: 'Could not sync customer', details: String(error) },
      { status: 500 }
    );
  }
}
