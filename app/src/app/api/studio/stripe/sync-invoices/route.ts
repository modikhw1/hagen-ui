import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { stripe, isStripeTestMode, stripeEnvironment } from '@/lib/stripe/dynamic-config';
import { withAuth } from '@/lib/auth/api-auth';
import { upsertInvoiceMirror } from '@/lib/stripe/mirror';
import { logStripeSync } from '@/lib/stripe/sync-log';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
type SyncInvoice = Stripe.Invoice & {
  subscription?: string | Stripe.Subscription | null;
  payment_intent?: string | Stripe.PaymentIntent | null;
};

/**
 * POST /api/studio/stripe/sync-invoices
 * Sync all invoices from Stripe to Supabase
 */
export const POST = withAuth(async (request: NextRequest) => {
  const startedAt = Date.now();
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  try {
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
    }

    const body = await request.json().catch(() => ({})) as {
      customer_id?: string;
      subscription_id?: string;
    };
    const { customer_id, subscription_id } = body;

    console.log(`[sync-invoices] Starting sync from Stripe (${isStripeTestMode ? 'TEST' : 'LIVE'})`);

    // Fetch all invoices from Stripe
    const invoices: SyncInvoice[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const params: Stripe.InvoiceListParams = {
        limit: 100,
        created: { gte: Math.floor(new Date('2024-01-01').getTime() / 1000) }, // From Jan 2024
      };
      
      if (startingAfter) params.starting_after = startingAfter;
      if (customer_id) params.customer = customer_id;
      if (subscription_id) params.subscription = subscription_id;

      const result = await stripe.invoices.list(params);
      invoices.push(...(result.data as SyncInvoice[]));
      hasMore = result.has_more;
      
      if (hasMore && result.data.length > 0) {
        startingAfter = result.data[result.data.length - 1].id;
      }
    }

    console.log(`[sync-invoices] Found ${invoices.length} invoices in Stripe`);

    let synced = 0;
    let errors = 0;

    for (const invoice of invoices) {
      try {
        await upsertInvoiceMirror({
          supabaseAdmin,
          invoice,
          environment: stripeEnvironment,
        });
        synced++;

      } catch (err: unknown) {
        console.error(`[sync-invoices] Error processing invoice ${invoice.id}:`, err);
        errors++;
      }
    }

    console.log(`[sync-invoices] Completed: ${synced} synced, ${errors} errors`);

    await logStripeSync({
      supabaseAdmin,
      eventId: `manual_invoice_sync_${Date.now()}`,
      eventType: 'manual_invoice_sync',
      objectType: 'invoice',
      objectId: customer_id || subscription_id || null,
      syncDirection: 'stripe_to_supabase',
      status: errors > 0 ? 'failed' : 'success',
      errorMessage: errors > 0 ? `${errors} invoices failed to sync` : null,
      payloadSummary: {
        count: synced,
        errors,
        total: invoices.length,
        took_ms: Date.now() - startedAt,
        environment: stripeEnvironment,
      },
    });

    return NextResponse.json({ 
      success: true, 
      synced,
      errors,
      total: invoices.length,
      mode: isStripeTestMode ? 'test' : 'live'
    });

  } catch (err: unknown) {
    console.error('[sync-invoices] Fatal error:', err);
    await logStripeSync({
      supabaseAdmin,
      eventId: `manual_invoice_sync_${Date.now()}`,
      eventType: 'manual_invoice_sync',
      objectType: 'invoice',
      objectId: null,
      syncDirection: 'stripe_to_supabase',
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : 'Unknown error',
      payloadSummary: {
        took_ms: Date.now() - startedAt,
        environment: stripeEnvironment,
      },
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}, ['admin']);

/**
 * GET /api/studio/stripe/sync-invoices
 * Get sync status
 */
export const GET = withAuth(async () => {
  try {
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get recent sync logs
    const { data: logs } = await supabaseAdmin
      .from('stripe_sync_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    // Get invoice counts by status
    const { data: stats } = await supabaseAdmin
      .from('invoices')
      .select('status', { count: 'exact' });

    const statusCounts = stats?.reduce((acc, inv) => {
      acc[inv.status] = (acc[inv.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>) || {};

    return NextResponse.json({
      mode: isStripeTestMode ? 'test' : 'live',
      recentSyncs: logs,
      invoiceStats: statusCounts,
    });

  } catch (err: unknown) {
    console.error('[sync-invoices] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}, ['admin']);
