import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/dynamic-config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// GET - Fetch invoice by ID or subscription
export async function GET(request: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const invoiceId = searchParams.get('id');
    const subscriptionId = searchParams.get('subscriptionId');

    let invoice;
    
    if (invoiceId) {
      // Fetch by invoice ID
      invoice = await stripe.invoices.retrieve(invoiceId);
    } else if (subscriptionId) {
      // Fetch latest invoice for subscription
      const invoices = await stripe.invoices.list({
        subscription: subscriptionId,
        limit: 1,
      });
      invoice = invoices.data[0];
    } else {
      return NextResponse.json({ error: 'invoiceId or subscriptionId required' }, { status: 400 });
    }

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Get customer details
    const customer = typeof invoice.customer === 'string' 
      ? await stripe.customers.retrieve(invoice.customer)
      : invoice.customer;

    // Get subscription if exists
    let subscription = null;
    const invoiceSubscriptionId = (invoice as any).subscription;
    if (invoiceSubscriptionId) {
      subscription = await stripe.subscriptions.retrieve(invoiceSubscriptionId as string);
    }

    // Get invoice line items (use lines property directly)
    const lineItems = (invoice as any).lines?.data || [];

    const formattedInvoice = {
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      created: invoice.created,
      dueDate: invoice.due_date,
      customer: {
        name: (customer as any)?.name || 'Kund',
        email: (customer as any)?.email || '',
      },
      lineItems: lineItems.map((item: any) => ({
        description: item.description || item.plan?.interval || 'Tjänst',
        amount: item.amount,
        currency: item.currency,
      })),
      subtotal: invoice.subtotal,
      tax: (invoice as any).tax || 0,
      total: invoice.total,
      currency: invoice.currency,
      hostedInvoiceUrl: invoice.hosted_invoice_url,
      invoicePdf: invoice.invoice_pdf,
      paid: invoice.status === 'paid',
      subscriptionId: subscription?.id,
    };

    return NextResponse.json({ invoice: formattedInvoice });

  } catch (error) {
    console.error('Error fetching invoice:', error);
    return NextResponse.json({ error: 'Failed to fetch invoice' }, { status: 500 });
  }
}
