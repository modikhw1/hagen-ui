import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import { SERVER_COPY } from '@/lib/admin/copy/server-errors';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { STRIPE_API_VERSION } from '@/lib/stripe/config';
import {
  getStripeConfigEnvNames,
  getStripeEnvironment,
  type StripeEnv,
} from '@/lib/stripe/environment';

const querySchema = z.object({
  env: z.enum(['live', 'test']).optional(),
  hours: z.coerce.number().int().min(1).max(168).default(24),
});

type DriftItem = {
  kind: 'invoice' | 'subscription';
  stripeId: string;
  reason: 'missing_in_mirror' | 'status_mismatch' | 'amount_mismatch';
  detail: string;
  stripeStatus?: string | null;
  mirrorStatus?: string | null;
  customerId?: string | null;
};

function makeStripe(env: StripeEnv): Stripe | null {
  const { secretKey } = getStripeConfigEnvNames(env);
  const key = process.env[secretKey];
  if (!key) return null;
  return new Stripe(key, {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
    timeout: 20_000,
  });
}

export const GET = withAuth(async (request: NextRequest, user) => {
  requireScope(user, 'billing.health.read');

  const parsed = querySchema.safeParse({
    env: request.nextUrl.searchParams.get('env') ?? undefined,
    hours: request.nextUrl.searchParams.get('hours') ?? undefined,
  });
  if (!parsed.success) {
    return jsonError(SERVER_COPY.invalidPayload, 400, { details: parsed.error.issues });
  }

  const env = parsed.data.env ?? getStripeEnvironment();
  const sinceUnix = Math.floor((Date.now() - parsed.data.hours * 3600 * 1000) / 1000);
  const stripe = makeStripe(env);

  if (!stripe) {
    return jsonError(`Stripe är inte konfigurerat för miljön ${env}`, 412);
  }

  const supabaseAdmin = createSupabaseAdmin();
  const drift: DriftItem[] = [];
  let scannedInvoices = 0;
  let scannedSubscriptions = 0;

  try {
    const list = await stripe.invoices.list({
      created: { gte: sinceUnix },
      limit: 100,
    });

    const stripeIds = list.data.map((invoice) => invoice.id).filter(Boolean);
    scannedInvoices = stripeIds.length;

    if (stripeIds.length > 0) {
      const { data: mirror } = await supabaseAdmin
        .from('invoices')
        .select('stripe_invoice_id, status, amount_due, environment')
        .in('stripe_invoice_id', stripeIds);

      const mirrorMap = new Map<
        string,
        { status: string | null; amount_due: number | null; environment: string | null }
      >();

      for (const row of mirror ?? []) {
        if (row.stripe_invoice_id) {
          mirrorMap.set(row.stripe_invoice_id, {
            status: row.status ?? null,
            amount_due: row.amount_due ?? null,
            environment: (row as { environment?: string | null }).environment ?? null,
          });
        }
      }

      for (const invoice of list.data) {
        if (!invoice.id) continue;
        const mirrored = mirrorMap.get(invoice.id);

        if (!mirrored) {
          drift.push({
            kind: 'invoice',
            stripeId: invoice.id,
            reason: 'missing_in_mirror',
            detail: `Faktura ${invoice.number ?? invoice.id} saknas i mirror`,
            stripeStatus: invoice.status ?? null,
            customerId:
              typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? null,
          });
          continue;
        }

        if ((invoice.status ?? null) !== mirrored.status) {
          drift.push({
            kind: 'invoice',
            stripeId: invoice.id,
            reason: 'status_mismatch',
            detail: `Status skiljer: Stripe=${invoice.status} vs mirror=${mirrored.status}`,
            stripeStatus: invoice.status ?? null,
            mirrorStatus: mirrored.status,
          });
        }

        if (
          typeof invoice.amount_due === 'number' &&
          mirrored.amount_due !== null &&
          invoice.amount_due !== mirrored.amount_due
        ) {
          drift.push({
            kind: 'invoice',
            stripeId: invoice.id,
            reason: 'amount_mismatch',
            detail: `Amount_due skiljer: Stripe=${invoice.amount_due} vs mirror=${mirrored.amount_due}`,
          });
        }
      }
    }
  } catch (error) {
    console.error('[Drift] Invoice scan failed:', error);
  }

  try {
    const list = await stripe.subscriptions.list({ status: 'all', limit: 100 });
    const stripeIds = list.data.map((subscription) => subscription.id);
    scannedSubscriptions = stripeIds.length;

    if (stripeIds.length > 0) {
      const { data: mirror } = await supabaseAdmin
        .from('subscriptions')
        .select('stripe_subscription_id, status')
        .in('stripe_subscription_id', stripeIds);

      const mirrorMap = new Map<string, string | null>();
      for (const row of mirror ?? []) {
        if (row.stripe_subscription_id) {
          mirrorMap.set(row.stripe_subscription_id, row.status ?? null);
        }
      }

      for (const subscription of list.data) {
        if (!mirrorMap.has(subscription.id)) {
          drift.push({
            kind: 'subscription',
            stripeId: subscription.id,
            reason: 'missing_in_mirror',
            detail: `Subscription ${subscription.id} saknas i mirror`,
            stripeStatus: subscription.status,
            customerId:
              typeof subscription.customer === 'string'
                ? subscription.customer
                : subscription.customer?.id ?? null,
          });
          continue;
        }

        const mirrorStatus = mirrorMap.get(subscription.id);
        if (mirrorStatus !== subscription.status) {
          drift.push({
            kind: 'subscription',
            stripeId: subscription.id,
            reason: 'status_mismatch',
            detail: `Status skiljer: Stripe=${subscription.status} vs mirror=${mirrorStatus}`,
            stripeStatus: subscription.status,
            mirrorStatus: mirrorStatus ?? null,
          });
        }
      }
    }
  } catch (error) {
    console.error('[Drift] Subscription scan failed:', error);
  }

  return new Response(
    JSON.stringify({
      environment: env,
      windowHours: parsed.data.hours,
      scannedAt: new Date().toISOString(),
      scanned: {
        invoices: scannedInvoices,
        subscriptions: scannedSubscriptions,
      },
      driftCount: drift.length,
      drift,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=60',
      },
    },
  );
}, ['admin']);
