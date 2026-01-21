import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/config';
import { verifyAdminAccess } from '@/lib/auth/admin';

// GET - Debug endpoint to list Stripe data (admin only)
export async function GET() {
  try {
    // Require admin access
    const auth = await verifyAdminAccess();
    if (!auth.isAdmin) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: auth.error === 'No access token' ? 401 : 403 });
    }

    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    // Get customers
    const customers = await stripe.customers.list({ limit: 10 });

    // Get products
    const products = await stripe.products.list({ limit: 10, active: true });

    // Get subscriptions
    const subscriptions = await stripe.subscriptions.list({ limit: 10 });

    // Get prices
    const prices = await stripe.prices.list({ limit: 10, active: true });

    // Get invoices
    const invoices = await stripe.invoices.list({ limit: 10 });

    return NextResponse.json({
      customers: customers.data.map(c => ({
        id: c.id,
        email: c.email,
        name: c.name,
        created: new Date(c.created * 1000).toISOString(),
      })),
      products: products.data.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        metadata: p.metadata,
      })),
      subscriptions: subscriptions.data.map(s => ({
        id: s.id,
        status: s.status,
        customer: s.customer,
        items: s.items.data.map(i => ({
          priceId: i.price.id,
          productId: i.price.product,
          amount: i.price.unit_amount,
          currency: i.price.currency,
        })),
        metadata: s.metadata,
      })),
      prices: prices.data.map(p => ({
        id: p.id,
        productId: p.product,
        amount: p.unit_amount,
        currency: p.currency,
        recurring: p.recurring,
      })),
      invoices: invoices.data.map(i => ({
        id: i.id,
        number: i.number,
        status: i.status,
        customer: i.customer,
        total: i.total,
        currency: i.currency,
        hostedInvoiceUrl: i.hosted_invoice_url,
      })),
    });
  } catch (error) {
    console.error('Stripe debug error:', error);
    return NextResponse.json({ error: 'Failed to fetch Stripe data' }, { status: 500 });
  }
}
