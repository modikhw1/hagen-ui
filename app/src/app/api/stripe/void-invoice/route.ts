import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/config';

// POST - Void an invoice and optionally mark subscription as paid
export async function POST(request: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const { invoiceId, markPaid } = await request.json();

    if (!invoiceId) {
      return NextResponse.json({ error: 'Invoice ID required' }, { status: 400 });
    }

    const invoice = await stripe.invoices.retrieve(invoiceId);

    if (invoice.status === 'open') {
      if (markPaid) {
        // Mark as paid without collecting payment
        const paidInvoice = await stripe.invoices.pay(invoiceId, {
          paid_out_of_band: true,
        });

        return NextResponse.json({
          success: true,
          action: 'marked_paid',
          invoice: {
            id: paidInvoice.id,
            status: paidInvoice.status,
            paid: paidInvoice.paid,
          },
        });
      } else {
        // Void the invoice
        const voidedInvoice = await stripe.invoices.voidInvoice(invoiceId);

        return NextResponse.json({
          success: true,
          action: 'voided',
          invoice: {
            id: voidedInvoice.id,
            status: voidedInvoice.status,
          },
        });
      }
    }

    return NextResponse.json({
      error: `Cannot modify invoice with status: ${invoice.status}`
    }, { status: 400 });

  } catch (error) {
    console.error('Void invoice error:', error);
    return NextResponse.json(
      { error: 'Could not process invoice', details: String(error) },
      { status: 500 }
    );
  }
}
