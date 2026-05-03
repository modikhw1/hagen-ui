import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createSupabaseAdmin, createSupabaseUserClient } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

const router = Router();

function getStripe() {
  const key = process.env['STRIPE_SECRET_KEY'] ?? process.env['STRIPE_LIVE_SECRET_KEY'] ?? process.env['STRIPE_TEST_SECRET_KEY'];
  if (!key) return null;
  const Stripe = require('stripe');
  return new Stripe(key, { apiVersion: '2024-06-20', typescript: true });
}

// GET /api/stripe/customer-invoices
router.get('/customer-invoices', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const userEmail = req.user!.email;
    const supabase = createSupabaseAdmin();
    let stripeCustomerId: string | null = null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, matching_data')
      .eq('id', userId)
      .single();

    stripeCustomerId = (profile as Record<string, unknown> | null)?.stripe_customer_id as string | null ?? null;

    if (!stripeCustomerId) {
      const customerProfileId = (profile?.matching_data as Record<string, unknown> | null)?.customer_profile_id as string | undefined;
      if (customerProfileId) {
        const { data: cp } = await supabase
          .from('customer_profiles')
          .select('stripe_customer_id')
          .eq('id', customerProfileId)
          .single();
        stripeCustomerId = (cp as Record<string, unknown> | null)?.stripe_customer_id as string | null ?? null;
      }
    }

    if (!stripeCustomerId && userEmail) {
      const { data: cp } = await supabase
        .from('customer_profiles')
        .select('stripe_customer_id')
        .eq('contact_email', userEmail)
        .single();
      stripeCustomerId = (cp as Record<string, unknown> | null)?.stripe_customer_id as string | null ?? null;
    }

    if (!stripeCustomerId) {
      res.json({ invoices: [] });
      return;
    }

    const stripe = getStripe();
    if (!stripe) {
      res.json({ invoices: [], error: 'Stripe not configured' });
      return;
    }

    const invoices = await stripe.invoices.list({ customer: stripeCustomerId, limit: 20 });
    const finalized = invoices.data.filter((inv: Record<string, unknown>) => inv.status !== 'draft');
    res.json({
      invoices: finalized.map((inv: Record<string, unknown>) => ({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        created: inv.created,
        dueDate: inv.due_date ? new Date((inv.due_date as number) * 1000).toISOString() : null,
        amount: inv.amount_due,
        currency: inv.currency,
        hostedInvoiceUrl: inv.hosted_invoice_url,
        invoicePdf: inv.invoice_pdf,
      })),
    });
  } catch (err) {
    logger.error(err, 'stripe customer-invoices error');
    res.status(500).json({ error: 'Kunde inte hämta fakturor' });
  }
});

