import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe/dynamic-config';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { z } from 'zod';

const checkoutRequestSchema = z.object({
  profileId: z.string().trim().min(1).max(128),
});

const checkoutResponseSchema = z.object({
  clientSecret: z.string().min(1),
  sessionId: z.string().min(1),
});

interface ContractProfile {
  id: string;
  business_name: string | null;
  contact_email: string | null;
  monthly_price: number | null;
  pricing_status: 'fixed' | 'unknown' | null;
  subscription_interval: 'month' | 'quarter' | 'year' | null;
  invoice_text: string | null;
  contract_start_date: string | null;
  billing_day_of_month: number | null;
  first_invoice_behavior: 'prorated' | 'full' | 'free_until_anchor' | null;
  discount_type: 'none' | 'percent' | 'amount' | 'free_months' | null;
  discount_value: number | null;
  discount_duration_months: number | null;
  discount_start_date: string | null;
  discount_end_date: string | null;
  upcoming_monthly_price: number | null;
  upcoming_price_effective_date: string | null;
}

async function resolveAuthenticatedUser(req: NextRequest) {
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const authHeader = req.headers.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (bearer) {
    return anonClient.auth.getUser(bearer);
  }

  const cookieStore = await cookies();
  const cookieClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  );
  return cookieClient.auth.getUser();
}

function toIntervalParts(interval?: string | null) {
  const normalized = interval || 'month';
  if (normalized === 'quarter') {
    return { interval: 'month' as const, intervalCount: 3 };
  }
  if (normalized === 'year') {
    return { interval: 'year' as const, intervalCount: 1 };
  }
  return { interval: 'month' as const, intervalCount: 1 };
}

function toUtcDate(dateString: string) {
  return new Date(`${dateString}T12:00:00Z`);
}

function nextBillingAnchor(reference: Date, billingDayRaw?: number | null) {
  const billingDay = Math.max(1, Math.min(28, Number(billingDayRaw) || 25));
  const year = reference.getUTCFullYear();
  const month = reference.getUTCMonth();

  let anchor = new Date(Date.UTC(year, month, billingDay, 12, 0, 0));
  if (anchor.getTime() <= reference.getTime()) {
    anchor = new Date(Date.UTC(year, month + 1, billingDay, 12, 0, 0));
  }
  return anchor;
}

function isDiscountActive(profile: ContractProfile) {
  const type = profile.discount_type || 'none';
  if (type === 'none') return false;

  const today = new Date().toISOString().slice(0, 10);
  const startOk = !profile.discount_start_date || profile.discount_start_date <= today;
  const endOk = !profile.discount_end_date || profile.discount_end_date >= today;
  return startOk && endOk;
}

