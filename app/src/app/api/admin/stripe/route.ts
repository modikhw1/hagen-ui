import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe/config';
import { getServerSupabase } from '@/lib/supabase/server';
import { verifyAdminAccess } from '@/lib/auth/admin';

/**
 * ADMIN STRIPE API
 *
 * Actions:
 * - create-customer: Skapa kund med bara email
 * - create-agreement: Skapa avtal/subscription med valfritt pris
 * - send-invoice: Skapa och skicka faktura
 * - list-customers: Lista alla kunder
 * - get-customer: Hämta en kund med alla detaljer
 * - update-customer: Uppdatera kundinfo
 * - cancel-subscription: Avsluta subscription
 * - create-one-time-invoice: Skapa engångsfaktura
 */

export async function POST(request: NextRequest) {
  // Check Stripe availability
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  // Verify admin access using JWT
  const auth = await verifyAdminAccess();
  if (!auth.isAdmin) {
    // 401 for auth failures, 403 for authorization failures
    const isAuthFailure = auth.error === 'No access token' || auth.error === 'Invalid session';
    return NextResponse.json(
      { error: auth.error || 'Unauthorized' },
      { status: isAuthFailure ? 401 : 403 }
    );
  }

  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'create-customer':
        return await createCustomer(body);

      case 'create-agreement':
        return await createAgreement(body);

      case 'send-invoice':
        return await sendInvoice(body);

      case 'create-one-time-invoice':
        return await createOneTimeInvoice(body);

      case 'update-customer':
        return await updateCustomer(body);

      case 'cancel-subscription':
        return await cancelSubscription(body);

      case 'get-payment-links':
        return await getPaymentLinks(body);

      case 'create-user-account':
        return await createUserAccount(body);

      case 'full-onboard':
        return await fullOnboard(body);

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error('Admin Stripe API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Check Stripe availability
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  // Verify admin access using JWT
  const auth = await verifyAdminAccess();
  if (!auth.isAdmin) {
    // 401 for auth failures, 403 for authorization failures
    const isAuthFailure = auth.error === 'No access token' || auth.error === 'Invalid session';
    return NextResponse.json(
      { error: auth.error || 'Unauthorized' },
      { status: isAuthFailure ? 401 : 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    switch (action) {
      case 'list-customers':
        return await listCustomers(searchParams);

      case 'get-customer':
        return await getCustomer(searchParams);

      case 'list-subscriptions':
        return await listSubscriptions(searchParams);

      case 'list-invoices':
        return await listInvoices(searchParams);

      case 'list-products':
        return await listProducts();

      case 'dashboard-summary':
        return await getDashboardSummary();

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error('Admin Stripe API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// ============================================
// POST Actions
// ============================================

/**
 * Skapa kund med bara email (och optional metadata)
 */
async function createCustomer(body: {
  email: string;
  name?: string;
  company?: string;
  phone?: string;
  notes?: string;
}) {
  const { email, name, company, phone, notes } = body;

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  // Check if customer already exists
  const existing = await stripe.customers.list({ email, limit: 1 });
  if (existing.data.length > 0) {
    return NextResponse.json({
      success: true,
      customer: existing.data[0],
      message: 'Customer already exists',
      existed: true,
    });
  }

  const customer = await stripe.customers.create({
    email,
    name: name || company || email.split('@')[0],
    phone,
    metadata: {
      company: company || '',
      notes: notes || '',
      created_by: 'admin_api',
      created_at: new Date().toISOString(),
    },
  });

  return NextResponse.json({
    success: true,
    customer,
    message: 'Customer created',
    existed: false,
    stripe_dashboard_url: `https://dashboard.stripe.com/customers/${customer.id}`,
  });
}

/**
 * Skapa avtal/subscription med valfritt pris
 */
async function createAgreement(body: {
  customer_id?: string;
  email?: string;
  price_sek: number;
  interval?: 'month' | 'year' | 'week' | 'day';
  product_name?: string;
  description?: string;
  trial_days?: number;
  send_invoice?: boolean;
  collection_method?: 'charge_automatically' | 'send_invoice';
  start_date?: string; // ISO date string for when billing should start
  billing_day?: number; // Day of month for recurring billing (1-28)
  org_number?: string;
  scope_items?: string[]; // Custom scope items for the agreement
}) {
  const {
    customer_id,
    email,
    price_sek,
    interval = 'month',
    product_name = 'LeTrend Avtal',
    description,
    trial_days = 0,
    collection_method = 'send_invoice',
    start_date,
    billing_day,
    org_number,
    scope_items,
  } = body;

  if (!price_sek) {
    return NextResponse.json({ error: 'price_sek is required' }, { status: 400 });
  }

  // Get or create customer
  let customerId = customer_id;
  if (!customerId && email) {
    const customerResult = await createCustomer({ email });
    const customerData = await customerResult.json();
    customerId = customerData.customer.id;
  }

  if (!customerId) {
    return NextResponse.json({ error: 'customer_id or email is required' }, { status: 400 });
  }

  // Create a price for this specific agreement
  const price = await stripe.prices.create({
    unit_amount: Math.round(price_sek * 100), // Convert to öre
    currency: 'sek',
    recurring: { interval },
    product_data: {
      name: product_name,
      metadata: {
        description: description || '',
        scope: scope_items ? scope_items.join('\n') : '',
        scope_items: scope_items ? JSON.stringify(scope_items) : '',
        org_number: org_number || '',
        created_by: 'admin_api',
      },
    },
  });

  // Create subscription
  const subscriptionParams: Stripe.SubscriptionCreateParams = {
    customer: customerId,
    items: [{ price: price.id }],
    collection_method,
    metadata: {
      created_by: 'admin_api',
      price_sek: price_sek.toString(),
      product_name,
      org_number: org_number || '',
      scope: scope_items ? scope_items.join('\n') : '',
    },
  };

  // Set start date if provided (billing_cycle_anchor)
  if (start_date) {
    const startTimestamp = Math.floor(new Date(start_date).getTime() / 1000);
    subscriptionParams.billing_cycle_anchor = startTimestamp;
    // Don't charge immediately if start date is in the future
    subscriptionParams.proration_behavior = 'none';
  }

  if (trial_days > 0) {
    subscriptionParams.trial_period_days = trial_days;
  }

  if (collection_method === 'send_invoice') {
    subscriptionParams.days_until_due = 14; // 14 dagars betalningsvillkor
  }

  const subscription = await stripe.subscriptions.create(subscriptionParams);

  // Calculate next billing date
  const billingAnchor = subscription.billing_cycle_anchor;
  const nextBillingDate = billingAnchor
    ? new Date(billingAnchor * 1000).toLocaleDateString('sv-SE')
    : 'Omedelbart';

  return NextResponse.json({
    success: true,
    subscription,
    price,
    customer_id: customerId,
    message: `Subscription created: ${price_sek} SEK/${interval}`,
    billing_starts: nextBillingDate,
    stripe_dashboard_url: `https://dashboard.stripe.com/subscriptions/${subscription.id}`,
  });
}

/**
 * Skicka faktura för en subscription
 */
async function sendInvoice(body: {
  subscription_id?: string;
  invoice_id?: string;
}) {
  const { subscription_id, invoice_id } = body;

  let invoice: Stripe.Invoice;

  if (invoice_id) {
    // Finalize and send existing invoice
    invoice = await stripe.invoices.retrieve(invoice_id);

    if (invoice.status === 'draft') {
      invoice = await stripe.invoices.finalizeInvoice(invoice_id);
    }

    if (invoice.status === 'open') {
      invoice = await stripe.invoices.sendInvoice(invoice_id);
    }
  } else if (subscription_id) {
    // Get latest invoice for subscription
    const invoices = await stripe.invoices.list({
      subscription: subscription_id,
      limit: 1,
    });

    if (invoices.data.length === 0) {
      return NextResponse.json({ error: 'No invoices found for subscription' }, { status: 404 });
    }

    invoice = invoices.data[0];

    if (invoice.status === 'draft') {
      invoice = await stripe.invoices.finalizeInvoice(invoice.id);
    }

    if (invoice.status === 'open') {
      invoice = await stripe.invoices.sendInvoice(invoice.id);
    }
  } else {
    return NextResponse.json({ error: 'subscription_id or invoice_id required' }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    invoice,
    message: `Invoice ${invoice.number} sent to ${invoice.customer_email}`,
    hosted_invoice_url: invoice.hosted_invoice_url,
    pdf_url: invoice.invoice_pdf,
  });
}

/**
 * Skapa engångsfaktura (inte subscription)
 */
async function createOneTimeInvoice(body: {
  customer_id?: string;
  email?: string;
  items: Array<{
    description: string;
    amount_sek: number;
    quantity?: number;
  }>;
  days_until_due?: number;
  send_immediately?: boolean;
  memo?: string;
}) {
  const {
    customer_id,
    email,
    items,
    days_until_due = 14,
    send_immediately = true,
    memo,
  } = body;

  if (!items || items.length === 0) {
    return NextResponse.json({ error: 'items array is required' }, { status: 400 });
  }

  // Get or create customer
  let customerId = customer_id;
  if (!customerId && email) {
    const customerResult = await createCustomer({ email });
    const customerData = await customerResult.json();
    customerId = customerData.customer.id;
  }

  if (!customerId) {
    return NextResponse.json({ error: 'customer_id or email is required' }, { status: 400 });
  }

  // Create invoice
  const invoice = await stripe.invoices.create({
    customer: customerId,
    collection_method: 'send_invoice',
    days_until_due,
    auto_advance: false,
    metadata: {
      created_by: 'admin_api',
      type: 'one_time',
    },
    custom_fields: memo ? [{ name: 'Meddelande', value: memo.slice(0, 30) }] : undefined,
  });

  // Add invoice items
  for (const item of items) {
    const quantity = item.quantity || 1;
    const totalAmount = Math.round(item.amount_sek * quantity * 100);
    await stripe.invoiceItems.create({
      customer: customerId,
      invoice: invoice.id,
      description: item.description,
      amount: totalAmount,
      currency: 'sek',
    });
  }

  // Finalize and optionally send
  let finalInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

  if (send_immediately) {
    finalInvoice = await stripe.invoices.sendInvoice(invoice.id);
  }

  return NextResponse.json({
    success: true,
    invoice: finalInvoice,
    message: send_immediately
      ? `Invoice sent to ${finalInvoice.customer_email}`
      : 'Invoice created (not sent)',
    hosted_invoice_url: finalInvoice.hosted_invoice_url,
    pdf_url: finalInvoice.invoice_pdf,
    stripe_dashboard_url: `https://dashboard.stripe.com/invoices/${finalInvoice.id}`,
  });
}

/**
 * Uppdatera kundinfo
 */
async function updateCustomer(body: {
  customer_id: string;
  email?: string;
  name?: string;
  phone?: string;
  metadata?: Record<string, string>;
}) {
  const { customer_id, email, name, phone, metadata } = body;

  if (!customer_id) {
    return NextResponse.json({ error: 'customer_id is required' }, { status: 400 });
  }

  const updateParams: Stripe.CustomerUpdateParams = {};
  if (email) updateParams.email = email;
  if (name) updateParams.name = name;
  if (phone) updateParams.phone = phone;
  if (metadata) updateParams.metadata = metadata;

  const customer = await stripe.customers.update(customer_id, updateParams);

  return NextResponse.json({
    success: true,
    customer,
    message: 'Customer updated',
  });
}

/**
 * Avsluta subscription
 */
async function cancelSubscription(body: {
  subscription_id: string;
  cancel_immediately?: boolean;
}) {
  const { subscription_id, cancel_immediately = false } = body;

  if (!subscription_id) {
    return NextResponse.json({ error: 'subscription_id is required' }, { status: 400 });
  }

  let subscription: Stripe.Subscription;

  if (cancel_immediately) {
    subscription = await stripe.subscriptions.cancel(subscription_id);
  } else {
    // Cancel at period end
    subscription = await stripe.subscriptions.update(subscription_id, {
      cancel_at_period_end: true,
    });
  }

  return NextResponse.json({
    success: true,
    subscription,
    message: cancel_immediately
      ? 'Subscription cancelled immediately'
      : 'Subscription will cancel at period end',
  });
}

/**
 * Get all payment links for a customer (to send via email)
 */
async function getPaymentLinks(body: {
  customer_id?: string;
  email?: string;
  base_url?: string;
}) {
  const { customer_id, email, base_url = 'http://localhost:3000' } = body;

  if (!customer_id && !email) {
    return NextResponse.json({ error: 'customer_id or email required' }, { status: 400 });
  }

  let customerId = customer_id;

  // Find customer by email if needed
  if (!customerId && email) {
    const customers = await stripe.customers.list({ email, limit: 1 });
    if (customers.data.length === 0) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }
    customerId = customers.data[0].id;
  }

  // Fetch subscriptions and invoices
  const [subscriptions, invoices] = await Promise.all([
    stripe.subscriptions.list({ customer: customerId!, limit: 5 }),
    stripe.invoices.list({ customer: customerId!, limit: 10 }),
  ]);

  const customer = await stripe.customers.retrieve(customerId!) as Stripe.Customer;

  // Generate links
  const links = {
    // Direct payment page (public, no login required)
    payment_page: `${base_url}/pay/${customerId}`,

    // Open invoices with payment links
    open_invoices: invoices.data
      .filter(inv => inv.status === 'open' || inv.status === 'draft')
      .map(inv => ({
        invoice_id: inv.id,
        invoice_number: inv.number,
        amount: (inv.amount_due || 0) / 100,
        currency: inv.currency,
        landing_page: `${base_url}/invoice/landing/${inv.id}`,
        stripe_hosted: inv.hosted_invoice_url,
        pdf: inv.invoice_pdf,
      })),

    // Paid invoices (for receipts)
    paid_invoices: invoices.data
      .filter(inv => inv.status === 'paid')
      .slice(0, 5)
      .map(inv => ({
        invoice_id: inv.id,
        invoice_number: inv.number,
        amount: (inv.amount_paid || 0) / 100,
        currency: inv.currency,
        landing_page: `${base_url}/invoice/landing/${inv.id}`,
        pdf: inv.invoice_pdf,
      })),

    // Active subscriptions
    active_subscriptions: subscriptions.data
      .filter(sub => sub.status === 'active')
      .map(sub => ({
        subscription_id: sub.id,
        status: sub.status,
        amount: sub.items.data.reduce((sum, i) => sum + ((i.price.unit_amount || 0) / 100), 0),
        currency: sub.items.data[0]?.price.currency || 'sek',
        current_period_end: (sub as Stripe.Subscription & { current_period_end?: number }).current_period_end
          ? new Date((sub as Stripe.Subscription & { current_period_end?: number }).current_period_end! * 1000).toISOString()
          : null,
      })),

    // Stripe dashboard link
    stripe_customer_url: `https://dashboard.stripe.com/customers/${customerId}`,
  };

  return NextResponse.json({
    success: true,
    customer: {
      id: customerId,
      email: customer.email,
      name: customer.name,
    },
    links,
    email_templates: {
      payment_reminder: `Hej ${customer.name || 'där'}!\n\nDu har en öppen faktura hos LeTrend.\n\nKlicka här för att betala: ${links.payment_page}\n\nVid frågor, kontakta faktura@letrend.se\n\nMvh,\nLeTrend`,
      invoice_link: links.open_invoices.length > 0
        ? `Hej ${customer.name || 'där'}!\n\nHär är din faktura: ${links.open_invoices[0].landing_page}\n\nMvh,\nLeTrend`
        : null,
    },
  });
}

/**
 * Create Supabase user account and send password reset (invite)
 */
async function createUserAccount(body: {
  email: string;
  name?: string;
  business_name?: string;
  stripe_customer_id?: string;
}) {
  const { email, name, business_name, stripe_customer_id } = body;

  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  const supabase = getServerSupabase();

  // Check if user already exists
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingProfile } = await (supabase as any)
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single();

  if (existingProfile) {
    // User exists - just update stripe_customer_id if provided
    if (stripe_customer_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('profiles')
        .update({ stripe_customer_id })
        .eq('id', existingProfile.id);
    }

    return NextResponse.json({
      success: true,
      user_exists: true,
      message: 'User already exists',
      profile_id: existingProfile.id,
    });
  }

  // Create user via admin API
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true, // Auto-confirm email
    user_metadata: {
      name: name || email.split('@')[0],
      business_name,
    },
  });

  if (authError) {
    console.error('Create user error:', authError);
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  // Create/update profile
  if (authData.user) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('profiles').upsert({
      id: authData.user.id,
      email,
      business_name: business_name || null,
      stripe_customer_id: stripe_customer_id || null,
    });
  }

  // Generate password reset link for user to set their password
  const { data: resetData, error: resetError } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login`,
    },
  });

  if (resetError) {
    console.error('Generate reset link error:', resetError);
  }

  return NextResponse.json({
    success: true,
    user: {
      id: authData.user?.id,
      email: authData.user?.email,
    },
    set_password_link: resetData?.properties?.action_link || null,
    message: 'User created. Send the password link to let them set their password.',
  });
}

/**
 * Full onboarding: Create customer, subscription, and user account in one call
 */
async function fullOnboard(body: {
  // Customer info
  email: string;
  name: string;
  company?: string;
  org_number?: string;
  phone?: string;

  // Subscription info
  price_sek: number;
  product_name?: string;
  description?: string;
  scope_items?: string[];
  start_date?: string;
  interval?: 'month' | 'year';

  // Options
  create_user_account?: boolean;
  send_invoice?: boolean;
}) {
  const {
    email,
    name,
    company,
    org_number,
    phone,
    price_sek,
    product_name = 'LeTrend Standard',
    description,
    scope_items,
    start_date,
    interval = 'month',
    create_user_account = true,
    send_invoice = true,
  } = body;

  if (!email || !name || !price_sek) {
    return NextResponse.json({
      error: 'email, name, and price_sek are required'
    }, { status: 400 });
  }

  const results: {
    customer?: unknown;
    subscription?: unknown;
    user_account?: unknown;
    payment_links?: unknown;
    invoice_sent?: boolean;
  } = {};

  // 1. Create Stripe customer
  const customerResult = await createCustomer({
    email,
    name,
    company,
    phone,
    notes: org_number ? `Org.nr: ${org_number}` : undefined,
  });
  const customerData = await customerResult.json();

  if (!customerData.success) {
    return NextResponse.json({ error: 'Failed to create customer', details: customerData }, { status: 500 });
  }
  results.customer = customerData.customer;
  const customerId = customerData.customer.id;

  // 2. Create subscription
  const subscriptionResult = await createAgreement({
    customer_id: customerId,
    price_sek,
    product_name,
    description,
    scope_items,
    start_date,
    interval,
    org_number,
    collection_method: 'send_invoice',
  });
  const subscriptionData = await subscriptionResult.json();

  if (!subscriptionData.success) {
    return NextResponse.json({ error: 'Failed to create subscription', details: subscriptionData }, { status: 500 });
  }
  results.subscription = {
    id: subscriptionData.subscription.id,
    status: subscriptionData.subscription.status,
    billing_starts: subscriptionData.billing_starts,
    stripe_url: subscriptionData.stripe_dashboard_url,
  };

  // 3. Create user account if requested
  if (create_user_account) {
    const userResult = await createUserAccount({
      email,
      name,
      business_name: company,
      stripe_customer_id: customerId,
    });
    const userData = await userResult.json();
    results.user_account = userData;
  }

  // 4. Send invoice if requested
  if (send_invoice) {
    try {
      const invoiceResult = await sendInvoice({
        subscription_id: subscriptionData.subscription.id,
      });
      const invoiceData = await invoiceResult.json();
      results.invoice_sent = invoiceData.success;
    } catch {
      results.invoice_sent = false;
    }
  }

  // 5. Get payment links
  const linksResult = await getPaymentLinks({
    customer_id: customerId,
    base_url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  });
  const linksData = await linksResult.json();
  results.payment_links = linksData.links;

  return NextResponse.json({
    success: true,
    message: `Customer ${name} onboarded with ${price_sek} SEK/${interval} subscription`,
    ...results,
    next_steps: [
      results.user_account && (results.user_account as { set_password_link?: string }).set_password_link
        ? `Send password link to ${email}`
        : null,
      results.invoice_sent ? 'Invoice has been sent' : 'Send invoice manually',
      `Customer can pay at: ${(results.payment_links as { payment_page?: string })?.payment_page}`,
    ].filter(Boolean),
  });
}

// ============================================
// GET Actions
// ============================================

async function listCustomers(params: URLSearchParams) {
  const limit = parseInt(params.get('limit') || '20');
  const email = params.get('email');
  const search = params.get('search');

  let customers: { data: Stripe.Customer[] };

  if (email) {
    customers = await stripe.customers.list({ email, limit });
  } else if (search) {
    customers = await stripe.customers.search({
      query: `name~"${search}" OR email~"${search}"`,
      limit,
    });
  } else {
    customers = await stripe.customers.list({ limit });
  }

  return NextResponse.json({
    success: true,
    customers: customers.data.map(c => ({
      id: c.id,
      email: c.email,
      name: c.name,
      created: new Date(c.created * 1000).toISOString(),
      metadata: c.metadata,
      stripe_url: `https://dashboard.stripe.com/customers/${c.id}`,
    })),
    total: customers.data.length,
  });
}

