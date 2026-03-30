import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe/dynamic-config';
import { validateApiRequest } from '@/lib/auth/api-auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// POST - Create Stripe subscription from customer profile
export async function POST(request: NextRequest) {
  try {
    const authUser = await validateApiRequest(request);
    if (!authUser.is_admin && authUser.role !== 'admin') {
      return NextResponse.json({ error: 'Admin required' }, { status: 403 });
    }

    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const body = await request.json();
    const { email, profileId } = body;

    if (!email || !profileId) {
      return NextResponse.json({ error: 'Email and profileId required' }, { status: 400 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get the customer profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('customer_profiles')
      .select('*')
      .eq('id', profileId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Customer profile not found' }, { status: 404 });
    }

    // Check if subscription already exists
    if (profile.stripe_subscription_id) {
      // Get the existing subscription
      try {
        const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
        
        // Find the invoice
        const invoices = await stripe.invoices.list({
          subscription: subscription.id,
          limit: 1,
          status: 'open',
        });

        if (invoices.data.length > 0) {
          return NextResponse.json({
            subscriptionId: subscription.id,
            invoiceUrl: invoices.data[0].hosted_invoice_url,
          });
        }
      } catch (e) {
        console.error('Error retrieving subscription:', e);
        // Continue to create new one
      }
    }

    // Create new Stripe customer if not exists
    let customerId = profile.stripe_customer_id;
    
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email,
        name: profile.business_name,
        metadata: {
          customer_profile_id: profileId,
        },
      });
      customerId = customer.id;

      // Update profile with customer ID
      await supabaseAdmin
        .from('customer_profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', profileId);
    }

    // Create subscription
    // Stripe only supports day/week/month/year, so quarter = 3 months
    const subscriptionInterval = profile.subscription_interval || 'month';
    const stripeInterval: 'day' | 'week' | 'month' | 'year' = subscriptionInterval === 'quarter' ? 'month' : (subscriptionInterval === 'year' ? 'year' : 'month');
    const intervalCount = subscriptionInterval === 'quarter' ? 3 : 1;
    const intervalText = subscriptionInterval === 'month' ? 'månadsvis' : subscriptionInterval === 'quarter' ? 'kvartalsvis' : 'årligen';

    // Create product and price
    const product = await stripe.products.create({
      name: 'LeTrend Prenumeration',
      description: profile.invoice_text || `${profile.business_name} - ${intervalText}`,
      metadata: {
        scope_items: JSON.stringify(profile.scope_items || []),
        invoice_text: profile.invoice_text || '',
      },
    });

    // Add tax manually (25% Sweden VAT) - price includes VAT
    const monthlyPrice = profile.monthly_price || 0;
    const priceWithVAT = Math.round(monthlyPrice * 100 * 1.25); // Price in öre including 25% VAT

    const price = await stripe.prices.create({
      unit_amount: priceWithVAT, // Price including VAT
      currency: 'sek',
      recurring: {
        interval: stripeInterval,
        interval_count: intervalCount,
      },
      product: product.id,
      tax_behavior: 'inclusive', // Price is inclusive of tax
    });

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: price.id }],
      collection_method: 'send_invoice',
      days_until_due: 14,
      description: profile.invoice_text || `${profile.business_name} - LeTrend Prenumeration`,
      metadata: {
        customer_profile_id: profileId,
        scope_items: JSON.stringify(profile.scope_items || []),
        invoice_text: profile.invoice_text || '',
        price_excl_vat: String(monthlyPrice),
        price_incl_vat: String(Math.round(monthlyPrice * 1.25)),
        vat_rate: '25%',
      },
    });

    // Update profile with subscription ID
    await supabaseAdmin
      .from('customer_profiles')
      .update({ 
        stripe_subscription_id: subscription.id,
        status: 'invited',
      })
      .eq('id', profileId);

    // Get the invoice and apply defaults
    const invoices = await stripe.invoices.list({
      subscription: subscription.id,
      limit: 1,
    });

    let invoiceUrl = null;
    const INVOICE_DEFAULTS = {
      footer: 'Tack för att du väljer LeTrend. Vid frågor, kontakta faktura@letrend.se',
      customFields: [
        { name: 'Kundservice', value: '+46 73 822 22 77' },
        { name: 'Webbplats', value: 'letrend.se' },
      ],
    };

    if (invoices.data.length > 0) {
      const invoice = invoices.data[0];

      // Apply invoice defaults
      try {
        await stripe.invoices.update(invoice.id, {
          footer: INVOICE_DEFAULTS.footer,
          custom_fields: INVOICE_DEFAULTS.customFields,
        });
      } catch (e) {
        console.error('Error applying invoice defaults:', e);
      }

      // If invoice is in draft status, finalize it to get hosted_invoice_url
      if (invoice.status === 'draft') {
        try {
          const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
          invoiceUrl = finalizedInvoice.hosted_invoice_url;
        } catch (finalizeError) {
          console.error('Error finalizing invoice:', finalizeError);
          invoiceUrl = invoice.hosted_invoice_url;
        }
      } else if (invoice.status === 'open') {
        invoiceUrl = invoice.hosted_invoice_url;
      }

      // PHASE 1.2: Save invoice to database for tracking
      try {
        await supabaseAdmin.from('invoices').insert({
          stripe_invoice_id: invoice.id,
          stripe_subscription_id: subscription.id,
          stripe_customer_id: customerId,
          customer_profile_id: profileId,
          amount_due: invoice.amount_due,
          amount_paid: invoice.amount_paid || 0,
          currency: invoice.currency,
          status: invoice.status as string,
          hosted_invoice_url: invoice.hosted_invoice_url || null,
          invoice_pdf: invoice.invoice_pdf || null,
          due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
        });
        console.log(`Invoice ${invoice.id} saved to database`);
      } catch (dbError) {
        console.error('Error saving invoice to database:', dbError);
        // Don't fail the request if DB save fails - invoice still created in Stripe
      }
    }

    return NextResponse.json({
      subscriptionId: subscription.id,
      invoiceUrl: invoiceUrl,
    });

  } catch (error: any) {
    console.error('Error creating subscription:', error);
    return NextResponse.json({ error: error.message || 'Failed to create subscription' }, { status: 500 });
  }
}
