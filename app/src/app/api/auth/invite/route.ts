import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe, SUBSCRIPTION_PLANS, SubscriptionPlanId } from '@/lib/stripe/config';

// Admin client for creating users
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface InviteRequestBody {
  email: string;
  businessName: string;
  planId?: SubscriptionPlanId;
}

export async function POST(request: NextRequest) {
  try {
    const { email, businessName, planId = 'growth' }: InviteRequestBody = await request.json();

    // Validate input
    if (!email || !businessName) {
      return NextResponse.json(
        { error: 'Email and business name are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Validate plan
    if (!SUBSCRIPTION_PLANS[planId]) {
      return NextResponse.json(
        { error: 'Invalid plan. Valid plans: starter, growth, enterprise' },
        { status: 400 }
      );
    }

    // Create admin client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Step 1: Create user with invite
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true, // Auto-confirm email for invited users
      user_metadata: {
        business_name: businessName,
        invited_at: new Date().toISOString(),
        plan: planId,
      },
    });

    if (createError) {
      console.error('Error creating user:', createError);
      
      // Check if user already exists
      if (createError.message.includes('already been registered')) {
        return NextResponse.json(
          { error: 'A user with this email already exists' },
          { status: 409 }
        );
      }
      
      return NextResponse.json(
        { error: createError.message },
        { status: 500 }
      );
    }

    if (!userData.user) {
      return NextResponse.json(
        { error: 'Failed to create user' },
        { status: 500 }
      );
    }

    const userId = userData.user.id;
    let stripeCustomerId: string | null = null;
    let subscriptionId: string | null = null;
    let checkoutUrl: string | null = null;

    // Step 2 & 3: Create Stripe customer and pending subscription (if Stripe is configured)
    if (stripe) {
      try {
        // Create Stripe customer
        const customer = await stripe.customers.create({
          email,
          name: businessName,
          metadata: {
            supabase_user_id: userId,
            business_name: businessName,
          },
        });

        stripeCustomerId = customer.id;

        // Get the plan details
        const plan = SUBSCRIPTION_PLANS[planId];

        // Create a pending subscription (incomplete - requires payment)
        const subscription = await stripe.subscriptions.create({
          customer: customer.id,
          items: [
            {
              price_data: {
                currency: plan.currency,
                product_data: {
                  name: `${plan.name} - LeTrend`,
                  description: plan.description,
                },
                unit_amount: plan.price,
                recurring: {
                  interval: 'month',
                },
              },
            },
          ],
          payment_behavior: 'default_incomplete',
          payment_settings: {
            save_default_payment_method: 'on_subscription',
          },
          expand: ['latest_invoice.payment_intent'],
        });

        subscriptionId = subscription.id;

        // Get the payment intent from the incomplete subscription
        const latestInvoice = subscription.latest_invoice;
        
        if (latestInvoice && typeof latestInvoice === 'object' && 'payment_intent' in latestInvoice) {
          const paymentIntent = (latestInvoice as { payment_intent: { client_secret?: string } }).payment_intent;
          
          if (paymentIntent?.client_secret) {
            // Create checkout session for the pending subscription
            const checkoutSession = await stripe.checkout.sessions.create({
              customer: customer.id,
              mode: 'subscription',
              subscription: subscription.id,
              success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
              cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/?payment=cancelled`,
              metadata: {
                user_id: userId,
                subscription_id: subscriptionId,
              },
            });

            checkoutUrl = checkoutSession.url;
          }
        }

        // Update profile with Stripe customer ID
        await supabaseAdmin
          .from('profiles')
          .update({ 
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: subscriptionId,
          })
          .eq('id', userId);

      } catch (stripeError) {
        console.error('Stripe error:', stripeError);
        // Continue without Stripe if there's an error
      }
    }

    // Step 4: Create profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: userId,
        email,
        business_name: businessName,
        social_links: {},
        tone: [],
        matching_data: {},
        has_paid: !!stripeCustomerId, // false if no Stripe, true if customer created
        has_concepts: false,
        is_admin: false,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: subscriptionId,
      });

    if (profileError) {
      console.error('Error creating profile:', profileError);
      // Continue even if profile creation fails - user can still log in
    }

    // Generate invite link
    const inviteParams = new URLSearchParams({
      flow: 'invite',
      user_id: userId,
    });
    
    if (subscriptionId) {
      inviteParams.set('subscription_id', subscriptionId);
    }
    
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const inviteLink = `${appUrl}/auth/callback?${inviteParams.toString()}`;

    // Return response
    const response: Record<string, unknown> = {
      success: true,
      userId,
      inviteLink,
      message: 'Invitation sent successfully',
    };

    if (stripeCustomerId) {
      response.stripeCustomerId = stripeCustomerId;
    }
    
    if (subscriptionId) {
      response.subscriptionId = subscriptionId;
    }
    
    if (checkoutUrl) {
      response.checkoutUrl = checkoutUrl;
      response.requiresPayment = true;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Invite error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