async function getCustomer(params: URLSearchParams) {
  const customerId = params.get('customer_id');
  const email = params.get('email');

  if (!customerId && !email) {
    return NextResponse.json({ error: 'customer_id or email required' }, { status: 400 });
  }

  let customer: Stripe.Customer;

  if (customerId) {
    customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
  } else {
    const list = await stripe.customers.list({ email: email!, limit: 1 });
    if (list.data.length === 0) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }
    customer = list.data[0];
  }

  // Get subscriptions
  const subscriptions = await stripe.subscriptions.list({
    customer: customer.id,
    limit: 10,
  });

  // Get invoices
  const invoices = await stripe.invoices.list({
    customer: customer.id,
    limit: 10,
  });

  return NextResponse.json({
    success: true,
    customer: {
      id: customer.id,
      email: customer.email,
      name: customer.name,
      phone: customer.phone,
      created: new Date(customer.created * 1000).toISOString(),
      metadata: customer.metadata,
      stripe_url: `https://dashboard.stripe.com/customers/${customer.id}`,
    },
    subscriptions: subscriptions.data.map((s: Stripe.Subscription & { current_period_end?: number }) => ({
      id: s.id,
      status: s.status,
      current_period_end: s.current_period_end ? new Date(s.current_period_end * 1000).toISOString() : null,
      cancel_at_period_end: s.cancel_at_period_end,
      items: s.items.data.map(i => ({
        price_id: i.price.id,
        amount: (i.price.unit_amount || 0) / 100,
        currency: i.price.currency,
        interval: i.price.recurring?.interval,
      })),
      stripe_url: `https://dashboard.stripe.com/subscriptions/${s.id}`,
    })),
    invoices: invoices.data.map(i => ({
      id: i.id,
      number: i.number,
      status: i.status,
      amount_due: (i.amount_due || 0) / 100,
      currency: i.currency,
      created: new Date(i.created * 1000).toISOString(),
      due_date: i.due_date ? new Date(i.due_date * 1000).toISOString() : null,
      hosted_url: i.hosted_invoice_url,
      pdf_url: i.invoice_pdf,
      stripe_url: `https://dashboard.stripe.com/invoices/${i.id}`,
    })),
  });
}