// GET /api/stripe/pending-agreement
router.get('/pending-agreement', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const supabase = createSupabaseAdmin();
    const profileId = req.query['profileId'] as string | undefined;

    const { data: profile } = await supabase
      .from('profiles')
      .select('matching_data')
      .eq('id', userId)
      .maybeSingle();

    const customerProfileId = profileId ??
      ((profile?.matching_data as Record<string, unknown> | null)?.customer_profile_id as string | undefined);

    if (!customerProfileId) {
      res.json({ hasPendingAgreement: false });
      return;
    }

    const { data: cp } = await supabase
      .from('customer_profiles')
      .select('status, stripe_customer_id, stripe_subscription_id, contact_email, business_name, monthly_price, contract_start_date')
      .eq('id', customerProfileId)
      .maybeSingle();

    if (!cp) {
      res.json({ hasPendingAgreement: false });
      return;
    }

    const status = (cp as Record<string, unknown>).status as string | null;
    const hasPending = status === 'agreement_sent' || status === 'pending_payment' || status === 'invited';

    res.json({
      hasPendingAgreement: hasPending,
      profile: hasPending ? {
        id: customerProfileId,
        status,
        contactEmail: (cp as Record<string, unknown>).contact_email,
        businessName: (cp as Record<string, unknown>).business_name,
        monthlyPrice: (cp as Record<string, unknown>).monthly_price,
        contractStartDate: (cp as Record<string, unknown>).contract_start_date,
        stripeCustomerId: (cp as Record<string, unknown>).stripe_customer_id,
        stripeSubscriptionId: (cp as Record<string, unknown>).stripe_subscription_id,
      } : null,
    });
  } catch (err) {
    logger.error(err, 'stripe pending-agreement error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/stripe/check-payment
router.post('/check-payment', requireAuth, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const subscriptionId = typeof body.subscriptionId === 'string' ? body.subscriptionId : null;
    const email = typeof body.email === 'string' ? body.email : null;

    if (!subscriptionId && !email) {
      res.status(400).json({ error: 'subscriptionId or email required' });
      return;
    }

    const stripe = getStripe();
    if (!stripe) {
      res.status(503).json({ error: 'Stripe not configured' });
      return;
    }

    const supabase = createSupabaseAdmin();
    let profile: Record<string, unknown> | null = null;

    if (subscriptionId) {
      const { data } = await supabase
        .from('customer_profiles')
        .select('id, status, stripe_customer_id')
        .eq('stripe_subscription_id', subscriptionId)
        .maybeSingle();
      profile = data as Record<string, unknown> | null;
    }

    if (!profile && email) {
      const { data } = await supabase
        .from('customer_profiles')
        .select('id, status, stripe_customer_id')
        .eq('contact_email', email)
        .maybeSingle();
      profile = data as Record<string, unknown> | null;
    }

    if (!profile) {
      res.status(404).json({ error: 'Kundprofil hittades inte' });
      return;
    }

    let subscription = null;
    if (subscriptionId) {
      try {
        subscription = await stripe.subscriptions.retrieve(subscriptionId);
      } catch {
        subscription = null;
      }
    }

    res.json({
      status: (profile.status as string) ?? 'unknown',
      profileId: profile.id,
      subscription: subscription ? {
        id: (subscription as Record<string, unknown>).id,
        status: (subscription as Record<string, unknown>).status,
        currentPeriodEnd: (subscription as Record<string, unknown>).current_period_end,
      } : null,
    });
  } catch (err) {
    logger.error(err, 'stripe check-payment error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/stripe/create-checkout-session
router.post('/create-checkout-session', requireAuth, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const profileId = typeof body.profileId === 'string' ? body.profileId.trim() : '';
    if (!profileId) {
      res.status(400).json({ error: 'profileId is required' });
      return;
    }

    const stripe = getStripe();
    if (!stripe) {
      res.status(503).json({ error: 'Stripe not configured' });
      return;
    }

    const supabase = createSupabaseAdmin();
    const { data: cp, error: cpError } = await supabase
      .from('customer_profiles')
      .select('id, business_name, contact_email, monthly_price, stripe_customer_id, subscription_interval, contract_start_date')
      .eq('id', profileId)
      .single();

    if (cpError || !cp) {
      res.status(404).json({ error: 'Kundprofil hittades inte' });
      return;
    }

    const profile = cp as Record<string, unknown>;
    let stripeCustomerId = profile.stripe_customer_id as string | null;

    if (!stripeCustomerId && profile.contact_email) {
      const customers = await stripe.customers.list({ email: profile.contact_email as string, limit: 1 });
      if (customers.data.length > 0) {
        stripeCustomerId = customers.data[0].id;
      }
    }

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: profile.contact_email as string,
        name: profile.business_name as string,
        metadata: { profile_id: profileId },
      });
      stripeCustomerId = customer.id;
      await supabase.from('customer_profiles').update({ stripe_customer_id: stripeCustomerId }).eq('id', profileId);
    }

    const monthlyPrice = (profile.monthly_price as number) ?? 0;
    const unitAmount = Math.round(monthlyPrice);

    const origin = req.headers.origin ?? `https://${req.headers.host}`;
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{
        price_data: {
          currency: 'sek',
          product_data: { name: `LeTrend – ${profile.business_name ?? 'Prenumeration'}` },
          unit_amount: unitAmount,
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      success_url: `${origin}/onboarding/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/onboarding/agreement?profileId=${profileId}`,
      metadata: { profile_id: profileId },
    });

    res.json({ clientSecret: session.client_secret ?? '', sessionId: session.id });
  } catch (err) {
    logger.error(err, 'stripe create-checkout-session error');
    res.status(500).json({ error: 'Kunde inte skapa checkout-session' });
  }
});

// GET /api/stripe/invoice
router.get('/invoice', requireAuth, async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      res.status(503).json({ error: 'Stripe not configured' });
      return;
    }
    const invoiceId = req.query['id'] as string | undefined;
    const subscriptionId = req.query['subscriptionId'] as string | undefined;
    if (!invoiceId && !subscriptionId) {
      res.status(400).json({ error: 'invoiceId or subscriptionId required' });
      return;
    }

    let invoice: Record<string, unknown> | null = null;
    if (invoiceId) {
      invoice = await stripe.invoices.retrieve(invoiceId);
    } else if (subscriptionId) {
      const list = await stripe.invoices.list({ subscription: subscriptionId, limit: 1 });
      invoice = list.data[0] ?? null;
    }

    if (!invoice) {
      res.status(404).json({ error: 'Faktura hittades inte' });
      return;
    }

    res.json({
      invoice: {
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        amountDue: invoice.amount_due,
        amountPaid: invoice.amount_paid,
        currency: invoice.currency,
        created: invoice.created,
        dueDate: invoice.due_date,
        hostedInvoiceUrl: invoice.hosted_invoice_url,
        invoicePdf: invoice.invoice_pdf,
        subscriptionId: invoice.subscription,
      },
    });
  } catch (err) {
    logger.error(err, 'stripe invoice GET error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/stripe/invoice/:subscriptionId
router.get('/invoice/:subscriptionId', requireAuth, async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      res.status(503).json({ error: 'Stripe not configured' });
      return;
    }
    const { subscriptionId } = req.params;
    const list = await stripe.invoices.list({ subscription: subscriptionId, limit: 10 });
    res.json({ invoices: list.data.map((inv: Record<string, unknown>) => ({
      id: inv.id,
      number: inv.number,
      status: inv.status,
      amountDue: inv.amount_due,
      currency: inv.currency,
      created: inv.created,
      hostedInvoiceUrl: inv.hosted_invoice_url,
    })) });
  } catch (err) {
    logger.error(err, 'stripe invoice by subscriptionId error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/stripe/checkout
router.get('/checkout', requireAuth, async (req, res) => {
  try {
    const sessionId = req.query['session_id'] as string | undefined;
    if (!sessionId) {
      res.status(400).json({ error: 'session_id required' });
      return;
    }
    const stripe = getStripe();
    if (!stripe) {
      res.status(503).json({ error: 'Stripe not configured' });
      return;
    }
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    res.json({ session: { id: (session as Record<string, unknown>).id, status: (session as Record<string, unknown>).status, paymentStatus: (session as Record<string, unknown>).payment_status } });
  } catch (err) {
    logger.error(err, 'stripe checkout GET error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
