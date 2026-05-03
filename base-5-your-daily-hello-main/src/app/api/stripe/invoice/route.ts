import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { stripe } from '@/lib/stripe/dynamic-config';
import { AuthError, validateApiRequest } from '@/lib/auth/api-auth';
import {
  canAccessStripeCustomerResource,
  getAuthorizedCustomerProfile,
} from '@/lib/stripe/customer-access';

const querySchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    subscriptionId: z.string().trim().min(1).optional(),
  })
  .refine((value) => value.id || value.subscriptionId, {
    message: 'invoiceId or subscriptionId required',
  });

export async function GET(request: NextRequest) {
  try {
    const authUser = await validateApiRequest(request);

    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const parsedQuery = querySchema.safeParse({
      id: searchParams.get('id') ?? undefined,
      subscriptionId: searchParams.get('subscriptionId') ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        {
          error: 'Invalid query params',
          issues: parsedQuery.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    const { id: invoiceId, subscriptionId } = parsedQuery.data;
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const authorizedProfile = await getAuthorizedCustomerProfile({
      supabaseAdmin,
      user: authUser,
    });

    let invoice: Stripe.Invoice | undefined;
    if (invoiceId) {
      invoice = await stripe.invoices.retrieve(invoiceId);
    } else if (subscriptionId) {
      const invoices = await stripe.invoices.list({
        subscription: subscriptionId,
        limit: 1,
      });
      invoice = invoices.data[0];
    }

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const customer =
      typeof invoice.customer === 'string'
        ? await stripe.customers.retrieve(invoice.customer)
        : invoice.customer;
    const customerId =
      typeof invoice.customer === 'string' ? invoice.customer : customer?.id || null;
    const resolvedCustomer: Stripe.Customer | null =
      !customer || ('deleted' in customer && customer.deleted) ? null : customer;
    const customerEmail = resolvedCustomer?.email || null;

    const invoiceWithSubscription = invoice as Stripe.Invoice & {
      subscription?: string | null;
    };
    const invoiceSubscriptionId =
      typeof invoiceWithSubscription.subscription === 'string'
        ? invoiceWithSubscription.subscription
        : null;

    const ownsInvoice = canAccessStripeCustomerResource(authorizedProfile, {
      customerId,
      subscriptionId: invoiceSubscriptionId,
      email: customerEmail || authUser.email,
    });

    if (!ownsInvoice) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const subscription = invoiceSubscriptionId
      ? await stripe.subscriptions.retrieve(invoiceSubscriptionId)
      : null;
    const lineItems = invoice.lines.data || [];
    const customerName = resolvedCustomer?.name || 'Kund';
    const invoiceTax =
      invoice.total_taxes?.reduce((sum, item) => sum + item.amount, 0) || 0;

    return NextResponse.json({
      invoice: {
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        created: invoice.created,
        dueDate: invoice.due_date,
        customer: {
          name: customerName,
          email: customerEmail || '',
        },
        lineItems: lineItems.map((item) => ({
          description: item.description || 'Tjänst',
          amount: item.amount,
          currency: item.currency,
        })),
        subtotal: invoice.subtotal,
        tax: invoiceTax,
        total: invoice.total,
        currency: invoice.currency,
        hostedInvoiceUrl: invoice.hosted_invoice_url,
        invoicePdf: invoice.invoice_pdf,
        paid: invoice.status === 'paid',
        subscriptionId: subscription?.id || null,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching invoice:', error);
    return NextResponse.json({ error: 'Failed to fetch invoice' }, { status: 500 });
  }
}
