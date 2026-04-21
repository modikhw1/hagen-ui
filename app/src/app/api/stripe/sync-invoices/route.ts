/**
 * PHASE 4: Invoice Synchronization Endpoint
 *
 * Manual endpoint to sync all invoices from Stripe to Supabase.
 * Useful for:
 * - Recovering from sync failures
 * - Initial data migration
 * - Debugging missing invoices
 *
 * GET /api/stripe/sync-invoices?customer_id=cus_xxx
 * GET /api/stripe/sync-invoices?subscription_id=sub_xxx
 * GET /api/stripe/sync-invoices (sync all invoices - admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe/dynamic-config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const subscription = invoice.parent?.subscription_details?.subscription;
  return typeof subscription === 'string' ? subscription : null;
}

export async function GET(request: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const customerId = request.nextUrl.searchParams.get('customer_id');
    const subscriptionId = request.nextUrl.searchParams.get('subscription_id');

    if (!customerId && !subscriptionId) {
      return NextResponse.json(
        {
          error: 'Either customer_id or subscription_id is required',
          usage: 'GET /api/stripe/sync-invoices?customer_id=cus_xxx',
        },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Build query parameters for Stripe API
    const queryParams: Stripe.InvoiceListParams = { limit: 100 };
    if (customerId) {
      queryParams.customer = customerId;
    }
    if (subscriptionId) {
      queryParams.subscription = subscriptionId;
    }

    console.log('[sync-invoices] Fetching invoices from Stripe:', queryParams);

    // Fetch all invoices from Stripe
    const invoices = await stripe.invoices.list(queryParams);

    let synced = 0;
    let errors = 0;
    const errorDetails: Array<{ invoice_id: string; error: string }> = [];

    // Sync each invoice to Supabase
    for (const invoice of invoices.data) {
      try {
        // Find customer_profile_id if available
        let customerProfileId = null;
        if (invoice.customer) {
          const { data: profile } = await supabaseAdmin
            .from('customer_profiles')
            .select('id')
            .eq('stripe_customer_id', invoice.customer as string)
            .single();
          if (profile) {
            customerProfileId = profile.id;
          }
        }

        // Find user_profile_id if available
        let userProfileId = null;
        if (invoice.customer) {
          const { data: userProfile } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('stripe_customer_id', invoice.customer as string)
            .single();
          if (userProfile) {
            userProfileId = userProfile.id;
          }
        }

        // Upsert invoice
        const { error } = await supabaseAdmin.from('invoices').upsert(
          {
            stripe_invoice_id: invoice.id,
            stripe_subscription_id: getInvoiceSubscriptionId(invoice),
            stripe_customer_id: invoice.customer as string,
            customer_profile_id: customerProfileId,
            user_profile_id: userProfileId,
            amount_due: invoice.amount_due,
            amount_paid: invoice.amount_paid,
            currency: invoice.currency,
            status: invoice.status as string,
            hosted_invoice_url: invoice.hosted_invoice_url || null,
            invoice_pdf: invoice.invoice_pdf || null,
            due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
            paid_at: invoice.status_transitions?.paid_at
              ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
              : null,
          },
          { onConflict: 'stripe_invoice_id' }
        );

        if (error) {
          console.error('[sync-invoices] Error syncing invoice:', invoice.id, error);
          errors++;
          errorDetails.push({ invoice_id: invoice.id, error: error.message });
        } else {
          synced++;
          console.log(`[sync-invoices] Synced invoice ${invoice.id}`);
        }
      } catch (e: unknown) {
        console.error('[sync-invoices] Exception syncing invoice:', e);
        errors++;
        errorDetails.push({
          invoice_id: invoice.id,
          error: e instanceof Error ? e.message : 'Unknown error',
        });
      }
    }

    // Log sync operation
    await supabaseAdmin.from('stripe_sync_log').insert({
      event_type: 'manual_invoice_sync',
      stripe_event_id: null,
      object_type: 'invoice',
      object_id: customerId || subscriptionId || 'all',
      sync_direction: 'stripe_to_supabase',
      status: errors === 0 ? 'success' : 'failed',
      error_message: errors > 0 ? `${errors} invoices failed to sync` : null,
    });

    return NextResponse.json({
      success: true,
      synced,
      errors,
      total: invoices.data.length,
      has_more: invoices.has_more,
      error_details: errorDetails.length > 0 ? errorDetails : undefined,
      message: `Successfully synced ${synced} out of ${invoices.data.length} invoices`,
    });
  } catch (error: unknown) {
    console.error('[sync-invoices] Fatal error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync invoices' },
      { status: 500 }
    );
  }
}
