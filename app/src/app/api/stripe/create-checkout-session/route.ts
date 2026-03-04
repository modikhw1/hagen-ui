import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/dynamic-config';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const { email, profileId, priceAmount, productName, customerName, interval, invoiceText } = await req.json();

    // Get invoice_text from profile if not provided
    let finalInvoiceText = invoiceText || '';
    if (!finalInvoiceText && profileId) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const { data: profile } = await supabase
        .from('customer_profiles')
        .select('invoice_text')
        .eq('id', profileId)
        .single();
      finalInvoiceText = profile?.invoice_text || '';
    }

    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
    }

    if (!email || !priceAmount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Find or create customer
    let customerId: string | undefined;
    const existingCustomers = await stripe.customers.list({ email, limit: 1 });

    if (existingCustomers.data.length > 0) {
      customerId = existingCustomers.data[0].id;
    } else {
      const newCustomer = await stripe.customers.create({
        email,
        name: customerName || undefined,
        preferred_locales: ['sv'], // Swedish invoices by default
        metadata: {
          profile_id: profileId || '',
        },
      });
      customerId = newCustomer.id;
    }

    // Create price for this subscription
    // tax_code txcd_10000000 = General services (taxable at standard rate)
    const price = await stripe.prices.create({
      unit_amount: priceAmount, // Amount in öre
      currency: 'sek',
      recurring: {
        interval: interval === 'quarter' ? 'month' : (interval || 'month'),
        interval_count: interval === 'quarter' ? 3 : 1,
      },
      product_data: {
        name: productName || 'LeTrend Prenumeration',
        tax_code: 'txcd_10000000', // General services - triggers Swedish 25% VAT
      },
    });

    // Get the origin for return URL
    const origin = req.headers.get('origin') || 'http://localhost:3000';

    // Create embedded checkout session with LeTrend branding
    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      mode: 'subscription',
      customer: customerId,
      line_items: [
        {
          price: price.id,
          quantity: 1,
        },
      ],
      // Swedish locale for better UX
      locale: 'sv',
      // Return URL after payment
      return_url: `${origin}/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
      // Branding
      custom_text: {
        submit: {
          message: 'Din prenumeration aktiveras direkt efter betalning.',
        },
      },
      // Allow promotion codes
      allow_promotion_codes: true,
      // Billing address collection (required for automatic tax)
      billing_address_collection: 'required',
      // Automatic tax calculation (requires Stripe Tax enabled in Dashboard)
      // Swedish VAT is 25% for services
      automatic_tax: {
        enabled: true,
      },
      // Tax ID collection for B2B
      tax_id_collection: {
        enabled: true,
      },
      // Allow updating customer info
      customer_update: {
        name: 'auto',
        address: 'auto',
      },
      // Subscription data with invoice settings
      subscription_data: {
        description: finalInvoiceText || productName || 'LeTrend Prenumeration',
        metadata: {
          profile_id: profileId || '',
          invoice_text: finalInvoiceText || '',
        },
        invoice_settings: {
          issuer: {
            type: 'self',
          },
        },
      },
      // Metadata for tracking
      metadata: {
        profile_id: profileId || '',
        customer_email: email,
      },
      // Payment method types (card + Swedish methods)
      payment_method_types: ['card', 'klarna'],
    });

    return NextResponse.json({
      clientSecret: session.client_secret,
      sessionId: session.id,
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
