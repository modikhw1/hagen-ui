import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/config';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * PUBLIC API - No auth required
 * Fetches agreement/subscription status by customer ID
 * Used for /pay/[customerId] page where customer may not have an account
 */
export async function GET(request: NextRequest) {
  try {
    // Rate limit: 30 requests per minute per IP
    const ip = getClientIp(request.headers);
    const limit = rateLimit(`public-agreement:${ip}`, { limit: 30, window: 60 });
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: limit.resetIn },
        { status: 429 }
      );
    }

    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');

    if (!customerId) {
      return NextResponse.json({ error: 'Customer ID required' }, { status: 400 });
    }

    // Validate customer ID format
    if (!customerId.startsWith('cus_')) {
      return NextResponse.json({ error: 'Invalid customer ID' }, { status: 400 });
    }

    // Fetch customer
    let customer;
    try {
      customer = await stripe.customers.retrieve(customerId);
    } catch {
      return NextResponse.json({ error: 'Kunden hittades inte' }, { status: 404 });
    }

    if (customer.deleted) {
      return NextResponse.json({ error: 'Kunden finns inte längre' }, { status: 404 });
    }

    // Fetch subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 1,
      expand: ['data.latest_invoice'],
    });

    // Fetch open invoices (if no subscription)
    const invoices = await stripe.invoices.list({
      customer: customerId,
      status: 'open',
      limit: 1,
    });

    // Determine status and build response
    if (subscriptions.data.length > 0) {
      const sub = subscriptions.data[0];
      const invoice = sub.latest_invoice as {
        id?: string;
        hosted_invoice_url?: string;
        status?: string;
      } | null;

      // Map subscription status to agreement status
      let status: 'pending' | 'pending_invoice' | 'active' | 'past_due' | 'cancelled';

      if (sub.status === 'active' || sub.status === 'trialing') {
        status = 'active';
      } else if (sub.status === 'past_due') {
        status = 'past_due';
      } else if (sub.status === 'canceled') {
        status = 'cancelled';
      } else if (sub.status === 'incomplete' || sub.status === 'incomplete_expired') {
        status = 'pending';
      } else {
        status = 'pending';
      }

      // Check if cancelled but still active until period end
      if (sub.cancel_at_period_end && sub.status === 'active') {
        // Still active, but will cancel
        status = 'active';
      }

      // Get price info
      const priceItem = sub.items.data[0];
      const priceAmount = priceItem?.price?.unit_amount || 0;
      const productName = typeof priceItem?.price?.product === 'object'
        ? (priceItem.price.product as { name?: string }).name
        : null;

      return NextResponse.json({
        agreement: {
          status,
          customerId: customer.id,
          customerName: customer.name || customer.email?.split('@')[0] || 'Kund',
          customerEmail: customer.email,
          subscriptionId: sub.id,
          invoiceId: invoice?.id,
          pricePerMonth: priceAmount,
          currency: priceItem?.price?.currency || 'sek',
          productName: productName || 'LeTrend',
          hostedInvoiceUrl: invoice?.hosted_invoice_url,
          cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null,
          currentPeriodEnd: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        },
      });
    }

    // No subscription - check for open invoices
    if (invoices.data.length > 0) {
      const invoice = invoices.data[0];

      return NextResponse.json({
        agreement: {
          status: 'pending_invoice',
          customerId: customer.id,
          customerName: customer.name || customer.email?.split('@')[0] || 'Kund',
          customerEmail: customer.email,
          invoiceId: invoice.id,
          amount: invoice.amount_due,
          currency: invoice.currency,
          productName: invoice.lines.data[0]?.description || 'LeTrend',
          hostedInvoiceUrl: invoice.hosted_invoice_url,
        },
      });
    }

    // No active subscription or invoices
    return NextResponse.json({
      agreement: null,
      message: 'Ingen aktiv prenumeration eller öppen faktura',
    });

  } catch (error) {
    console.error('Public agreement fetch error:', error);
    return NextResponse.json(
      { error: 'Kunde inte hämta avtalsinformation' },
      { status: 500 }
    );
  }
}