function resolveMonthlyPrice(profile: ContractProfile) {
  const basePrice = Number(profile.monthly_price) || 0;
  const upcomingPrice = Number(profile.upcoming_monthly_price) || 0;
  const upcomingDate = profile.upcoming_price_effective_date;

  if (!upcomingDate || upcomingPrice <= 0) {
    return {
      effectivePrice: basePrice,
      source: 'base' as const,
      shouldPromoteUpcoming: false,
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  if (upcomingDate <= today) {
    return {
      effectivePrice: upcomingPrice,
      source: 'upcoming' as const,
      shouldPromoteUpcoming: true,
    };
  }

  return {
    effectivePrice: basePrice,
    source: 'base' as const,
    shouldPromoteUpcoming: false,
  };
}

async function findOrCreateCoupon(
  stripeClient: Stripe,
  params: Stripe.CouponCreateParams & { id: string }
) {
  try {
    return await stripeClient.coupons.retrieve(params.id);
  } catch {
    return stripeClient.coupons.create(params);
  }
}

async function createContractCoupon(
  stripeClient: Stripe,
  profile: ContractProfile,
  basePriceOre: number,
  usingProration: boolean
) {
  if (!isDiscountActive(profile)) return null;

  const type = profile.discount_type || 'none';
  const rawValue = Number(profile.discount_value) || 0;
  const durationMonths = Math.max(1, Number(profile.discount_duration_months) || 1);

  if (type === 'none') return null;

  const duration: Stripe.CouponCreateParams.Duration = durationMonths === 1 ? 'once' : 'repeating';
  const durationInMonths = duration === 'repeating' ? durationMonths : undefined;
  // Deterministic coupon ID based on profile discount parameters — prevents orphan coupons
  const couponIdBase = `lt_${profile.id}_${type}_${rawValue}_${durationMonths}`;

  if (type === 'percent' && rawValue > 0) {
    const percentOff = Math.max(0, Math.min(100, rawValue));
    return findOrCreateCoupon(stripeClient, {
      id: couponIdBase,
      percent_off: percentOff,
      duration,
      duration_in_months: durationInMonths,
      name: `LeTrend avtalsrabatt (${percentOff}%)`,
    });
  }

  if (type === 'free_months' && rawValue > 0) {
    const freeMonths = Math.max(1, rawValue);
    return findOrCreateCoupon(stripeClient, {
      id: couponIdBase,
      percent_off: 100,
      duration: freeMonths === 1 ? 'once' : 'repeating',
      duration_in_months: freeMonths > 1 ? freeMonths : undefined,
      name: `LeTrend fri period (${freeMonths} man)`,
    });
  }

  if (type === 'amount' && rawValue > 0) {
    if (usingProration && basePriceOre > 0) {
      const percentOff = Math.max(1, Math.min(100, Math.round((rawValue * 100) / (basePriceOre / 100))));
      return findOrCreateCoupon(stripeClient, {
        id: `${couponIdBase}_pct`,
        percent_off: percentOff,
        duration,
        duration_in_months: durationInMonths,
        name: `LeTrend rabatt (~${rawValue} kr)`,
      });
    }

    return findOrCreateCoupon(stripeClient, {
      id: couponIdBase,
      amount_off: rawValue * 100,
      currency: 'sek',
      duration,
      duration_in_months: durationInMonths,
      name: `LeTrend rabatt (${rawValue} kr)`,
    });
  }

  return null;
}

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
  const json = (body: unknown, status = 200) =>
    NextResponse.json(body, { status, headers: { 'x-request-id': requestId } });

  try {
    const parsedBody = checkoutRequestSchema.safeParse(await req.json());
    if (!parsedBody.success) {
      return json(
        {
          error: 'Invalid checkout payload',
          requestId,
          issues: parsedBody.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
        400
      );
    }

    const { profileId } = parsedBody.data;

    if (!stripe) {
      return json({ error: 'Stripe not configured', requestId }, 500);
    }

    const { data: { user }, error: userError } = await resolveAuthenticatedUser(req);
    if (userError || !user) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabaseAdmin
      .from('customer_profiles')
      .select(`
        id,
        business_name,
        contact_email,
        monthly_price,
        pricing_status,
        subscription_interval,
        invoice_text,
        contract_start_date,
        billing_day_of_month,
        first_invoice_behavior,
        discount_type,
        discount_value,
        discount_duration_months,
        discount_start_date,
        discount_end_date,
        upcoming_monthly_price,
        upcoming_price_effective_date
      `)
      .eq('id', profileId)
      .single();

    if (error || !data) {
      return json({ error: 'Customer profile not found', requestId }, 404);
    }

    const contractProfile = data as ContractProfile;

    // Verify the authenticated user owns this profile
    const { data: profileLink } = await supabaseAdmin
      .from('profiles')
      .select('matching_data')
      .eq('id', user.id)
      .maybeSingle();

    const matchingData = (profileLink as Record<string, unknown> | null)?.matching_data as Record<string, unknown> | undefined;
    const linkedProfileId = typeof matchingData?.customer_profile_id === 'string'
      ? matchingData.customer_profile_id
      : null;

    const normalizedUserEmail = (user.email || '').trim().toLowerCase();
    const normalizedContractEmail = (contractProfile.contact_email || '').trim().toLowerCase();
    const ownsProfile =
      linkedProfileId === profileId ||
      (normalizedUserEmail.length > 0 && normalizedUserEmail === normalizedContractEmail);

    if (!ownsProfile) {
      return json({ error: 'Forbidden: profile does not belong to current user', requestId }, 403);
    }

    const pricingStatus = contractProfile.pricing_status || 'fixed';
    if (pricingStatus === 'unknown') {
      return json(
        { error: 'Pris ar inte satt for kunden annu. Satt avtalspris i admin innan checkout.', requestId },
        400
      );
    }

    const email = contractProfile.contact_email || user.email;
    const customerName = contractProfile.business_name || undefined;
    const finalInvoiceText = contractProfile.invoice_text || '';
    const selectedInterval = contractProfile.subscription_interval || 'month';

    const priceResolution = resolveMonthlyPrice(contractProfile);

    // Promote upcoming price if it has become effective
    if (priceResolution.shouldPromoteUpcoming) {
      await supabaseAdmin
        .from('customer_profiles')
        .update({
          monthly_price: priceResolution.effectivePrice,
          upcoming_monthly_price: null,
          upcoming_price_effective_date: null,
        })
        .eq('id', profileId);
    }

    const priceOre = Math.round(priceResolution.effectivePrice * 100);

    if (!email || priceOre <= 0) {
      return json({ error: 'Missing required pricing information', requestId }, 400);
    }

    // Find or create Stripe customer
    let customerId: string;
    const existingCustomers = await stripe.customers.list({ email, limit: 1 });
    if (existingCustomers.data.length > 0) {
      customerId = existingCustomers.data[0].id;
    } else {
      const newCustomer = await stripe.customers.create({
        email,
        name: customerName,
        address: { country: 'SE' },
        preferred_locales: ['sv'],
        metadata: { profile_id: profileId || '' },
      });
      customerId = newCustomer.id;
    }

    const { interval, intervalCount } = toIntervalParts(selectedInterval);

    // Reuse existing price with matching parameters to avoid orphan prices in Stripe
    let price: { id: string };
    const existingPrices = await stripe.prices.search({
      query: `active:"true" currency:"sek" type:"recurring"`,
      limit: 100,
    });
    const matchingPrice = existingPrices.data.find(
      (p) =>
        p.unit_amount === priceOre &&
        p.recurring?.interval === interval &&
        p.recurring?.interval_count === intervalCount
    );

    if (matchingPrice) {
      price = matchingPrice;
    } else {
      price = await stripe.prices.create({
        unit_amount: priceOre,
        currency: 'sek',
        tax_behavior: 'exclusive',
        recurring: { interval, interval_count: intervalCount },
        product_data: {
          name: 'LeTrend Prenumeration',
          tax_code: 'txcd_10000000',
        },
      });
    }

    const origin = req.headers.get('origin') || 'http://localhost:3000';

    const firstInvoiceBehavior = contractProfile.first_invoice_behavior || 'prorated';
    const now = new Date();
    const contractStart = contractProfile.contract_start_date
      ? toUtcDate(contractProfile.contract_start_date)
      : now;
    const anchorReference = contractStart > now ? contractStart : now;
    const anchorDate = nextBillingAnchor(anchorReference, contractProfile.billing_day_of_month);

    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
      description: finalInvoiceText || 'LeTrend Prenumeration',
      metadata: {
        profile_id: profileId || '',
        invoice_text: finalInvoiceText || '',
        first_invoice_behavior: firstInvoiceBehavior,
        billing_day_of_month: String(contractProfile.billing_day_of_month || 25),
        effective_price_source: priceResolution.source,
      },
      invoice_settings: { issuer: { type: 'self' } },
    };

    const useAnchor = firstInvoiceBehavior === 'prorated' || firstInvoiceBehavior === 'free_until_anchor';
    if (useAnchor) {
      subscriptionData.billing_cycle_anchor = Math.floor(anchorDate.getTime() / 1000);
      subscriptionData.proration_behavior =
        firstInvoiceBehavior === 'free_until_anchor' ? 'none' : 'create_prorations';
    }

    const contractCoupon = await createContractCoupon(stripe, contractProfile, priceOre, firstInvoiceBehavior === 'prorated');

    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: price.id, quantity: 1 }],
      locale: 'sv',
      return_url: `${origin}/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
      custom_text: {
        submit: { message: 'Din prenumeration aktiveras direkt efter betalning.' },
      },
      allow_promotion_codes: true,
      billing_address_collection: 'required',
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      customer_update: { name: 'auto', address: 'auto' },
      subscription_data: subscriptionData,
      discounts: contractCoupon ? [{ coupon: contractCoupon.id }] : undefined,
      metadata: {
        profile_id: profileId || '',
        customer_email: email,
        pricing_status: pricingStatus,
        first_invoice_behavior: firstInvoiceBehavior,
        effective_price_source: priceResolution.source,
      },
      payment_method_types: ['card', 'klarna'],
    });

    const responseBody = { clientSecret: session.client_secret, sessionId: session.id };
    const parsedResponse = checkoutResponseSchema.safeParse(responseBody);
    if (!parsedResponse.success) {
      console.error(`[${requestId}] Checkout response validation failed:`, parsedResponse.error.issues);
      return json({ error: 'Internal response validation failed', requestId }, 500);
    }

    return json(parsedResponse.data);
  } catch (error) {
    console.error(`[${requestId}] Error creating checkout session:`, error);
    return json(
      { error: error instanceof Error ? error.message : 'Failed to create checkout session', requestId },
      500
    );
  }
}
