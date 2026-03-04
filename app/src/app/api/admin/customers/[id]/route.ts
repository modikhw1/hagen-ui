import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { validateApiRequest } from '@/lib/auth/api-auth';
import { logCustomerInvited } from '@/lib/activity/logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Initialize Stripe (only if key is available)
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { typescript: true })
  : null;

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - Fetch single customer profile
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Validate authentication
    const user = await validateApiRequest(request, ['admin']);

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Profile ID required' }, { status: 400 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: profile, error } = await supabaseAdmin
      .from('customer_profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    // Validate authentication
    const user = await validateApiRequest(request, ['admin']);

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Profile ID is required' }, { status: 400 });
    }

    const body = await request.json();
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Handle different actions
    if (body.action === 'send_invite') {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      
      let stripeCustomerId = null;
      let stripeSubscriptionId = null;

      // Create Stripe customer and subscription if Stripe is configured
      if (stripe && body.monthly_price > 0) {
        try {
          // 1. Create Stripe customer
          // Default to Swedish locale - will be updated based on billing address in checkout
          const customer = await stripe.customers.create({
            email: body.contact_email,
            name: body.business_name,
            preferred_locales: ['sv'], // Swedish invoices by default
            metadata: {
              customer_profile_id: id,
            },
          });
          stripeCustomerId = customer.id;
          console.log('Created Stripe customer:', customer.id);

          // 2. Create Stripe subscription with send_invoice
          // Stripe only supports day/week/month/year, so quarter = 3 months
          const subscriptionInterval = body.subscription_interval || 'month';
          const stripeInterval: 'day' | 'week' | 'month' | 'year' = subscriptionInterval === 'quarter' ? 'month' : (subscriptionInterval === 'year' ? 'year' : 'month');
          const intervalCount = subscriptionInterval === 'quarter' ? 3 : 1;
          console.log('Creating subscription with interval:', stripeInterval, 'count:', intervalCount, 'price:', body.monthly_price);

          // First, create a product for this subscription
          const intervalText = subscriptionInterval === 'month' ? 'månadsvis' : subscriptionInterval === 'quarter' ? 'kvartalsvis' : 'årligen';
          const product = await stripe.products.create({
            name: 'LeTrend Prenumeration',
            description: body.invoice_text || `${body.business_name} - ${intervalText}`,
            tax_code: 'txcd_10000000', // General services - triggers Swedish 25% VAT
            metadata: {
              scope_items: JSON.stringify(body.scope_items || []),
              invoice_text: body.invoice_text || '',
            },
          });

          // Then create the price
          const price = await stripe.prices.create({
            unit_amount: body.monthly_price * 100, // Convert to öre
            currency: 'sek',
            recurring: {
              interval: stripeInterval,
              interval_count: intervalCount,
            },
            product: product.id,
          });
          
          // Finally create the subscription
          const subscription = await stripe.subscriptions.create({
            customer: customer.id,
            items: [{ price: price.id }],
            collection_method: 'send_invoice',
            days_until_due: 14,
            metadata: {
              customer_profile_id: id,
              scope_items: JSON.stringify(body.scope_items || []),
              invoice_text: body.invoice_text || '',
            },
          });
          stripeSubscriptionId = subscription.id;
          console.log('Created Stripe subscription:', subscription.id);

        } catch (stripeError: any) {
          console.error('Stripe error:', stripeError);
          // Log detailed error info
          if (stripeError?.type) {
            console.error('Stripe error type:', stripeError.type);
          }
          if (stripeError?.message) {
            console.error('Stripe error message:', stripeError.message);
          }
          if (stripeError?.code) {
            console.error('Stripe error code:', stripeError.code);
          }
          // Continue with invite even if Stripe fails - but DON'T leave Stripe customer orphaned
          // Delete the customer if subscription fails
          if (stripeCustomerId && !stripeSubscriptionId) {
            try {
              await stripe.customers.del(stripeCustomerId);
              stripeCustomerId = null;
              console.log('Deleted orphaned Stripe customer');
            } catch (deleteError) {
              console.error('Failed to delete orphaned customer:', deleteError);
            }
          }
        }
      }

      // Use Supabase's inviteUserByEmail - this actually sends the email!
      const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        body.contact_email,
        {
          data: {
            business_name: body.business_name,
            customer_profile_id: id,
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: stripeSubscriptionId,
          },
          redirectTo: `${appUrl}/auth/callback`,
        }
      );

      if (inviteError) {
        console.error('Invite error:', inviteError);
        return NextResponse.json({ error: inviteError.message }, { status: 500 });
      }

      console.log('Invited user:', inviteData);

      // Update profile status with Stripe info
      const updateData: Record<string, unknown> = {
        status: 'invited',
        invited_at: new Date().toISOString(),
      };

      if (stripeCustomerId) {
        updateData.stripe_customer_id = stripeCustomerId;
      }
      if (stripeSubscriptionId) {
        updateData.stripe_subscription_id = stripeSubscriptionId;
      }
      if (body.invoice_text) {
        updateData.invoice_text = body.invoice_text;
      }
      if (body.scope_items && body.scope_items.length > 0) {
        updateData.scope_items = body.scope_items;
      }
      if (body.subscription_interval) {
        updateData.subscription_interval = body.subscription_interval;
      }

      const { data: profile, error: updateError } = await supabaseAdmin
        .from('customer_profiles')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      // Log activity
      await logCustomerInvited(
        user.id,
        user.email || 'unknown',
        id,
        body.business_name,
        body.contact_email
      );

      return NextResponse.json({
        profile,
        message: 'Invitation email sent!',
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
      });
    }

    if (body.action === 'activate') {
      const { data, error } = await supabaseAdmin
        .from('customer_profiles')
        .update({
          status: 'active',
          agreed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ profile: data });
    }

    // General update
    const { data, error } = await supabaseAdmin
      .from('customer_profiles')
      .update(body)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ profile: data });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // Validate authentication
    const user = await validateApiRequest(request, ['admin']);

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Profile ID is required' }, { status: 400 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { error } = await supabaseAdmin
      .from('customer_profiles')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Profile deleted successfully' });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
