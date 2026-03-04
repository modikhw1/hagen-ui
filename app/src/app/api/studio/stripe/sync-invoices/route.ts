import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe, isStripeTestMode } from '@/lib/stripe/dynamic-config';
import { withAuth } from '@/lib/auth/api-auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * POST /api/studio/stripe/sync-invoices
 * Sync all invoices from Stripe to Supabase
 */
export const POST = withAuth(async (request: NextRequest, user) => {
  try {
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const body = await request.json().catch(() => ({}));
    const { customer_id, subscription_id } = body;

    console.log(`[sync-invoices] Starting sync from Stripe (${isStripeTestMode ? 'TEST' : 'LIVE'})`);

    // Fetch all invoices from Stripe
    const invoices: any[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const params: any = {
        limit: 100,
        created: { gte: Math.floor(new Date('2024-01-01').getTime() / 1000) }, // From Jan 2024
      };
      
      if (startingAfter) params.starting_after = startingAfter;
      if (customer_id) params.customer = customer_id;
      if (subscription_id) params.subscription = subscription_id;

      const result = await stripe.invoices.list(params);
      invoices.push(...result.data);
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
        // Find customer profile by stripe_customer_id
        let customerProfileId: string | null = null;
        
        const { data: customerProfile } = await supabaseAdmin
          .from('customer_profiles')
          .select('id')
          .eq('stripe_customer_id', invoice.customer)
          .maybeSingle();

        if (customerProfile) {
          customerProfileId = customerProfile.id;
        }

        // Upsert invoice
        const { error: upsertError } = await supabaseAdmin
          .from('invoices')
          .upsert({
            stripe_invoice_id: invoice.id,
            stripe_customer_id: invoice.customer,
            stripe_subscription_id: invoice.subscription || null,
            customer_profile_id: customerProfileId,
            amount_due: invoice.amount_due,
            amount_paid: invoice.amount_paid,
            currency: invoice.currency || 'sek',
            status: invoice.status,
            hosted_invoice_url: invoice.hosted_invoice_url,
            invoice_pdf: invoice.invoice_pdf,
            due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
            paid_at: invoice.status === 'paid' && invoice.payment_intent 
              ? new Date().toISOString() 
              : null,
          }, {
            onConflict: 'stripe_invoice_id',
          });

        if (upsertError) {
          console.error(`[sync-invoices] Error upserting invoice ${invoice.id}:`, upsertError);
          errors++;
        } else {
          synced++;
        }

        // Log sync event
        await supabaseAdmin
          .from('stripe_sync_log')
          .insert({
            event_type: 'invoice.synced',
            stripe_event_id: `sync_${invoice.id}_${Date.now()}`,
            object_type: 'invoice',
            object_id: invoice.id,
            sync_direction: 'stripe_to_supabase',
            status: upsertError ? 'failed' : 'success',
            error_message: upsertError?.message || null,
          });

      } catch (err: any) {
        console.error(`[sync-invoices] Error processing invoice ${invoice.id}:`, err);
        errors++;
      }
    }

    console.log(`[sync-invoices] Completed: ${synced} synced, ${errors} errors`);

    return NextResponse.json({ 
      success: true, 
      synced,
      errors,
      total: invoices.length,
      mode: isStripeTestMode ? 'test' : 'live'
    });

  } catch (err: any) {
    console.error('[sync-invoices] Fatal error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}, ['admin', 'content_manager']);

/**
 * GET /api/studio/stripe/sync-invoices
 * Get sync status
 */
export const GET = withAuth(async (request: NextRequest, user) => {
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

  } catch (err: any) {
    console.error('[sync-invoices] GET error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}, ['admin', 'content_manager']);
