import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { stripe, isStripeTestMode, stripeEnvironment } from '@/lib/stripe/dynamic-config';
import { withAuth } from '@/lib/auth/api-auth';
import { upsertSubscriptionMirror } from '@/lib/stripe/mirror';
import { logStripeSync } from '@/lib/stripe/sync-log';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
type SyncSubscription = Stripe.Subscription & {
  current_period_start?: number | null;
  current_period_end?: number | null;
};

/**
 * POST /api/studio/stripe/sync-subscriptions
 * Sync all subscriptions from Stripe to Supabase
 */
export const POST = withAuth(async () => {
  const startedAt = Date.now();
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  try {
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
    }

    console.log(`[sync-subscriptions] Starting sync from Stripe (${isStripeTestMode ? 'TEST' : 'LIVE'})`);

    // Fetch all subscriptions from Stripe
    const subscriptions: SyncSubscription[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const params: Stripe.SubscriptionListParams = {
        limit: 100,
        status: 'all',
      };
      if (startingAfter) params.starting_after = startingAfter;

      const result = await stripe.subscriptions.list(params);
      subscriptions.push(...(result.data as SyncSubscription[]));
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
        await upsertSubscriptionMirror({
          supabaseAdmin,
          subscription: sub,
          environment: stripeEnvironment,
        });
        synced++;
      } catch (err: unknown) {
        console.error(`[sync-subscriptions] Error processing ${sub.id}:`, err);
        errors++;
      }
    }

    console.log(`[sync-subscriptions] Completed: ${synced} synced, ${errors} errors`);

    await logStripeSync({
      supabaseAdmin,
      eventId: `manual_subscription_sync_${Date.now()}`,
      eventType: 'manual_subscription_sync',
      objectType: 'subscription',
      objectId: null,
      syncDirection: 'stripe_to_supabase',
      status: errors > 0 ? 'failed' : 'success',
      errorMessage: errors > 0 ? `${errors} subscriptions failed to sync` : null,
      payloadSummary: {
        count: synced,
        errors,
        total: subscriptions.length,
        took_ms: Date.now() - startedAt,
        environment: stripeEnvironment,
      },
    });

    return NextResponse.json({
      success: true,
      synced,
      errors,
      total: subscriptions.length,
      mode: isStripeTestMode ? 'test' : 'live',
    });
  } catch (err: unknown) {
    console.error('[sync-subscriptions] Fatal error:', err);
    await logStripeSync({
      supabaseAdmin,
      eventId: `manual_subscription_sync_${Date.now()}`,
      eventType: 'manual_subscription_sync',
      objectType: 'subscription',
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
