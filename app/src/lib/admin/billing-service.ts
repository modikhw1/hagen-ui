import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { STRIPE_API_VERSION } from '@/lib/stripe/config';
import { upsertInvoiceMirror, upsertSubscriptionMirror } from '@/lib/stripe/mirror';
import { getStripeConfigEnvNames, type StripeEnv } from '@/lib/stripe/environment';
import { logStripeSync } from '@/lib/stripe/sync-log';

type BillingSyncPayload = {
  ok: boolean;
  syncedCount: number;
  skippedCount: number;
  idempotencyKey: string;
  environment: StripeEnv | 'all';
};

type SyncLogRow = {
  created_at: string;
  payload_summary: Record<string, unknown> | null;
};

function isMissingColumnError(message?: string | null) {
  return (
    typeof message === 'string' &&
    message.toLowerCase().includes('column') &&
    message.toLowerCase().includes('does not exist')
  );
}

function createStripeClient(env: StripeEnv) {
  const { secretKey } = getStripeConfigEnvNames(env);
  const value = process.env[secretKey];

  if (!value) {
    return null;
  }

  return new Stripe(value, {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
    timeout: 10000,
  });
}

async function listInvoices(client: Stripe) {
  const invoices: Stripe.Invoice[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const result = await client.invoices.list({
      limit: 100,
      created: { gte: Math.floor(new Date('2024-01-01').getTime() / 1000) },
      starting_after: startingAfter,
    }, { timeout: 10000 });

    invoices.push(...result.data);
    hasMore = result.has_more;
    startingAfter = result.data.at(-1)?.id;
  }

  return invoices;
}

async function listSubscriptions(client: Stripe) {
  const subscriptions: Stripe.Subscription[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const result = await client.subscriptions.list({
      limit: 100,
      status: 'active',
      starting_after: startingAfter,
    }, { timeout: 10000 });

    subscriptions.push(...result.data);
    hasMore = result.has_more;
    startingAfter = result.data.at(-1)?.id;
  }

  return subscriptions;
}

async function syncSingleEnv(params: {
  supabaseAdmin: SupabaseClient;
  env: StripeEnv;
  kind: 'invoices' | 'subscriptions';
}) {
  const client = createStripeClient(params.env);
  if (!client) {
    throw new Error(`Stripe är inte konfigurerat för ${params.env}`);
  }

  const items =
    params.kind === 'invoices'
      ? await listInvoices(client)
      : await listSubscriptions(client);

  let syncedCount = 0;
  let skippedCount = 0;

  const chunkSize = 20;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    
    await Promise.all(
      chunk.map(async (item) => {
        try {
          if (params.kind === 'invoices') {
            await upsertInvoiceMirror({
              supabaseAdmin: params.supabaseAdmin,
              invoice: item as Stripe.Invoice,
              environment: params.env,
            });
          } else {
            await upsertSubscriptionMirror({
              supabaseAdmin: params.supabaseAdmin,
              subscription: item as Stripe.Subscription,
              environment: params.env,
            });
          }
          syncedCount += 1;
        } catch (error) {
          skippedCount += 1;

          await logStripeSync({
            supabaseAdmin: params.supabaseAdmin,
            eventType: `admin.billing.sync_${params.kind}.item_failed`,
            objectType: params.kind === 'invoices' ? 'invoice' : 'subscription',
            objectId: item.id,
            syncDirection: 'stripe_to_supabase',
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : 'Okänt syncfel',
            payloadSummary: {
              environment: params.env,
            },
            environment: params.env,
          });
        }
      })
    );
  }

  return {
    syncedCount,
    skippedCount,
    total: items.length,
  };
}

async function logBillingSync(params: {
  supabaseAdmin: SupabaseClient;
  eventType: string;
  idempotencyKey: string;
  payload: BillingSyncPayload;
  environment: StripeEnv | 'all';
  status?: 'success' | 'failed';
}) {
  await logStripeSync({
    supabaseAdmin: params.supabaseAdmin,
    eventId: params.idempotencyKey,
    eventType: params.eventType,
    objectType: 'billing_admin',
    objectId: params.environment,
    syncDirection: 'stripe_to_supabase',
    status: params.status ?? 'success',
    payloadSummary: params.payload,
    environment: params.environment === 'all' ? null : params.environment,
  });
}

export async function syncBillingFromStripe(params: {
  supabaseAdmin: SupabaseClient;
  env: StripeEnv | 'all';
  idempotencyKey: string;
  kind: 'invoices' | 'subscriptions';
}) {
  const environments = params.env === 'all' ? (['test', 'live'] as const) : [params.env];

  let syncedCount = 0;
  let skippedCount = 0;

  for (const env of environments) {
    const result = await syncSingleEnv({
      supabaseAdmin: params.supabaseAdmin,
      env,
      kind: params.kind,
    });
    syncedCount += result.syncedCount;
    skippedCount += result.skippedCount;
  }

  const payload = {
    ok: true,
    syncedCount,
    skippedCount,
    idempotencyKey: params.idempotencyKey,
    environment: params.env,
  } satisfies BillingSyncPayload;

  await logBillingSync({
    supabaseAdmin: params.supabaseAdmin,
    eventType: `billing.sync_${params.kind}`,
    idempotencyKey: params.idempotencyKey,
    payload,
    environment: params.env,
  });

  return payload;
}

