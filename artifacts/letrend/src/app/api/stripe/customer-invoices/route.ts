import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe/dynamic-config';

// GET - Fetch invoices for the logged-in customer
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
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    console.log('[billing-api] User:', user ? user.email : 'not found', userError || '');

    if (!user) {
      return NextResponse.json({
        error: 'Not authenticated',
        debug: 'invalid token'
      }, { status: 401 });
    }

    // Create a fake session object for compatibility
    const session = { user };

    const userId = session.user.id;
    const userEmail = session.user.email;
    console.log('[billing-api] User ID:', userId, 'Email:', userEmail);

    // Try multiple ways to find stripe_customer_id
    let stripeCustomerId: string | null = null;

    // 1. Check profiles table
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single();

    stripeCustomerId = profile?.stripe_customer_id || null;
    console.log('[billing-api] Profile stripe_customer_id:', stripeCustomerId);

    // 2. Check customer_profiles via user metadata
    if (!stripeCustomerId) {
      const customerProfileId = session.user.user_metadata?.customer_profile_id;
      if (customerProfileId) {
        const { data: cp } = await supabase
          .from('customer_profiles')
          .select('stripe_customer_id')
          .eq('id', customerProfileId)
          .single();
        stripeCustomerId = cp?.stripe_customer_id || null;
        console.log('[billing-api] customer_profiles (via metadata) stripe_customer_id:', stripeCustomerId);
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
      console.log('[billing-api] customer_profiles (via email) stripe_customer_id:', stripeCustomerId);
    }

    // 4. Search Stripe directly by email
    if (!stripeCustomerId && userEmail && stripe) {
      const customers = await stripe.customers.list({
        email: userEmail,
        limit: 1,
      });
      if (customers.data.length > 0) {
        stripeCustomerId = customers.data[0].id;
        console.log('[billing-api] Stripe customer (via email search):', stripeCustomerId);
      }
    }

    if (!stripeCustomerId) {
      console.log('[billing-api] No stripe_customer_id found');
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
      invoicePdf: invoice.invoice_pdf, // Direct PDF download URL
    }));

    console.log('[billing-api] Found', invoices.data.length, 'total invoices,', formattedInvoices.length, 'finalized');

    return NextResponse.json({ invoices: formattedInvoices });

  } catch (error) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
  }
}
