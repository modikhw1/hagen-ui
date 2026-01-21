import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/config';

// POST - Set invoice number prefix for a customer
export async function POST(request: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const { customerId, prefix } = await request.json();

    if (!customerId) {
      return NextResponse.json({ error: 'Customer ID required' }, { status: 400 });
    }

    // Default prefix based on customer name or "LT"
    const invoicePrefix = prefix || 'LT';

    const customer = await stripe.customers.update(customerId, {
      invoice_prefix: invoicePrefix,
    });

    return NextResponse.json({
      success: true,
      customer: {
        id: customer.id,
        name: customer.name,
        invoicePrefix: customer.invoice_prefix,
      },
    });
  } catch (error) {
    console.error('Set invoice prefix error:', error);
    return NextResponse.json({ error: 'Failed to set invoice prefix' }, { status: 500 });
  }
}
