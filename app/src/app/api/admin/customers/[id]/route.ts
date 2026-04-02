import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { AuthError, validateApiRequest } from '@/lib/auth/api-auth';
import { stripe } from '@/lib/stripe/dynamic-config';
import { logCustomerInvited } from '@/lib/activity/logger';
import { applyPriceToSubscription } from '@/lib/stripe/subscription-pricing';
import { resolveAccountManagerAssignment } from '@/lib/studio/account-manager';
import { getAppUrl } from '@/lib/url/public';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;


interface RouteParams {
  params: Promise<{ id: string }>;
}

function buildCustomerPayload(profile: unknown) {
  return {
    customer: profile,
    profile,
  };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await validateApiRequest(request, ['admin', 'customer', 'content_manager']);
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

    // Non-admins can only access their own profile
    if (!user.is_admin && user.role !== 'admin') {
      const userEmail = (user.email || '').trim().toLowerCase();
      const profileEmail = (profile?.contact_email || '').trim().toLowerCase();
      if (!profileEmail || profileEmail !== userEmail) {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
      }
    }

    return NextResponse.json(buildCustomerPayload(profile));
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  console.log('[API] PATCH called for customer');
  try {
    const user = await validateApiRequest(request, ['admin']);
    console.log('[API] User validated:', user.email);

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Profile ID is required' }, { status: 400 });
    }

    const body = await request.json();
    console.log('[API] Body action:', body.action);
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // --- Action: send_invite ---
    if (body.action === 'send_invite') {
      const appUrl = getAppUrl();

      let stripeCustomerId = null;
      let stripeSubscriptionId = null;

      const pricingStatus = body.pricing_status === 'unknown' ? 'unknown' : 'fixed';
      if (stripe && pricingStatus === 'fixed' && Number(body.monthly_price) > 0) {
        try {
          const customer = await stripe.customers.create({
            email: body.contact_email,
            name: body.business_name,
            preferred_locales: ['sv'],
            metadata: {
              customer_profile_id: id,
              pricing_status: pricingStatus,
            },
          });
          stripeCustomerId = customer.id;
          console.log('Created Stripe customer:', customer.id);

          const subscriptionInterval = body.subscription_interval || 'month';
          const stripeInterval: 'day' | 'week' | 'month' | 'year' =
            subscriptionInterval === 'quarter' ? 'month'
            : subscriptionInterval === 'year' ? 'year'
            : 'month';
          const intervalCount = subscriptionInterval === 'quarter' ? 3 : 1;

          const intervalText =
            subscriptionInterval === 'month' ? 'manadsvis'
            : subscriptionInterval === 'quarter' ? 'kvartalsvis'
            : 'arligen';

          const product = await stripe.products.create({
            name: 'LeTrend Prenumeration',
            description: body.invoice_text || `${body.business_name} - ${intervalText}`,
            tax_code: 'txcd_10000000',
            metadata: {
              scope_items: JSON.stringify(body.scope_items || []),
              invoice_text: body.invoice_text || '',
              contract_start_date: body.contract_start_date || '',
              billing_day_of_month: String(body.billing_day_of_month || 25),
              first_invoice_behavior: body.first_invoice_behavior || 'prorated',
              discount_type: body.discount_type || 'none',
              discount_value: String(body.discount_value || 0),
              discount_duration_months: String(body.discount_duration_months || ''),
              upcoming_monthly_price: String(body.upcoming_monthly_price || ''),
              upcoming_price_effective_date: body.upcoming_price_effective_date || '',
            },
          });

          const price = await stripe.prices.create({
            unit_amount: body.monthly_price * 100,
            currency: 'sek',
            recurring: { interval: stripeInterval, interval_count: intervalCount },
            product: product.id,
          });

          const subscription = await stripe.subscriptions.create({
            customer: customer.id,
            items: [{ price: price.id }],
            collection_method: 'send_invoice',
            days_until_due: 14,
            metadata: {
              customer_profile_id: id,
              scope_items: JSON.stringify(body.scope_items || []),
              invoice_text: body.invoice_text || '',
              pricing_status: pricingStatus,
              contract_start_date: body.contract_start_date || '',
              billing_day_of_month: String(body.billing_day_of_month || 25),
              first_invoice_behavior: body.first_invoice_behavior || 'prorated',
              discount_type: body.discount_type || 'none',
              discount_value: String(body.discount_value || 0),
              discount_duration_months: String(body.discount_duration_months || ''),
              upcoming_monthly_price: String(body.upcoming_monthly_price || ''),
              upcoming_price_effective_date: body.upcoming_price_effective_date || '',
            },
          });
          stripeSubscriptionId = subscription.id;
          console.log('Created Stripe subscription:', subscription.id);

        } catch (stripeError: unknown) {
          const e = stripeError as Record<string, unknown>;
          console.error('Stripe error:', e?.type, e?.message, e?.code);
          // Don't leave an orphaned Stripe customer
          if (stripeCustomerId && !stripeSubscriptionId && stripe) {
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

      const updateData: Record<string, unknown> = {
        status: 'invited',
        invited_at: new Date().toISOString(),
      };

      if (stripeCustomerId) updateData.stripe_customer_id = stripeCustomerId;
      if (stripeSubscriptionId) updateData.stripe_subscription_id = stripeSubscriptionId;
      if (body.invoice_text) updateData.invoice_text = body.invoice_text;
      if (body.scope_items?.length > 0) updateData.scope_items = body.scope_items;
      if (body.subscription_interval) updateData.subscription_interval = body.subscription_interval;
      if (body.pricing_status) updateData.pricing_status = body.pricing_status === 'unknown' ? 'unknown' : 'fixed';
      if (body.contract_start_date) updateData.contract_start_date = body.contract_start_date;
      if (body.billing_day_of_month) updateData.billing_day_of_month = Math.max(1, Math.min(28, Number(body.billing_day_of_month) || 25));
      if (body.first_invoice_behavior) updateData.first_invoice_behavior = body.first_invoice_behavior;
      if (body.discount_type) updateData.discount_type = body.discount_type;
      if (body.discount_value !== undefined) updateData.discount_value = Number(body.discount_value) || 0;
      if (body.discount_duration_months !== undefined) updateData.discount_duration_months = Number(body.discount_duration_months) || null;
      if (body.discount_start_date) updateData.discount_start_date = body.discount_start_date;
      if (body.discount_end_date !== undefined) updateData.discount_end_date = body.discount_end_date || null;
      if (body.upcoming_monthly_price !== undefined) updateData.upcoming_monthly_price = Number(body.upcoming_monthly_price) || null;
      if (body.upcoming_price_effective_date !== undefined) updateData.upcoming_price_effective_date = body.upcoming_price_effective_date || null;

      const { data: profile, error: updateError } = await supabaseAdmin
        .from('customer_profiles')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      await logCustomerInvited(user.id, user.email || 'unknown', id, body.business_name, body.contact_email);

      return NextResponse.json({
        ...buildCustomerPayload(profile),
        message: 'Invitation email sent!',
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
      });
    }

    // --- Action: activate ---
    if (body.action === 'activate') {
      const { data, error } = await supabaseAdmin
        .from('customer_profiles')
        .update({ status: 'active', agreed_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(buildCustomerPayload(data));
    }

    // --- Action: send_reminder ---
    if (body.action === 'send_reminder') {
      const { error: profileError } = await supabaseAdmin
        .from('customer_profiles')
        .select('id')
        .eq('id', id)
        .single();

      if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

      return NextResponse.json({
        message: 'Kunden har redan ett konto. De kan logga in for att fortsatta.',
        already_registered: true,
      });
    }

    // --- General update (allowlisted fields only) ---
    const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
      .from('customer_profiles')
      .select('id, monthly_price, pricing_status, stripe_subscription_id, upcoming_monthly_price, upcoming_price_effective_date')
      .eq('id', id)
      .single();

    if (existingProfileError || !existingProfile) {
      return NextResponse.json({ error: existingProfileError?.message || 'Customer profile not found' }, { status: 404 });
    }

    const allowedUpdateKeys = new Set([
      'business_name', 'contact_email', 'customer_contact_name',
      'account_manager', 'monthly_price', 'pricing_status',
      'contract_start_date', 'billing_day_of_month', 'first_invoice_behavior',
      'discount_type', 'discount_value', 'discount_duration_months',
      'discount_start_date', 'discount_end_date',
      'upcoming_monthly_price', 'upcoming_price_effective_date',
      'subscription_interval', 'invoice_text', 'scope_items',
      'status', 'logo_url', 'brief', 'game_plan',
    ]);

    const sanitizedBody = Object.fromEntries(
      Object.entries(body).filter(([key]) => allowedUpdateKeys.has(key))
    );

    if (sanitizedBody.billing_day_of_month !== undefined) {
      sanitizedBody.billing_day_of_month = Math.max(1, Math.min(28, Number(sanitizedBody.billing_day_of_month) || 25));
    }
    if (sanitizedBody.monthly_price !== undefined) {
      sanitizedBody.monthly_price = Number(sanitizedBody.monthly_price) || 0;
    }
    if (sanitizedBody.pricing_status !== undefined) {
      sanitizedBody.pricing_status = sanitizedBody.pricing_status === 'unknown' ? 'unknown' : 'fixed';
      if (sanitizedBody.pricing_status === 'unknown') sanitizedBody.monthly_price = 0;
    }
    if (sanitizedBody.discount_value !== undefined) {
      sanitizedBody.discount_value = Number(sanitizedBody.discount_value) || 0;
    }
    if (sanitizedBody.discount_duration_months !== undefined) {
      sanitizedBody.discount_duration_months = Number(sanitizedBody.discount_duration_months) || null;
    }
    if (sanitizedBody.upcoming_monthly_price !== undefined) {
      sanitizedBody.upcoming_monthly_price = Number(sanitizedBody.upcoming_monthly_price) || null;
    }
    if (sanitizedBody.upcoming_price_effective_date !== undefined && !sanitizedBody.upcoming_price_effective_date) {
      sanitizedBody.upcoming_price_effective_date = null;
    }
    if (Object.prototype.hasOwnProperty.call(sanitizedBody, 'account_manager')) {
      const assignment = await resolveAccountManagerAssignment(supabaseAdmin, sanitizedBody.account_manager as string | null | undefined);
      sanitizedBody.account_manager = assignment.accountManager;
      sanitizedBody.account_manager_profile_id = assignment.accountManagerProfileId;
    }

    // Sync price to Stripe if subscription exists and price has changed
    const nextPricingStatus = (sanitizedBody.pricing_status as string | undefined) || existingProfile.pricing_status || 'fixed';
    const nextMonthlyPrice = Number(sanitizedBody.monthly_price !== undefined ? sanitizedBody.monthly_price : existingProfile.monthly_price) || 0;
    const currentMonthlyPrice = Number(existingProfile.monthly_price) || 0;
    const hasActiveStripeSubscription = Boolean(existingProfile.stripe_subscription_id);
    const monthlyPriceChanged = sanitizedBody.monthly_price !== undefined && nextMonthlyPrice !== currentMonthlyPrice;
    const nextUpcomingPrice = Number(sanitizedBody.upcoming_monthly_price !== undefined ? sanitizedBody.upcoming_monthly_price : existingProfile.upcoming_monthly_price) || 0;
    const nextUpcomingEffectiveDate = (sanitizedBody.upcoming_price_effective_date !== undefined ? sanitizedBody.upcoming_price_effective_date : existingProfile.upcoming_price_effective_date) as string | null | undefined;
    const today = new Date().toISOString().slice(0, 10);
    const upcomingDueNow = Boolean(nextUpcomingPrice > 0 && nextUpcomingEffectiveDate && nextUpcomingEffectiveDate <= today);

    if (hasActiveStripeSubscription && nextPricingStatus === 'unknown') {
      return NextResponse.json(
        { error: 'Aktiv Stripe-prenumeration kan inte ha "pris ej satt". Avsluta eller pausa abonnemang forst.' },
        { status: 400 }
      );
    }

    if (hasActiveStripeSubscription && nextPricingStatus === 'fixed' && (upcomingDueNow || (monthlyPriceChanged && nextMonthlyPrice > 0))) {
      if (!stripe) return NextResponse.json({ error: 'Stripe is not configured on server' }, { status: 503 });

      const syncedPrice = upcomingDueNow ? nextUpcomingPrice : nextMonthlyPrice;
      await applyPriceToSubscription({
        stripeClient: stripe,
        subscriptionId: String(existingProfile.stripe_subscription_id),
        monthlyPriceSek: syncedPrice,
        source: upcomingDueNow ? 'scheduled_upcoming' : 'admin_manual',
        supabaseAdmin,
      });

      if (upcomingDueNow) {
        sanitizedBody.monthly_price = syncedPrice;
        sanitizedBody.pricing_status = 'fixed';
        sanitizedBody.upcoming_monthly_price = null;
        sanitizedBody.upcoming_price_effective_date = null;
      }
    }

    const { data, error } = await supabaseAdmin
      .from('customer_profiles')
      .update(sanitizedBody)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(buildCustomerPayload(data));
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('[API] PATCH error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await validateApiRequest(request, ['admin']);
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Profile ID is required' }, { status: 400 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { error } = await supabaseAdmin
      .from('customer_profiles')
      .delete()
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, message: 'Profile deleted successfully' });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