async function listSubscriptions(params: URLSearchParams) {
  const limit = parseInt(params.get('limit') || '20');
  const status = params.get('status') as Stripe.SubscriptionListParams.Status | undefined;

  const subscriptions = await stripe.subscriptions.list({
    limit,
    status: status || undefined,
    expand: ['data.customer'],
  });

  return NextResponse.json({
    success: true,
    subscriptions: subscriptions.data.map((s: Stripe.Subscription & { current_period_end?: number }) => {
      const customer = s.customer as Stripe.Customer;
      return {
        id: s.id,
        status: s.status,
        customer_email: customer.email,
        customer_name: customer.name,
        current_period_end: s.current_period_end ? new Date(s.current_period_end * 1000).toISOString() : null,
        amount: s.items.data.reduce((sum, i) => sum + ((i.price.unit_amount || 0) / 100), 0),
        currency: s.items.data[0]?.price.currency || 'sek',
        stripe_url: `https://dashboard.stripe.com/subscriptions/${s.id}`,
      };
    }),
    total: subscriptions.data.length,
  });
}

async function listInvoices(params: URLSearchParams) {
  const limit = parseInt(params.get('limit') || '20');
  const status = params.get('status') as Stripe.InvoiceListParams.Status | undefined;

  const invoices = await stripe.invoices.list({
    limit,
    status: status || undefined,
    expand: ['data.customer'],
  });

  return NextResponse.json({
    success: true,
    invoices: invoices.data.map(i => {
      const customer = i.customer as Stripe.Customer;
      return {
        id: i.id,
        number: i.number,
        status: i.status,
        customer_email: customer?.email,
        customer_name: customer?.name,
        amount_due: (i.amount_due || 0) / 100,
        currency: i.currency,
        created: new Date(i.created * 1000).toISOString(),
        due_date: i.due_date ? new Date(i.due_date * 1000).toISOString() : null,
        hosted_url: i.hosted_invoice_url,
        stripe_url: `https://dashboard.stripe.com/invoices/${i.id}`,
      };
    }),
    total: invoices.data.length,
  });
}

