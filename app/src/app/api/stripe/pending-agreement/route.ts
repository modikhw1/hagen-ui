import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/dynamic-config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getProductInfo(product: unknown): { name: string; description: string | null; metadata: Record<string, string> } {
  const p = product as { name?: string; description?: string; metadata?: Record<string, string>; deleted?: boolean } | null;
  if (!p || p.deleted) {
    return { name: 'Prenumeration', description: null, metadata: {} };
  }
  return {
    name: p.name || 'Prenumeration',
    description: p.description || null,
    metadata: p.metadata || {},
  };
}

function getSubPeriodEnd(sub: unknown): number | undefined {
  return (sub as { current_period_end?: number }).current_period_end;
}

type ContractTerms = {
  profileId?: string;
  pricing_status?: 'fixed' | 'unknown' | null;
  contract_start_date?: string | null;
  billing_day_of_month?: number | null;
  first_invoice_behavior?: 'prorated' | 'full' | 'free_until_anchor' | null;
  discount_type?: 'none' | 'percent' | 'amount' | 'free_months' | null;
  discount_value?: number | null;
  discount_duration_months?: number | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getContractTerms(
  supabase: any,
  stripeCustomerId: string
): Promise<ContractTerms> {
  const { data } = await supabase
    .from('customer_profiles')
    .select(`
      id,
      pricing_status,
      contract_start_date,
      billing_day_of_month,
      first_invoice_behavior,
      discount_type,
      discount_value,
      discount_duration_months
    `)
    .eq('stripe_customer_id', stripeCustomerId)
    .maybeSingle();

  if (!data) return {};

  const row = data as {
    id: string;
    pricing_status: 'fixed' | 'unknown' | null;
    contract_start_date: string | null;
    billing_day_of_month: number | null;
    first_invoice_behavior: 'prorated' | 'full' | 'free_until_anchor' | null;
    discount_type: 'none' | 'percent' | 'amount' | 'free_months' | null;
    discount_value: number | null;
    discount_duration_months: number | null;
  };

  return {
    profileId: row.id,
    pricing_status: row.pricing_status,
    contract_start_date: row.contract_start_date,
    billing_day_of_month: row.billing_day_of_month,
    first_invoice_behavior: row.first_invoice_behavior,
    discount_type: row.discount_type,
    discount_value: row.discount_value,
    discount_duration_months: row.discount_duration_months,
  };
}

function withContractTerms(base: Record<string, unknown>, terms: ContractTerms) {
  return {
    ...base,
    profileId: terms.profileId,
    pricing_status: terms.pricing_status ?? undefined,
    contract_start_date: terms.contract_start_date ?? undefined,
    billing_day_of_month: terms.billing_day_of_month ?? undefined,
    first_invoice_behavior: terms.first_invoice_behavior ?? undefined,
    discount_type: terms.discount_type ?? undefined,
    discount_value: terms.discount_value ?? undefined,
    discount_duration_months: terms.discount_duration_months ?? undefined,
  };
}

export async function GET(request: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const customers = await stripe.customers.list({ email, limit: 1 });

    if (customers.data.length === 0) {
      return NextResponse.json({ agreement: null });
    }

    const customer = customers.data[0];
    const customerName = customer.name || customer.email?.split('@')[0] || 'kund';
    const contractTerms = await getContractTerms(supabase, customer.id);

    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'all',
      limit: 10,
    });

    const pendingSubscription = subscriptions.data.find(sub =>
      sub.status === 'incomplete' || sub.status === 'trialing'
    );
    const pastDueSubscription = subscriptions.data.find(sub => sub.status === 'past_due');
    const cancelledSubscription = subscriptions.data.find(sub => sub.status === 'canceled');
    const activeSubscription = subscriptions.data.find(sub => sub.status === 'active');

    if (activeSubscription) {
      const item = activeSubscription.items.data[0];
      const price = item?.price;
      const product = price?.product;

      let rawProduct = null;
      if (typeof product === 'string') {
        rawProduct = await stripe.products.retrieve(product);
      } else if (product && typeof product === 'object') {
        rawProduct = product;
      }
      const productInfo = getProductInfo(rawProduct);

      const openInvoices = await stripe.invoices.list({
        subscription: activeSubscription.id,
        status: 'open',
        limit: 1,
      });
      const draftInvoices = await stripe.invoices.list({
        subscription: activeSubscription.id,
        status: 'draft',
        limit: 1,
      });
      const subscriptionInvoices = [...openInvoices.data, ...draftInvoices.data];

      if (subscriptionInvoices.length > 0) {
        const invoice = subscriptionInvoices[0];
        return NextResponse.json({
          agreement: withContractTerms({
            status: 'pending',
            customerId: customer.id,
            customerName,
            subscriptionId: activeSubscription.id,
            invoiceId: invoice.id,
            pricePerMonth: price?.unit_amount || 0,
            currency: price?.currency || 'sek',
            productName: productInfo.name,
            scope: productInfo.description || productInfo.metadata.scope || null,
            scopeItems: productInfo.metadata.scope_items ? JSON.parse(productInfo.metadata.scope_items) : null,
            hostedInvoiceUrl: invoice.hosted_invoice_url,
          }, contractTerms),
        });
      }

      return NextResponse.json({
        agreement: withContractTerms({
          status: 'active',
          customerId: customer.id,
          customerName,
          subscriptionId: activeSubscription.id,
          pricePerMonth: price?.unit_amount || 0,
          currency: price?.currency || 'sek',
          productName: productInfo.name,
          scope: productInfo.description || productInfo.metadata.scope || null,
          scopeItems: productInfo.metadata.scope_items ? JSON.parse(productInfo.metadata.scope_items) : null,
          currentPeriodEnd: getSubPeriodEnd(activeSubscription),
          cancelAtPeriodEnd: activeSubscription.cancel_at_period_end,
          cancelAt: activeSubscription.cancel_at,
        }, contractTerms),
      });
    }

    if (pastDueSubscription) {
      const item = pastDueSubscription.items.data[0];
      const price = item?.price;
      const product = price?.product;

      let rawProduct = null;
      if (typeof product === 'string') {
        rawProduct = await stripe.products.retrieve(product);
      } else if (product && typeof product === 'object') {
        rawProduct = product;
      }
      const productInfo = getProductInfo(rawProduct);

      const invoices = await stripe.invoices.list({ subscription: pastDueSubscription.id, limit: 1 });
      const latestInvoice = invoices.data[0];

      return NextResponse.json({
        agreement: withContractTerms({
          status: 'past_due',
          customerId: customer.id,
          customerName,
          subscriptionId: pastDueSubscription.id,
          invoiceId: latestInvoice?.id || null,
          pricePerMonth: price?.unit_amount || 0,
          currency: price?.currency || 'sek',
          productName: productInfo.name,
          hostedInvoiceUrl: latestInvoice?.hosted_invoice_url || null,
        }, contractTerms),
      });
    }

    if (cancelledSubscription && !pendingSubscription) {
      const item = cancelledSubscription.items.data[0];
      const price = item?.price;

      return NextResponse.json({
        agreement: withContractTerms({
          status: 'cancelled',
          customerId: customer.id,
          customerName,
          subscriptionId: cancelledSubscription.id,
          pricePerMonth: price?.unit_amount || 0,
          currency: price?.currency || 'sek',
          cancelledAt: cancelledSubscription.canceled_at,
        }, contractTerms),
      });
    }

    if (pendingSubscription) {
      const item = pendingSubscription.items.data[0];
      const price = item?.price;
      const product = price?.product;

      let rawProduct = null;
      if (typeof product === 'string') {
        rawProduct = await stripe.products.retrieve(product);
      } else if (product && typeof product === 'object') {
        rawProduct = product;
      }
      const productInfo = getProductInfo(rawProduct);

      const invoices = await stripe.invoices.list({ subscription: pendingSubscription.id, limit: 1 });
      const pendingInvoice = invoices.data.find(inv => inv.status === 'draft' || inv.status === 'open');

      return NextResponse.json({
        agreement: withContractTerms({
          status: 'pending',
          customerId: customer.id,
          customerName,
          subscriptionId: pendingSubscription.id,
          invoiceId: pendingInvoice?.id || null,
          pricePerMonth: price?.unit_amount || 0,
          currency: price?.currency || 'sek',
          productName: productInfo.name,
          scope: productInfo.description || productInfo.metadata.scope || null,
          hostedInvoiceUrl: pendingInvoice?.hosted_invoice_url || null,
          scopeItems: productInfo.metadata.scope_items ? JSON.parse(productInfo.metadata.scope_items) : null,
        }, contractTerms),
      });
    }

    const openInvoices = await stripe.invoices.list({
      customer: customer.id,
      status: 'open',
      limit: 1,
    });

    if (openInvoices.data.length > 0) {
      const invoice = openInvoices.data[0];
      return NextResponse.json({
        agreement: {
          status: 'pending_invoice',
          customerId: customer.id,
          customerName,
          invoiceId: invoice.id,
          amount: invoice.amount_due,
          currency: invoice.currency,
          description: invoice.description || 'Faktura',
          hostedInvoiceUrl: invoice.hosted_invoice_url,
        },
      });
    }

    return NextResponse.json({ agreement: null });

  } catch (error) {
    console.error('Error fetching pending agreement:', error);
    return NextResponse.json({ error: 'Could not fetch agreement' }, { status: 500 });
  }
}
