import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/config';
import { verifyAdminAccess } from '@/lib/auth/admin';

// Dynamic price lookup - finds first active price for a product with matching plan_id
async function findPriceForPlan(planId: string): Promise<string | null> {
  if (!stripe) return null;

  const prices = await stripe.prices.list({ active: true, limit: 20 });
  const price = prices.data.find(p => p.metadata?.plan_id === planId);
  return price?.id || prices.data[0]?.id || null;
}

// POST - Create a test subscription (admin only)
export async function POST(request: NextRequest) {
  try {
    // Require admin access
    const auth = await verifyAdminAccess();
    if (!auth.isAdmin) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: auth.error === 'No access token' ? 401 : 403 });
    }

    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const { customerId, planId = 'starter' } = await request.json();

    if (!customerId) {
      return NextResponse.json({ error: 'customerId required' }, { status: 400 });
    }

    // Find price dynamically
    const priceId = await findPriceForPlan(planId);
    if (!priceId) {
      return NextResponse.json({
        error: 'No price found. Run POST /api/stripe/setup-test-products first'
      }, { status: 400 });
    }

    // Create subscription with incomplete status (awaiting payment)
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        supabase_user_id: '', // Will be linked when user logs in
        plan_id: planId,
      },
    });

    return NextResponse.json({
      success: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        customerId: subscription.customer,
        priceId,
      },
    });
  } catch (error) {
    console.error('Create subscription error:', error);
    return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 });
  }
}