async function listProducts() {
  const products = await stripe.products.list({ limit: 50, active: true });
  const prices = await stripe.prices.list({ limit: 100, active: true });

  return NextResponse.json({
    success: true,
    products: products.data.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      prices: prices.data
        .filter(pr => pr.product === p.id)
        .map(pr => ({
          id: pr.id,
          amount: (pr.unit_amount || 0) / 100,
          currency: pr.currency,
          interval: pr.recurring?.interval,
        })),
    })),
  });
}

async function getDashboardSummary() {
  const [customers, activeSubscriptions, openInvoices, paidInvoices] = await Promise.all([
    stripe.customers.list({ limit: 1 }),
    stripe.subscriptions.list({ status: 'active', limit: 1 }),
    stripe.invoices.list({ status: 'open', limit: 100 }),
    stripe.invoices.list({ status: 'paid', limit: 100, created: { gte: Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60 } }),
  ]);

  const openAmount = openInvoices.data.reduce((sum, i) => sum + (i.amount_due || 0), 0) / 100;
  const paidAmount = paidInvoices.data.reduce((sum, i) => sum + (i.amount_paid || 0), 0) / 100;

  return NextResponse.json({
    success: true,
    summary: {
      total_customers: customers.data.length > 0 ? 'Check Stripe Dashboard' : 0,
      active_subscriptions: activeSubscriptions.data.length > 0 ? 'Check Stripe Dashboard' : 0,
      open_invoices: {
        count: openInvoices.data.length,
        total_sek: openAmount,
      },
      paid_last_30_days: {
        count: paidInvoices.data.length,
        total_sek: paidAmount,
      },
      stripe_dashboard: 'https://dashboard.stripe.com',
    },
  });
}