export async function getBillingHealthSnapshot(params: {
  supabaseAdmin: SupabaseClient;
  environment: StripeEnv;
}) {
  const { supabaseAdmin, environment } = params;
  const schemaWarnings: string[] = [];
  const syncLogEnvironmentWarning =
    'stripe_sync_log saknar environment-kolumn i databasen. Billing Health visar sync-loggar utan garanterad test/live-separation.';

  const countInvoicesQuery = (withEnvironmentFilter: boolean) => {
    let query = supabaseAdmin.from('invoices').select('*', { count: 'exact', head: true });
    if (withEnvironmentFilter) {
      query = query.eq('environment', environment);
    }
    return query;
  };

  const countSubscriptionsQuery = (withEnvironmentFilter: boolean) => {
    let query = supabaseAdmin.from('subscriptions').select('*', { count: 'exact', head: true });
    if (withEnvironmentFilter) {
      query = query.eq('environment', environment);
    }
    return query;
  };

  const getSyncLogQueries = (withEnvironmentFilter: boolean) => {
    const applyEnv = <T extends { eq: (column: string, value: string) => T }>(q: T) =>
      withEnvironmentFilter ? q.eq('environment', environment) : q;

    return [
      applyEnv(supabaseAdmin.from('stripe_sync_log').select('*', { count: 'exact', head: true }).eq('status', 'failed')),
      applyEnv(supabaseAdmin.from('stripe_sync_log').select('*').order('created_at', { ascending: false }).limit(20)),
      applyEnv(supabaseAdmin.from('stripe_sync_log').select('*').eq('status', 'failed').order('created_at', { ascending: false }).limit(10)),
      applyEnv(supabaseAdmin.from('stripe_sync_log').select('created_at, event_type, object_type, object_id').eq('status', 'success').order('created_at', { ascending: false }).limit(1)).maybeSingle(),
    ];
  };

  // Run everything in parallel
  const [
    invoicesCountResult,
    subscriptionsCountResult,
    failedSyncCountResult,
    recentSyncsResult,
    recentFailuresResult,
    latestSuccessResult
  ] = await Promise.all([
    countInvoicesQuery(true),
    countSubscriptionsQuery(true),
    ...getSyncLogQueries(true)
  ] as const);

  let mirroredInvoices = invoicesCountResult.count || 0;
  let mirroredSubscriptions = subscriptionsCountResult.count || 0;

  if (invoicesCountResult.error && isMissingColumnError(invoicesCountResult.error.message)) {
    schemaWarnings.push(
      'Migration 040 saknas i databasen. Billing Health visar totalsiffror utan miljöseparation.',
    );
    const fallbackInvoices = await countInvoicesQuery(false);
    mirroredInvoices = fallbackInvoices.count || 0;
  }

  if (
    subscriptionsCountResult.error &&
    isMissingColumnError(subscriptionsCountResult.error.message)
  ) {
    const fallbackSubscriptions = await countSubscriptionsQuery(false);
    mirroredSubscriptions = fallbackSubscriptions.count || 0;
  }

  const syncLogEnvironmentColumnMissing = [
    failedSyncCountResult,
    recentSyncsResult,
    recentFailuresResult,
    latestSuccessResult,
  ].some((result: any) => isMissingColumnError(result.error?.message));

  let finalFailedSyncCountResult = failedSyncCountResult;
  let finalRecentSyncsResult = recentSyncsResult;
  let finalRecentFailuresResult = recentFailuresResult;
  let finalLatestSuccessResult = latestSuccessResult;

  if (syncLogEnvironmentColumnMissing) {
    schemaWarnings.push(syncLogEnvironmentWarning);
    const fallbacks = await Promise.all(getSyncLogQueries(false));
    finalFailedSyncCountResult = fallbacks[0] as any;
    finalRecentSyncsResult = fallbacks[1] as any;
    finalRecentFailuresResult = fallbacks[2] as any;
    finalLatestSuccessResult = fallbacks[3] as any;
  }

  return {
    environment,
    schemaWarnings,
    stats: {
      mirroredInvoices,
      mirroredSubscriptions,
      failedSyncs: (finalFailedSyncCountResult as any).count || 0,
      latestSuccessfulSyncAt: (finalLatestSuccessResult as any).data?.created_at || null,
    },
    latestSuccess: (finalLatestSuccessResult as any).data || null,
    recentSyncs: (finalRecentSyncsResult as any).data || [],
    recentFailures: (finalRecentFailuresResult as any).data || [],
  };
}

export async function findRecentBillingResult(params: {
  supabaseAdmin: SupabaseClient;
  idempotencyKey: string;
  withinMs: number;
}) {
  const result = await (((params.supabaseAdmin.from('stripe_sync_log' as never) as never) as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order: (orderColumn: string, options: { ascending: boolean }) => {
          limit: (value: number) => {
            maybeSingle: () => Promise<{
              data: SyncLogRow | null;
              error: { message?: string } | null;
            }>;
          };
        };
      };
    };
  }).select('created_at, payload_summary'))
    .eq('event_id', params.idempotencyKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    return null;
  }

  const createdAt = result.data?.created_at ? new Date(result.data.created_at).getTime() : 0;
  if (!createdAt || Date.now() - createdAt > params.withinMs) {
    return null;
  }

  return result.data?.payload_summary ?? null;
}
