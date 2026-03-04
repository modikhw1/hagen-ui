import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/dynamic-config';

// Helper to safely extract product info
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

// Helper to get subscription period end
function getSubPeriodEnd(sub: unknown): number | undefined {
  return (sub as { current_period_end?: number }).current_period_end;
}

// GET - Fetch pending agreement for a user by email
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

    // Find customer by email in Stripe
    const customers = await stripe.customers.list({
      email: email,
      limit: 1,
    });

    if (customers.data.length === 0) {
      return NextResponse.json({ agreement: null });
    }

    const customer = customers.data[0];
    const customerName = customer.name || customer.email?.split('@')[0] || 'kund';

    // Check for pending/incomplete subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'all',
      limit: 10,
    });

    // Find pending subscription (incomplete or trialing without payment)
    const pendingSubscription = subscriptions.data.find(sub =>
      sub.status === 'incomplete' ||
      sub.status === 'trialing'
    );

    // Find past_due subscription (payment failed)
    const pastDueSubscription = subscriptions.data.find(sub =>
      sub.status === 'past_due'
    );

    // Find cancelled subscription
    const cancelledSubscription = subscriptions.data.find(sub =>
      sub.status === 'canceled'
    );

    // Also check for active subscription (already paid)
    const activeSubscription = subscriptions.data.find(sub =>
      sub.status === 'active'
    );

    if (activeSubscription) {
      const item = activeSubscription.items.data[0];
      const price = item?.price;
      const product = price?.product;

      // Get product details for scope
      let rawProduct = null;
      if (typeof product === 'string') {
        rawProduct = await stripe.products.retrieve(product);
      } else if (product && typeof product === 'object') {
        rawProduct = product;
      }
      const productInfo = getProductInfo(rawProduct);

      // Check for open invoices
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
      const subscriptionInvoices = {
        data: [...openInvoices.data, ...draftInvoices.data],
      };

      if (subscriptionInvoices.data.length > 0) {
        const invoice = subscriptionInvoices.data[0];
        return NextResponse.json({
          agreement: {
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
          },
        });
      }

      // Fully active subscription
      return NextResponse.json({
        agreement: {
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
        },
      });
    }

    // Past due - payment failed
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

      const invoices = await stripe.invoices.list({
        subscription: pastDueSubscription.id,
        limit: 1,
      });
      const latestInvoice = invoices.data[0];

      return NextResponse.json({
        agreement: {
          status: 'past_due',
          customerId: customer.id,
          customerName,
          subscriptionId: pastDueSubscription.id,
          invoiceId: latestInvoice?.id || null,
          pricePerMonth: price?.unit_amount || 0,
          currency: price?.currency || 'sek',
          productName: productInfo.name,
          hostedInvoiceUrl: latestInvoice?.hosted_invoice_url || null,
        },
      });
    }

    // Cancelled subscription
    if (cancelledSubscription && !pendingSubscription) {
      const item = cancelledSubscription.items.data[0];
      const price = item?.price;

      return NextResponse.json({
        agreement: {
          status: 'cancelled',
          customerId: customer.id,
          customerName,
          subscriptionId: cancelledSubscription.id,
          pricePerMonth: price?.unit_amount || 0,
          currency: price?.currency || 'sek',
          cancelledAt: cancelledSubscription.canceled_at,
        },
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

      const invoices = await stripe.invoices.list({
        subscription: pendingSubscription.id,
        limit: 1,
      });

      const pendingInvoice = invoices.data.find(inv =>
        inv.status === 'draft' || inv.status === 'open'
      );

      return NextResponse.json({
        agreement: {
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
        },
      });
    }

    // Check for open invoices (one-time or manual)
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
    return NextResponse.json(
      { error: 'Could not fetch agreement' },
      { status: 500 }
    );
  }
}
