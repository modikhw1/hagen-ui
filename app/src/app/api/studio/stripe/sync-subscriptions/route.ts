import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe, isStripeTestMode } from '@/lib/stripe/dynamic-config';
import { withAuth } from '@/lib/auth/api-auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * POST /api/studio/stripe/sync-subscriptions
 * Sync all subscriptions from Stripe to Supabase
 */
export const POST = withAuth(async (request: NextRequest, user) => {
  try {
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`[sync-subscriptions] Starting sync from Stripe (${isStripeTestMode ? 'TEST' : 'LIVE'})`);

    // Fetch all subscriptions from Stripe
    const subscriptions: any[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const params: any = {
        limit: 100,
        status: 'all',
      };
      if (startingAfter) params.starting_after = startingAfter;

      const result = await stripe.subscriptions.list(params);
      subscriptions.push(...result.data);
      hasMore = result.has_more;

      if (hasMore && result.data.length > 0) {
        startingAfter = result.data[result.data.length - 1].id;
      }
    }

    console.log(`[sync-subscriptions] Found ${subscriptions.length} subscriptions in Stripe`);

    let synced = 0;
    let errors = 0;

    for (const sub of subscriptions) {
      try {
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;

        // Find customer profile by stripe_customer_id
        let customerProfileId: string | null = null;
        if (customerId) {
          const { data: profile } = await supabaseAdmin
            .from('customer_profiles')
            .select('id')
            .eq('stripe_customer_id', customerId)
            .maybeSingle();
          if (profile) customerProfileId = profile.id;
        }

        // Extract price amount from items
        const item = sub.items?.data?.[0];
        const amount = item?.price?.unit_amount ?? 0;
        const interval = item?.price?.recurring?.interval ?? 'month';
        const intervalCount = item?.price?.recurring?.interval_count ?? 1;

        const { error: upsertError } = await supabaseAdmin
          .from('subscriptions')
          .upsert({
            stripe_subscription_id: sub.id,
            stripe_customer_id: customerId,
            customer_profile_id: customerProfileId,
            status: sub.status,
            cancel_at_period_end: sub.cancel_at_period_end ?? false,
            amount,
            interval,
            interval_count: intervalCount,
            current_period_start: sub.current_period_start
              ? new Date(sub.current_period_start * 1000).toISOString()
              : null,
            current_period_end: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null,
            created: sub.created
              ? new Date(sub.created * 1000).toISOString()
              : new Date().toISOString(),
          }, {
            onConflict: 'stripe_subscription_id',
          });

        if (upsertError) {
          console.error(`[sync-subscriptions] Error upserting ${sub.id}:`, upsertError);
          errors++;
        } else {
          synced++;
        }
      } catch (err: any) {
        console.error(`[sync-subscriptions] Error processing ${sub.id}:`, err);
        errors++;
      }
    }

    console.log(`[sync-subscriptions] Completed: ${synced} synced, ${errors} errors`);

    return NextResponse.json({
      success: true,
      synced,
      errors,
      total: subscriptions.length,
      mode: isStripeTestMode ? 'test' : 'live',
    });
  } catch (err: any) {
    console.error('[sync-subscriptions] Fatal error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}, ['admin', 'content_manager']);
