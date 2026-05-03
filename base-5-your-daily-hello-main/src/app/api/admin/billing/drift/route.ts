import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { STRIPE_API_VERSION } from '@/lib/stripe/config';
import {
  getStripeConfigEnvNames,
  getStripeEnvironment,
  type StripeEnv,
} from '@/lib/stripe/environment';
import { SERVER_COPY } from '@/lib/admin/copy/server-errors';

/**
 * Leverans 5: Drift-detektor.
 *
 * Jämför mirror (Supabase) mot Stripe live för senaste N timmarna och
 * returnerar avvikelser (saknade fakturor/sub, fel status, fel belopp).
 *
 * Lättviktig: hämtar bara senaste fönstret, inte hela historiken.
 */

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
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION, typescript: true, timeout: 20000 });
}

export const GET = withAuth(async (request: NextRequest, user) => {
  requireScope(user, 'billing.health.read');

  const url = request.nextUrl;
  const parsed = querySchema.safeParse({
    env: url.searchParams.get('env') ?? undefined,
    hours: url.searchParams.get('hours') ?? undefined,
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

  // ---------- Invoices ----------
  try {
    const list = await stripe.invoices.list({
      created: { gte: sinceUnix },
      limit: 100,
    });

    const stripeIds = list.data.map((i) => i.id).filter((x): x is string => Boolean(x));
    scannedInvoices = stripeIds.length;

    if (stripeIds.length > 0) {
      const { data: mirror } = await supabaseAdmin
        .from('invoices')
        .select('stripe_invoice_id, status, amount_due, environment')
        .in('stripe_invoice_id', stripeIds);

      const mirrorMap = new Map<string, { status: string | null; amount_due: number | null; environment: string | null }>();
      for (const row of mirror ?? []) {
        if (row.stripe_invoice_id) {
          mirrorMap.set(row.stripe_invoice_id, {
            status: row.status ?? null,
            amount_due: row.amount_due ?? null,
            environment: (row as { environment?: string | null }).environment ?? null,
          });
        }
      }

      for (const inv of list.data) {
        if (!inv.id) continue;
        const m = mirrorMap.get(inv.id);
        if (!m) {
          drift.push({
            kind: 'invoice',
            stripeId: inv.id,
            reason: 'missing_in_mirror',
            detail: `Faktura ${inv.number ?? inv.id} saknas i mirror`,
            stripeStatus: inv.status ?? null,
            customerId: typeof inv.customer === 'string' ? inv.customer : inv.customer?.id ?? null,
          });
          continue;
        }
        if ((inv.status ?? null) !== m.status) {
          drift.push({
            kind: 'invoice',
            stripeId: inv.id,
            reason: 'status_mismatch',
            detail: `Status skiljer: Stripe=${inv.status} vs mirror=${m.status}`,
            stripeStatus: inv.status ?? null,
            mirrorStatus: m.status,
          });
        }
        if (typeof inv.amount_due === 'number' && m.amount_due !== null && inv.amount_due !== m.amount_due) {
          drift.push({
            kind: 'invoice',
            stripeId: inv.id,
            reason: 'amount_mismatch',
            detail: `Amount_due skiljer: Stripe=${inv.amount_due} vs mirror=${m.amount_due}`,
          });
        }
      }
    }
  } catch (err) {
    console.error('[Drift] Invoice scan failed:', err);
  }

  // ---------- Subscriptions ----------
  try {
    const list = await stripe.subscriptions.list({ status: 'all', limit: 100 });
    const stripeIds = list.data.map((s) => s.id);
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

      for (const sub of list.data) {
        if (!mirrorMap.has(sub.id)) {
          drift.push({
            kind: 'subscription',
            stripeId: sub.id,
            reason: 'missing_in_mirror',
            detail: `Subscription ${sub.id} saknas i mirror`,
            stripeStatus: sub.status,
            customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null,
          });
        } else {
          const mirrorStatus = mirrorMap.get(sub.id);
          if (mirrorStatus !== sub.status) {
            drift.push({
              kind: 'subscription',
              stripeId: sub.id,
              reason: 'status_mismatch',
              detail: `Status skiljer: Stripe=${sub.status} vs mirror=${mirrorStatus}`,
              stripeStatus: sub.status,
              mirrorStatus: mirrorStatus ?? null,
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('[Drift] Subscription scan failed:', err);
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
