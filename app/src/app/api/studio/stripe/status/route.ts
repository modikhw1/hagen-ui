import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { withAuth } from '@/lib/auth/api-auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Get Stripe config
const ENV = process.env.NEXT_PUBLIC_ENV || 'test';
const SECRET_KEY = ENV === 'test'
  ? process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY
  : process.env.STRIPE_SECRET_KEY_LIVE;

const stripe = SECRET_KEY ? new Stripe(SECRET_KEY, { apiVersion: '2025-12-15.clover' }) : null;

/**
 * POST /api/studio/stripe/status
 * Create a Stripe customer for an existing customer profile
 */
export const POST = withAuth(async (request: NextRequest, user) => {
  try {
    const body = await request.json();
    const { customer_profile_id, email, business_name } = body;

    if (!customer_profile_id || !email) {
      return NextResponse.json({ error: 'customer_profile_id and email required' }, { status: 400 });
    }

    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
    }

    // Create Stripe customer
    const customer = await stripe.customers.create({
      email,
      name: business_name || email,
      metadata: {
        customer_profile_id,
        source: 'hagen-studio',
      },
    });

    // Update customer profile with Stripe ID
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { error: updateError } = await supabaseAdmin
      .from('customer_profiles')
      .update({ stripe_customer_id: customer.id })
      .eq('id', customer_profile_id);

    if (updateError) {
      console.error('Error updating customer profile:', updateError);
    }

    // Log the sync
    await supabaseAdmin
      .from('stripe_sync_log')
      .insert({
        event_type: 'customer.created',
        stripe_event_id: `studio_${customer.id}`,
        object_type: 'customer',
        object_id: customer.id,
        sync_direction: 'supabase_to_stripe',
        status: 'success',
      });

    return NextResponse.json({
      success: true,
      stripe_customer_id: customer.id,
    });

  } catch (err: any) {
    console.error('[create-customer] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}, ['admin', 'content_manager']);

/**
 * GET /api/studio/stripe/status
 * Get Stripe environment and sync status
 */
export const GET = withAuth(async (request: NextRequest, user) => {
  const isTestMode = ENV === 'test';

  // Get invoice counts
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  
  const { count: invoiceCount } = await supabaseAdmin
    .from('invoices')
    .select('*', { count: 'exact', head: true });

  const { count: customerCount } = await supabaseAdmin
    .from('customer_profiles')
    .select('*', { count: 'exact', head: true })
    .not('stripe_customer_id', 'is', null);

  const { data: recentSyncs } = await supabaseAdmin
    .from('stripe_sync_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  return NextResponse.json({
    environment: ENV,
    isTestMode,
    stats: {
      totalInvoices: invoiceCount || 0,
      syncedCustomers: customerCount || 0,
    },
    recentSyncs: recentSyncs || [],
  });
}, ['admin', 'content_manager']);
