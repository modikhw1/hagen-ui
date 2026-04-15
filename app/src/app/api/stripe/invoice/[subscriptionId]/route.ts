import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/dynamic-config';
import { validateApiRequest, AuthError } from '@/lib/auth/api-auth';

// GET - Check invoice status for a subscription
export async function GET(request: NextRequest) {
  try {
    await validateApiRequest(request);

    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const subscriptionId = searchParams.get('subscriptionId');

    if (!subscriptionId) {
      return NextResponse.json({ error: 'subscriptionId required' }, { status: 400 });
    }

    // Get the latest invoice for this subscription
    const invoices = await stripe.invoices.list({
      subscription: subscriptionId,
      limit: 1,
    });

    if (invoices.data.length === 0) {
      return NextResponse.json({ invoice: null });
    }

    const invoice = invoices.data[0];

    return NextResponse.json({
      invoice: {
        id: invoice.id,
        status: invoice.status,
        amount_paid: invoice.amount_paid,
        amount_due: invoice.amount_due,
        hosted_invoice_url: invoice.hosted_invoice_url,
      },
    });

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error checking invoice:', error);
    return NextResponse.json({ error: 'Failed to check invoice' }, { status: 500 });
  }
}
