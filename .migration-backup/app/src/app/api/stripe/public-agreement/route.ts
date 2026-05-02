import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { stripe } from '@/lib/stripe/dynamic-config';
import { AuthError, validateApiRequest } from '@/lib/auth/api-auth';
import {
  canAccessStripeCustomerResource,
  getAuthorizedCustomerProfile,
} from '@/lib/stripe/customer-access';

const querySchema = z.object({
  customerId: z.string().trim().regex(/^cus_/, 'Invalid customer ID'),
});

export async function GET(request: NextRequest) {
  try {
    const authUser = await validateApiRequest(request);

    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const parsedQuery = querySchema.safeParse({
      customerId: new URL(request.url).searchParams.get('customerId') ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        {
          error: 'Invalid customer ID',
          issues: parsedQuery.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const authorizedProfile = await getAuthorizedCustomerProfile({
      supabaseAdmin,
      user: authUser,
    });

    const { customerId } = parsedQuery.data;
    if (
      !canAccessStripeCustomerResource(authorizedProfile, {
        customerId,
        email: authUser.email,
      })
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let customer;
    try {
      customer = await stripe.customers.retrieve(customerId);
    } catch {
      return NextResponse.json({ error: 'Kunden hittades inte' }, { status: 404 });
    }

    if (customer.deleted) {
      return NextResponse.json({ error: 'Kunden finns inte längre' }, { status: 404 });
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 1,
      expand: ['data.latest_invoice'],
    });

    const invoices = await stripe.invoices.list({
      customer: customerId,
      status: 'open',
      limit: 1,
    });

    if (subscriptions.data.length > 0) {
      const sub = subscriptions.data[0] as {
        id: string;
        status: string;
        items: {
          data: Array<{
            price?: {
              unit_amount?: number;
              currency?: string;
              product?: string | { name?: string };
            };
          }>;
        };
        latest_invoice?: {
          id?: string;
          hosted_invoice_url?: string;
          status?: string;
        } | null;
        cancel_at_period_end?: boolean;
        cancel_at?: number;
        current_period_end?: number;
      };
      const invoice = sub.latest_invoice;

      let status: 'pending' | 'pending_invoice' | 'active' | 'past_due' | 'cancelled';

      if (sub.status === 'active' || sub.status === 'trialing') {
        status = 'active';
      } else if (sub.status === 'past_due') {
        status = 'past_due';
      } else if (sub.status === 'canceled') {
        status = 'cancelled';
      } else {
        status = 'pending';
      }

      if (sub.cancel_at_period_end && sub.status === 'active') {
        status = 'active';
      }

      const priceItem = sub.items.data[0];
      const priceAmount = priceItem?.price?.unit_amount || 0;
      const productName =
        typeof priceItem?.price?.product === 'object'
          ? (priceItem.price.product as { name?: string }).name
          : null;

      return NextResponse.json({
        agreement: {
          status,
          customerId: customer.id,
          customerName: customer.name || customer.email?.split('@')[0] || 'Kund',
          customerEmail: customer.email,
          subscriptionId: sub.id,
          invoiceId: invoice?.id,
          pricePerMonth: priceAmount,
          currency: priceItem?.price?.currency || 'sek',
          productName: productName || 'LeTrend',
          hostedInvoiceUrl: invoice?.hosted_invoice_url,
          cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null,
          currentPeriodEnd: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        },
      });
    }

    if (invoices.data.length > 0) {
      const invoice = invoices.data[0];

      return NextResponse.json({
        agreement: {
          status: 'pending_invoice',
          customerId: customer.id,
          customerName: customer.name || customer.email?.split('@')[0] || 'Kund',
          customerEmail: customer.email,
          invoiceId: invoice.id,
          amount: invoice.amount_due,
          currency: invoice.currency,
          productName: invoice.lines.data[0]?.description || 'LeTrend',
          hostedInvoiceUrl: invoice.hosted_invoice_url,
        },
      });
    }

    return NextResponse.json({
      agreement: null,
      message: 'Ingen aktiv prenumeration eller öppen faktura',
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Public agreement fetch error:', error);
    return NextResponse.json(
      { error: 'Kunde inte hämta avtalsinformation' },
      { status: 500 }
    );
  }
}
