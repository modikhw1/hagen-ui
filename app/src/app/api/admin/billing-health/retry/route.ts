import { NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { withAuth } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { stripe, stripeEnvironment } from '@/lib/stripe/dynamic-config';
import { upsertInvoiceMirror, upsertSubscriptionMirror } from '@/lib/stripe/mirror';
import { logStripeSync } from '@/lib/stripe/sync-log';

export const POST = withAuth(async (_request: NextRequest) => {
  if (!stripe) {
    return jsonError('Stripe ar inte konfigurerat i denna miljo', 503);
  }

  const supabaseAdmin = createSupabaseAdmin();
  const startedAt = Date.now();

  try {
    const [invoiceResult, subscriptionResult] = await Promise.allSettled([
      syncInvoices(supabaseAdmin),
      syncSubscriptions(supabaseAdmin),
    ]);

    const payload = {
      invoices:
        invoiceResult.status === 'fulfilled'
          ? invoiceResult.value
          : {
              synced: 0,
              errors: 1,
              total: 0,
              message:
                invoiceResult.reason instanceof Error
                  ? invoiceResult.reason.message
                  : 'Invoice-sync misslyckades',
            },
      subscriptions:
        subscriptionResult.status === 'fulfilled'
          ? subscriptionResult.value
          : {
              synced: 0,
              errors: 1,
              total: 0,
              message:
                subscriptionResult.reason instanceof Error
                  ? subscriptionResult.reason.message
                  : 'Subscription-sync misslyckades',
            },
      took_ms: Date.now() - startedAt,
    };

    await logStripeSync({
      supabaseAdmin,
      eventId: `admin_billing_retry_${Date.now()}`,
      eventType: 'admin.billing.retry',
      objectType: 'billing_health',
      objectId: null,
      syncDirection: 'stripe_to_supabase',
      status:
        payload.invoices.errors > 0 || payload.subscriptions.errors > 0
          ? 'failed'
          : 'success',
      errorMessage:
        payload.invoices.errors > 0 || payload.subscriptions.errors > 0
          ? 'Minst en retry-del misslyckades'
          : null,
      payloadSummary: payload,
      environment: stripeEnvironment,
    });

    return jsonOk(payload);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte kora billing-retry',
      500,
    );
  }
}, ['admin']);

async function syncInvoices(supabaseAdmin: ReturnType<typeof createSupabaseAdmin>) {
  const invoices: Stripe.Invoice[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const result = await stripe!.invoices.list({
      limit: 100,
      created: { gte: Math.floor(new Date('2024-01-01').getTime() / 1000) },
      starting_after: startingAfter,
    });

    invoices.push(...result.data);
    hasMore = result.has_more;
    startingAfter = result.data.at(-1)?.id;
  }

  let synced = 0;
  let errors = 0;

  for (const invoice of invoices) {
    try {
      await upsertInvoiceMirror({
        supabaseAdmin,
        invoice,
        environment: stripeEnvironment,
      });
      synced += 1;
    } catch {
      errors += 1;
    }
  }

  return {
    synced,
    errors,
    total: invoices.length,
    message: errors > 0 ? `${errors} invoice-poster misslyckades` : 'Invoice-sync klar',
  };
}

async function syncSubscriptions(supabaseAdmin: ReturnType<typeof createSupabaseAdmin>) {
  const subscriptions: Stripe.Subscription[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const result = await stripe!.subscriptions.list({
      limit: 100,
      status: 'all',
      starting_after: startingAfter,
    });

    subscriptions.push(...result.data);
    hasMore = result.has_more;
    startingAfter = result.data.at(-1)?.id;
  }

  let synced = 0;
  let errors = 0;

  for (const subscription of subscriptions) {
    try {
      await upsertSubscriptionMirror({
        supabaseAdmin,
        subscription,
        environment: stripeEnvironment,
      });
      synced += 1;
    } catch {
      errors += 1;
    }
  }

  return {
    synced,
    errors,
    total: subscriptions.length,
    message:
      errors > 0 ? `${errors} subscription-poster misslyckades` : 'Subscription-sync klar',
  };
}
