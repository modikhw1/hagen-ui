import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/dynamic-config';
import { validateApiRequest, AuthError } from '@/lib/auth/api-auth';
import { createClient } from '@supabase/supabase-js';
import {
  canAccessStripeCustomerResource,
  getAuthorizedCustomerProfile,
} from '@/lib/stripe/customer-access';

interface RouteParams {
  params: Promise<{ subscriptionId: string }>;
}

// GET - Check invoice status for a subscription
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const authUser = await validateApiRequest(request);

    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const { subscriptionId } = await params;

    if (!subscriptionId) {
      return NextResponse.json({ error: 'subscriptionId required' }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const authorizedProfile = await getAuthorizedCustomerProfile({
      supabaseAdmin,
      user: authUser,
    });

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const customerId =
      typeof subscription.customer === 'string' ? subscription.customer : null;
    let customerEmail: string | null = null;

    if (customerId) {
      const customer = await stripe.customers.retrieve(customerId);
      if (!customer.deleted) {
        customerEmail = customer.email || null;
      }
    }

    const ownsSubscription = canAccessStripeCustomerResource(authorizedProfile, {
      customerId,
      subscriptionId,
      email: customerEmail || authUser.email,
    });

    if (!ownsSubscription) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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
