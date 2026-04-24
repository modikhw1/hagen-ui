/**
 * GET /api/billing/invoices
 *
 * Fetch invoices for the logged-in customer from Stripe.
 * This is a public-facing API for customers to view their invoices.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe/dynamic-config';

export async function GET(request: NextRequest) {
  try {
    // Get token from Authorization header
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({
        error: 'Not authenticated',
        debug: 'no token'
      }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Get user from token
    const { data: { user } } = await supabase.auth.getUser(token);

    if (!user) {
      return NextResponse.json({
        error: 'Not authenticated',
        debug: 'invalid token'
      }, { status: 401 });
    }

    const userId = user.id;
    const userEmail = user.email;

    // Try multiple ways to find stripe_customer_id
    let stripeCustomerId: string | null = null;

    // 1. Check profiles table
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single();

    stripeCustomerId = profile?.stripe_customer_id || null;

    // 2. Check customer_profiles via user metadata
    if (!stripeCustomerId) {
      const customerProfileId = user.user_metadata?.customer_profile_id;
      if (customerProfileId) {
        const { data: cp } = await supabase
          .from('customer_profiles')
          .select('stripe_customer_id')
          .eq('id', customerProfileId)
          .single();
        stripeCustomerId = cp?.stripe_customer_id || null;
      }
    }

    // 3. Check customer_profiles via email
    if (!stripeCustomerId && userEmail) {
      const { data: cp } = await supabase
        .from('customer_profiles')
        .select('stripe_customer_id')
        .eq('contact_email', userEmail)
        .single();
      stripeCustomerId = cp?.stripe_customer_id || null;
    }

    // 4. Search Stripe directly by email
    if (!stripeCustomerId && userEmail && stripe) {
      const customers = await stripe.customers.list({
        email: userEmail,
        limit: 1,
      });
      if (customers.data.length > 0) {
        stripeCustomerId = customers.data[0].id;
      }
    }

    if (!stripeCustomerId) {
      return NextResponse.json({ invoices: [] });
    }

    if (!stripe) {
      return NextResponse.json({ invoices: [], error: 'Stripe not configured' });
    }

    // Fetch invoices from Stripe
    const invoices = await stripe.invoices.list({
      customer: stripeCustomerId,
      limit: 20,
    });

    // Filter out draft invoices - customers should only see finalized invoices
    const finalizedInvoices = invoices.data.filter(
      invoice => invoice.status !== 'draft'
    );

    const formattedInvoices = finalizedInvoices.map(invoice => ({
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      created: invoice.created,
      dueDate: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
      amount: invoice.amount_due,
      currency: invoice.currency,
      hostedInvoiceUrl: invoice.hosted_invoice_url,
      invoicePdf: invoice.invoice_pdf,
    }));

    return NextResponse.json({ invoices: formattedInvoices });

  } catch (error) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
  }
}
