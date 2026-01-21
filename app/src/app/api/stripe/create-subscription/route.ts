import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/config';

// Dynamic price lookup - finds first active price for a product with matching plan_id
async function findPriceForPlan(planId: string): Promise<string | null> {
  if (!stripe) return null;

  const prices = await stripe.prices.list({ active: true, limit: 20 });
  const price = prices.data.find(p => p.metadata?.plan_id === planId);
  return price?.id || null;
}

// POST - Create a subscription for a customer
export async function POST(request: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const { customerId, priceId, planId = 'starter' } = await request.json();

    if (!customerId) {
      return NextResponse.json({ error: 'Customer ID required' }, { status: 400 });
    }

    // Use provided priceId or look up by planId
    let price = priceId;
    if (!price) {
      price = await findPriceForPlan(planId);
      if (!price) {
        return NextResponse.json({
          error: `No price found for plan '${planId}'. Run POST /api/stripe/setup-test-products first`
        }, { status: 400 });
      }
    }

    // Create subscription with incomplete status (awaiting payment)
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice'],
      metadata: {
        plan_id: planId,
      },
    });

    // Get the invoice ID
    const latestInvoice = subscription.latest_invoice as { id: string } | null;

    return NextResponse.json({
      success: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        customerId: subscription.customer,
        invoiceId: latestInvoice?.id,
        priceId: price,
      },
    });
  } catch (error) {
    console.error('Create subscription error:', error);
    return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 });
  }
}
