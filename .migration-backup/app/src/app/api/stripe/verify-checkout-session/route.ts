import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/dynamic-config';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getAppUrl } from '@/lib/url/public';

// Email sending with Resend
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'LeTrend <onboarding@resend.dev>';
const APP_URL = getAppUrl();

async function sendPaymentConfirmation(email: string, customerName: string, amount: number) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not configured - skipping email');
    return false;
  }

  const formattedAmount = new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
  }).format(amount / 100);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 520px; margin: 0 auto; background: #FAF8F5;">
    <div style="height: 4px; background: linear-gradient(90deg, #6B4423 0%, #8B5A2B 50%, #6B4423 100%);"></div>

    <div style="padding: 40px 32px 24px; text-align: center;">
      <div style="display: inline-block; width: 56px; height: 56px; background: linear-gradient(135deg, #6B4423 0%, #4A2F18 100%); border-radius: 16px; line-height: 56px; color: #FAF8F5; font-family: Georgia, serif; font-style: italic; font-size: 24px;">
        Le
      </div>
    </div>

    <div style="text-align: center; padding: 0 32px;">
      <span style="color: #C4A77D; font-size: 14px; letter-spacing: 4px;">✦ · ✦ · ✦</span>
    </div>

    <div style="padding: 32px 40px;">
      <h1 style="font-family: Georgia, serif; font-size: 26px; font-weight: 400; color: #1A1612; text-align: center; margin: 0 0 20px; line-height: 1.3;">
        Tack för din betalning!
      </h1>

      <p style="color: #5D4D3D; font-size: 16px; line-height: 1.7; text-align: center; margin: 0 0 32px;">
        Hej ${customerName}! Ditt avtal är nu aktivt och du har full tillgång till LeTrend.
      </p>

      <div style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #E8E0D8;">
          <span style="color: #5D4D3D; font-size: 14px;">Belopp</span>
          <span style="color: #1A1612; font-weight: 600; font-size: 14px;">${formattedAmount}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 10px 0;">
          <span style="color: #5D4D3D; font-size: 14px;">Status</span>
          <span style="color: #2E7D32; font-weight: 600; font-size: 14px;">Betald ✓</span>
        </div>
      </div>

      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${APP_URL}/billing" style="display: inline-block; padding: 16px 40px; background: #6B4423; color: #FAF8F5; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
          Se mina fakturor
        </a>
      </div>
    </div>

    <div style="padding: 24px 32px 32px; text-align: center; border-top: 1px solid #E8E0D8; margin: 0 32px;">
      <p style="margin: 0 0 8px;">
        <a href="mailto:hej@letrend.se" style="color: #6B4423; font-size: 13px; text-decoration: none; font-weight: 500;">hej@letrend.se</a>
      </p>
      <p style="color: #A89080; font-size: 13px; margin: 0;">LeTrend AB</p>
    </div>
  </div>
</body>
</html>
`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: email,
        subject: 'Betalningsbekräftelse - LeTrend',
        html,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Resend error:', error);
      return false;
    }

    console.log(`Payment confirmation email sent to ${email}`);
    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
}

export async function GET(req: NextRequest) {
  try {
    // Authenticate the request
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {},
        },
      }
    );
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessionId = req.nextUrl.searchParams.get('session_id');

    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
    }

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
    }

    // Retrieve the checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'customer', 'line_items'],
    });

    // Verify the authenticated user owns this checkout session
    const sessionEmail = (session.customer_email || '').trim().toLowerCase();
    const userEmail = (user.email || '').trim().toLowerCase();
    const profileId = session.metadata?.profile_id;

    let ownsSession = sessionEmail.length > 0 && sessionEmail === userEmail;

    if (!ownsSession && profileId) {
      const supabaseCheck = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const { data: profileLink } = await supabaseCheck
        .from('profiles')
        .select('matching_data')
        .eq('id', user.id)
        .maybeSingle();

      const matchingData = profileLink?.matching_data as Record<string, unknown> | null;
      const linkedId = typeof matchingData?.customer_profile_id === 'string'
        ? matchingData.customer_profile_id
        : null;
      ownsSession = linkedId === profileId;
    }

    if (!ownsSession) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let customerName = '';
    let customerEmail = session.customer_email || '';
    const amountTotal = session.amount_total || 0;

    // Get customer name from profile if we have profile_id
    if (session.metadata?.profile_id) {
      const { data: profile } = await supabase
        .from('customer_profiles')
        .select('business_name, contact_email')
        .eq('id', session.metadata.profile_id)
        .single();

      if (profile) {
        customerName = profile.business_name || '';
        customerEmail = profile.contact_email || customerEmail;
      }
    }

    // Fallback to Stripe customer name if no profile
    if (
      !customerName &&
      typeof session.customer === 'object' &&
      session.customer &&
      !('deleted' in session.customer && session.customer.deleted)
    ) {
      customerName = session.customer.name || '';
    }

    // Update customer profile if we have metadata
    if (session.metadata?.profile_id && session.subscription) {
      try {
        const subscriptionId = typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription.id;

        const customerId = typeof session.customer === 'string'
          ? session.customer
          : session.customer?.id;

        await supabase
          .from('customer_profiles')
          .update({
            stripe_subscription_id: subscriptionId,
            stripe_customer_id: customerId,
            status: 'active',
            activated_at: new Date().toISOString(),
          })
          .eq('id', session.metadata.profile_id);

        // Update customer preferred_locales based on billing country
        if (customerId && stripe) {
          const customerDetails = session.customer_details;
          const billingCountry = customerDetails?.address?.country;

          // Swedish for Sweden, English for others
          const preferredLocale = billingCountry === 'SE' ? 'sv' : 'en';

          await stripe.customers.update(customerId, {
            preferred_locales: [preferredLocale],
          });
          console.log(`Updated customer ${customerId} locale to ${preferredLocale} (country: ${billingCountry})`);
        }
      } catch (e) {
        console.error('Error updating customer profile:', e);
      }
    }

    // Send confirmation email
    if (customerEmail && session.payment_status === 'paid') {
      await sendPaymentConfirmation(customerEmail, customerName || 'kund', amountTotal);
    }

    return NextResponse.json({
      status: session.status,
      paymentStatus: session.payment_status,
      customerName,
      subscriptionId: typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id,
    });
  } catch (error) {
    console.error('Error verifying checkout session:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to verify session' },
      { status: 500 }
    );
  }
}
