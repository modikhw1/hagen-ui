import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/dynamic-config';

// Invoice default settings for LeTrend
const INVOICE_DEFAULTS = {
  footer: 'Tack för att du väljer LeTrend. Vid frågor, kontakta faktura@letrend.se',
  memo: 'Vi ser fram emot att samarbeta med dig.',
  customFields: [
    { name: 'Kundservice', value: '+46 73 822 22 77' },
    { name: 'Webbplats', value: 'letrend.se' },
  ],
};

// POST - Configure invoice defaults and update existing invoice
export async function POST(request: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const { invoiceId } = await request.json();

    // If specific invoice provided, update it
    if (invoiceId) {
      const invoice = await stripe.invoices.retrieve(invoiceId);

      // Can only update draft invoices
      if (invoice.status === 'draft') {
        const updated = await stripe.invoices.update(invoiceId, {
          footer: INVOICE_DEFAULTS.footer,
          custom_fields: INVOICE_DEFAULTS.customFields,
          description: INVOICE_DEFAULTS.memo,
        });

        return NextResponse.json({
          success: true,
          message: 'Invoice updated with defaults',
          invoice: {
            id: updated.id,
            footer: updated.footer,
            customFields: updated.custom_fields,
            description: updated.description,
          },
        });
      } else {
        return NextResponse.json({
          success: false,
          message: `Cannot update invoice with status: ${invoice.status}. Only draft invoices can be modified.`,
        });
      }
    }

    // Update all draft invoices
    const drafts = await stripe.invoices.list({ status: 'draft', limit: 100 });
    const updated: string[] = [];

    for (const invoice of drafts.data) {
      await stripe.invoices.update(invoice.id, {
        footer: INVOICE_DEFAULTS.footer,
        custom_fields: INVOICE_DEFAULTS.customFields,
        description: INVOICE_DEFAULTS.memo,
      });
      updated.push(invoice.id);
    }

    return NextResponse.json({
      success: true,
      message: `Updated ${updated.length} draft invoices`,
      defaults: INVOICE_DEFAULTS,
      updatedInvoices: updated,
    });

  } catch (error) {
    console.error('Configure invoice defaults error:', error);
    return NextResponse.json({ error: 'Failed to configure invoice defaults' }, { status: 500 });
  }
}

// GET - Show current invoice defaults
export async function GET() {
  return NextResponse.json({
    defaults: INVOICE_DEFAULTS,
    note: 'These defaults are applied when creating or updating invoices',
  });
}
