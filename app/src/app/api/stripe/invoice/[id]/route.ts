import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/config';

// GET - Fetch invoice details by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Invoice ID required' }, { status: 400 });
    }

    const invoice = await stripe.invoices.retrieve(id, {
      expand: ['customer', 'subscription', 'lines.data.price.product'],
    });

    // Extract customer info
    const customer = invoice.customer as { name?: string; email?: string; address?: unknown } | null;
    const customerAddress = customer?.address as {
      line1?: string;
      line2?: string;
      postal_code?: string;
      city?: string;
      country?: string;
    } | null;

    // Build line items with product details
    const lineItems = invoice.lines.data.map((line) => {
      // Cast to access price - Stripe types vary by version
      const lineWithPrice = line as unknown as {
        price?: { unit_amount?: number; product?: { name?: string; description?: string } | string };
        description?: string;
        period?: { start: number; end: number };
        quantity?: number;
        amount: number;
        currency: string;
      };
      const price = lineWithPrice.price;
      const product = typeof price?.product === 'object' ? price.product : null;

      return {
        description: product?.name || lineWithPrice.description || 'Tjänst',
        period: lineWithPrice.period ? {
          start: new Date(lineWithPrice.period.start * 1000).toLocaleDateString('sv-SE'),
          end: new Date(lineWithPrice.period.end * 1000).toLocaleDateString('sv-SE'),
        } : null,
        quantity: lineWithPrice.quantity || 1,
        unitAmount: price?.unit_amount || 0,
        amount: lineWithPrice.amount,
        currency: lineWithPrice.currency,
      };
    });

    // Calculate VAT (if applicable) - cast for Stripe type compatibility
    const invoiceData = invoice as unknown as {
      subtotal?: number;
      tax?: number;
      total?: number;
      paid?: boolean;
      created?: number;
      due_date?: number;
      currency?: string;
      hosted_invoice_url?: string;
      invoice_pdf?: string;
    };
    const subtotal = invoiceData.subtotal || 0;
    const tax = invoiceData.tax || 0;
    const total = invoiceData.total || 0;

    return NextResponse.json({
      invoice: {
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        created: new Date((invoiceData.created || 0) * 1000).toLocaleDateString('sv-SE', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
        dueDate: invoiceData.due_date
          ? new Date(invoiceData.due_date * 1000).toLocaleDateString('sv-SE', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })
          : null,
        customer: {
          name: customer?.name || 'Kund',
          email: customer?.email || '',
          address: customerAddress ? {
            line1: customerAddress.line1 || '',
            line2: customerAddress.line2 || '',
            postalCode: customerAddress.postal_code || '',
            city: customerAddress.city || '',
            country: customerAddress.country || 'Sverige',
          } : null,
        },
        lineItems,
        subtotal,
        tax,
        total,
        currency: invoiceData.currency || 'sek',
        hostedInvoiceUrl: invoiceData.hosted_invoice_url,
        invoicePdf: invoiceData.invoice_pdf,
        paid: invoice.status === 'paid' || invoiceData.paid || false,
      },
    });
  } catch (error) {
    console.error('Fetch invoice error:', error);
    return NextResponse.json({ error: 'Failed to fetch invoice' }, { status: 500 });
  }
}
