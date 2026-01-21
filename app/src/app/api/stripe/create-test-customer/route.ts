import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/config';
import { verifyAdminAccess } from '@/lib/auth/admin';

// Test price IDs - these are created by /api/stripe/setup-test-products
const TEST_PRICE_IDS: Record<string, string> = {
  starter: 'price_1Ss1QrPetwZcCbhP9AtAJdgi',
  growth: 'price_1Ss1QsPetwZcCbhPtLqH8ZsM',
  enterprise: 'price_1Ss1QtPetwZcCbhP83wVrj2W',
};

// POST - Create a test customer with subscription (admin only)
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

    const { email, name, plan = 'starter' } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const priceId = TEST_PRICE_IDS[plan];
    if (!priceId) {
      return NextResponse.json({ error: `Invalid plan: ${plan}. Use: starter, growth, or enterprise` }, { status: 400 });
    }

    // Create customer
    const customer = await stripe.customers.create({
      email,
      name: name || email.split('@')[0],
    });

    // Create subscription with incomplete status
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice'],
      metadata: {
        plan_id: plan,
      },
    });

    const latestInvoice = subscription.latest_invoice as { id: string } | null;

    return NextResponse.json({
      success: true,
      customer: {
        id: customer.id,
        email: customer.email,
        name: customer.name,
      },
      subscription: {
        id: subscription.id,
        status: subscription.status,
        invoiceId: latestInvoice?.id,
      },
    });
  } catch (error) {
    console.error('Create test customer error:', error);
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 });
  }
}
