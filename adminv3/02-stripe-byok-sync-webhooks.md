# 02 – Stripe BYOK: sync, webhooks och lib/stripe/*

> Bundlen visar `dynamic-config`, `mirror`, sync-routes och `admin-billing`-imports
> men **webhook-mottagaren saknas** och `admin-billing.ts` är bara importerad.
> Detta dokument tillhandahåller full kod för alla `lib/stripe/*`-moduler,
> webhook-routen, samt en cron-rekommendation.

## Filer som ska finnas

```
app/src/lib/stripe/
  config.ts                # statiska defaults (currency, tax_code)
  environment.ts           # getStripeEnvironment(), env-namn
  dynamic-config.ts        # stripe-singleton + stripeEnvironment
  mirror.ts                # syncInvoiceLineItems (finns i bundle)
  sync-log.ts              # logStripeSync()
  admin-billing.ts         # discount, pending items, manual invoice, pause/resume/cancel, archive
  subscription-pricing.ts  # applyPriceToSubscription
  invite.ts                # sendCustomerInvite (Stripe customer + sub + Supabase invite)
  customer-access.ts       # hjälpare för att verifiera att en Stripe-resurs hör till en kund

app/src/app/api/stripe/webhook/route.ts   # NY — receives invoice.* / customer.subscription.* events
app/src/app/api/studio/stripe/sync-invoices/route.ts       # finns i bundle
app/src/app/api/studio/stripe/sync-subscriptions/route.ts  # finns i bundle
app/src/app/api/studio/stripe/status/route.ts              # finns i bundle
```

---

## 1. `lib/stripe/config.ts`

```ts
export const STRIPE_API_VERSION = '2026-02-25.clover' as const;
export const DEFAULT_CURRENCY = 'sek';
export const DEFAULT_TAX_CODE = 'txcd_10000000'; // General services
export const DEFAULT_DAYS_UNTIL_DUE = 14;
export const DEFAULT_BILLING_DAY = 25;
```

## 2. `lib/stripe/environment.ts`

```ts
export type StripeEnv = 'test' | 'live';

export function getStripeEnvironment(): StripeEnv {
  const env = (process.env.STRIPE_ENV || 'test').toLowerCase();
  return env === 'live' ? 'live' : 'test';
}

export function getStripeConfigEnvNames(env: StripeEnv) {
  const upper = env.toUpperCase();
  return {
    secretKey: `STRIPE_${upper}_SECRET_KEY` as const,
    publishableKey: `STRIPE_${upper}_PUBLISHABLE_KEY` as const,
    webhookSecret: `STRIPE_${upper}_WEBHOOK_SECRET` as const,
  };
}
```

## 3. `lib/stripe/dynamic-config.ts`

```ts
import Stripe from 'stripe';
import { STRIPE_API_VERSION } from './config';
import { getStripeConfigEnvNames, getStripeEnvironment } from './environment';

export const stripeEnvironment = getStripeEnvironment();
export const isStripeTestMode = stripeEnvironment === 'test';

const { secretKey } = getStripeConfigEnvNames(stripeEnvironment);
const SECRET = process.env[secretKey];

export const stripe = SECRET
  ? new Stripe(SECRET, { apiVersion: STRIPE_API_VERSION })
  : null;
```

## 4. `lib/stripe/sync-log.ts`

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export async function logStripeSync(params: {
  supabaseAdmin: SupabaseClient;
  eventId: string | null;
  eventType: string;
  objectType: string | null;
  objectId: string | null;
  syncDirection: 'stripe_to_supabase' | 'supabase_to_stripe';
  status: 'success' | 'failed' | 'skipped' | 'in_progress';
  errorMessage?: string | null;
  payloadSummary?: Record<string, unknown> | null;
  environment?: 'test' | 'live';
}) {
  await params.supabaseAdmin.from('stripe_sync_log').insert({
    stripe_event_id: params.eventId,
    event_type: params.eventType,
    object_type: params.objectType,
    object_id: params.objectId,
    sync_direction: params.syncDirection,
    status: params.status,
    error_message: params.errorMessage ?? null,
    payload_summary: params.payloadSummary ?? null,
    environment: params.environment ?? null,
  });
}
```

## 5. `lib/stripe/mirror.ts`

Använd den från bundle 04 (visad i sin helhet). Lägg till motsvarande helper för subscription:

```ts
// Lägg till i mirror.ts
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function upsertInvoiceMirror(params: {
  supabaseAdmin: SupabaseClient;
  invoice: Stripe.Invoice;
  environment: 'test' | 'live';
}) {
  const { supabaseAdmin, invoice, environment } = params;
  const stripeCustomerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? null;
  const stripeSubscriptionId =
    typeof (invoice as any).subscription === 'string'
      ? (invoice as any).subscription
      : (invoice as any).subscription?.id ?? null;

  let customerProfileId: string | null = null;
  if (stripeCustomerId) {
    const { data } = await supabaseAdmin
      .from('customer_profiles')
      .select('id')
      .eq('stripe_customer_id', stripeCustomerId)
      .maybeSingle();
    customerProfileId = data?.id ?? null;
  }

  await supabaseAdmin.from('invoices').upsert(
    {
      stripe_invoice_id: invoice.id,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
      customer_profile_id: customerProfileId,
      amount_due: invoice.amount_due,
      amount_paid: invoice.amount_paid,
      currency: invoice.currency || 'sek',
      status: invoice.status,
      hosted_invoice_url: invoice.hosted_invoice_url,
      invoice_pdf: invoice.invoice_pdf,
      due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
      paid_at: invoice.status === 'paid' ? new Date().toISOString() : null,
      environment,
      raw: invoice as any,
    },
    { onConflict: 'stripe_invoice_id' }
  );

  if (invoice.lines?.data?.length) {
    const { syncInvoiceLineItems } = await import('./mirror');
    await syncInvoiceLineItems({
      supabaseAdmin,
      invoiceId: invoice.id!,
      lineItems: invoice.lines.data,
      environment,
    });
  }
}

export async function upsertSubscriptionMirror(params: {
  supabaseAdmin: SupabaseClient;
  subscription: Stripe.Subscription;
  environment: 'test' | 'live';
}) {
  const { supabaseAdmin, subscription, environment } = params;
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id ?? null;

  let customerProfileId: string | null = null;
  if (customerId) {
    const { data } = await supabaseAdmin
      .from('customer_profiles')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    customerProfileId = data?.id ?? null;
  }

  const item = subscription.items?.data?.[0];
  const amount = item?.price?.unit_amount ?? 0;
  const interval = item?.price?.recurring?.interval ?? 'month';
  const intervalCount = item?.price?.recurring?.interval_count ?? 1;

  await supabaseAdmin.from('subscriptions').upsert(
    {
      stripe_subscription_id: subscription.id,
      stripe_customer_id: customerId,
      customer_profile_id: customerProfileId,
      status: subscription.status,
      cancel_at_period_end: subscription.cancel_at_period_end ?? false,
      amount,
      interval,
      interval_count: intervalCount,
      current_period_start: (subscription as any).current_period_start
        ? new Date((subscription as any).current_period_start * 1000).toISOString()
        : null,
      current_period_end: (subscription as any).current_period_end
        ? new Date((subscription as any).current_period_end * 1000).toISOString()
        : null,
      pause_collection: subscription.pause_collection ?? null,
      environment,
      raw: subscription as any,
    },
    { onConflict: 'stripe_subscription_id' }
  );

  // Synka tillbaka status till customer_profiles
  if (customerProfileId) {
    await supabaseAdmin
      .from('customer_profiles')
      .update({
        status: mapSubStatusToCustomerStatus(subscription.status, subscription.cancel_at_period_end),
      })
      .eq('id', customerProfileId);
  }
}

function mapSubStatusToCustomerStatus(s: string, cancelAtEnd: boolean) {
  if (s === 'active' && !cancelAtEnd) return 'active';
  if (s === 'trialing') return 'agreed';
  if (s === 'past_due') return 'past_due';
  if (s === 'canceled') return 'cancelled';
  if (s === 'paused') return 'pending_payment';
  return 'pending';
}
```

## 6. `lib/stripe/admin-billing.ts` (full)

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { stripeEnvironment } from './dynamic-config';
import { upsertInvoiceMirror, upsertSubscriptionMirror } from './mirror';
import { logStripeSync } from './sync-log';
import { DEFAULT_CURRENCY, DEFAULT_DAYS_UNTIL_DUE } from './config';

type Ctx = { supabaseAdmin: SupabaseClient; stripeClient: Stripe | null };

async function getProfileWithStripe(ctx: Ctx, profileId: string) {
  const { data, error } = await ctx.supabaseAdmin
    .from('customer_profiles')
    .select('id, business_name, contact_email, monthly_price, stripe_customer_id, stripe_subscription_id')
    .eq('id', profileId)
    .single();
  if (error || !data) throw new Error('Customer not found');
  return data;
}

function ensureStripe(ctx: Ctx): Stripe {
  if (!ctx.stripeClient) throw new Error('Stripe not configured on server');
  return ctx.stripeClient;
}

// ---- Discount ----
export async function applyCustomerDiscount(args: Ctx & {
  profileId: string;
  input: { type: 'percent' | 'amount' | 'free_months'; value: number; durationMonths: number | null; ongoing: boolean };
}) {
  const stripe = ensureStripe(args);
  const profile = await getProfileWithStripe(args, args.profileId);
  if (!profile.stripe_customer_id) throw new Error('Kunden saknar Stripe customer');

  let coupon: Stripe.Coupon;
  if (args.input.type === 'percent') {
    coupon = await stripe.coupons.create({
      percent_off: args.input.value,
      duration: args.input.ongoing ? 'forever' : args.input.durationMonths ? 'repeating' : 'once',
      duration_in_months: !args.input.ongoing ? args.input.durationMonths ?? 1 : undefined,
      currency: DEFAULT_CURRENCY,
    });
  } else if (args.input.type === 'amount') {
    coupon = await stripe.coupons.create({
      amount_off: Math.round(args.input.value * 100),
      currency: DEFAULT_CURRENCY,
      duration: args.input.ongoing ? 'forever' : args.input.durationMonths ? 'repeating' : 'once',
      duration_in_months: !args.input.ongoing ? args.input.durationMonths ?? 1 : undefined,
    });
  } else {
    coupon = await stripe.coupons.create({
      percent_off: 100,
      duration: 'repeating',
      duration_in_months: Math.max(1, args.input.value),
    });
  }

  await stripe.customers.update(profile.stripe_customer_id, { coupon: coupon.id });

  await args.supabaseAdmin
    .from('customer_profiles')
    .update({
      discount_type: args.input.type,
      discount_value: args.input.value,
      discount_duration_months: args.input.durationMonths,
    })
    .eq('id', profile.id);

  await logStripeSync({
    supabaseAdmin: args.supabaseAdmin,
    eventId: `discount_${profile.id}_${Date.now()}`,
    eventType: 'admin.discount.applied',
    objectType: 'customer',
    objectId: profile.stripe_customer_id,
    syncDirection: 'supabase_to_stripe',
    status: 'success',
    environment: stripeEnvironment,
    payloadSummary: { coupon: coupon.id, ...args.input },
  });

  return { coupon_id: coupon.id };
}

export async function removeCustomerDiscount(args: Ctx & { profileId: string }) {
  const stripe = ensureStripe(args);
  const profile = await getProfileWithStripe(args, args.profileId);
  if (!profile.stripe_customer_id) throw new Error('Kunden saknar Stripe customer');
  await stripe.customers.deleteDiscount(profile.stripe_customer_id);
  await args.supabaseAdmin
    .from('customer_profiles')
    .update({ discount_type: 'none', discount_value: 0, discount_duration_months: null })
    .eq('id', profile.id);
  return { removed: true };
}

// ---- Pending invoice items ----
export async function listPendingInvoiceItems(args: Ctx & { profileId: string }) {
  const stripe = ensureStripe(args);
  const profile = await getProfileWithStripe(args, args.profileId);
  if (!profile.stripe_customer_id) return [];
  const items = await stripe.invoiceItems.list({ customer: profile.stripe_customer_id, pending: true, limit: 50 });
  return items.data.map((i) => ({
    id: i.id,
    description: i.description ?? '',
    amount_ore: i.amount,
    amount_sek: i.amount / 100,
    currency: i.currency,
    created: i.date ? new Date(i.date * 1000).toISOString() : null,
  }));
}

export async function createPendingInvoiceItem(args: Ctx & {
  profileId: string;
  input: { description: string; amountSek: number; currency: string };
}) {
  const stripe = ensureStripe(args);
  const profile = await getProfileWithStripe(args, args.profileId);
  if (!profile.stripe_customer_id) throw new Error('Kunden saknar Stripe customer');
  const item = await stripe.invoiceItems.create({
    customer: profile.stripe_customer_id,
    amount: Math.round(args.input.amountSek * 100),
    currency: args.input.currency || DEFAULT_CURRENCY,
    description: args.input.description,
  });
  return {
    id: item.id,
    description: item.description ?? '',
    amount_ore: item.amount,
    amount_sek: item.amount / 100,
    currency: item.currency,
    created: item.date ? new Date(item.date * 1000).toISOString() : null,
  };
}

export async function deletePendingInvoiceItem(args: Ctx & { itemId: string }) {
  const stripe = ensureStripe(args);
  await stripe.invoiceItems.del(args.itemId);
  return { ok: true };
}

// ---- Manual invoice ----
export async function createManualInvoice(args: Ctx & {
  profileId: string;
  items: { description: string; amountSek: number }[];
  daysUntilDue: number;
  autoFinalize: boolean;
}) {
  const stripe = ensureStripe(args);
  const profile = await getProfileWithStripe(args, args.profileId);
  if (!profile.stripe_customer_id) throw new Error('Kunden saknar Stripe customer');

  for (const item of args.items) {
    await stripe.invoiceItems.create({
      customer: profile.stripe_customer_id,
      amount: Math.round(item.amountSek * 100),
      currency: DEFAULT_CURRENCY,
      description: item.description,
    });
  }

  const invoice = await stripe.invoices.create({
    customer: profile.stripe_customer_id,
    collection_method: 'send_invoice',
    days_until_due: args.daysUntilDue ?? DEFAULT_DAYS_UNTIL_DUE,
    pending_invoice_items_behavior: 'include',
    metadata: { customer_profile_id: profile.id, source: 'admin_manual_invoice' },
  });

  if (args.autoFinalize) {
    const finalized = await stripe.invoices.finalizeInvoice(invoice.id!);
    await stripe.invoices.sendInvoice(finalized.id!);
    await upsertInvoiceMirror({ supabaseAdmin: args.supabaseAdmin, invoice: finalized, environment: stripeEnvironment });
    return finalized;
  }

  await upsertInvoiceMirror({ supabaseAdmin: args.supabaseAdmin, invoice, environment: stripeEnvironment });
  return invoice;
}

// ---- Subscription lifecycle ----
export async function pauseCustomerSubscription(args: Ctx & { profileId: string }) {
  const stripe = ensureStripe(args);
  const profile = await getProfileWithStripe(args, args.profileId);
  if (!profile.stripe_subscription_id) throw new Error('Inget aktivt abonnemang');
  const sub = await stripe.subscriptions.update(profile.stripe_subscription_id, {
    pause_collection: { behavior: 'mark_uncollectible' },
  });
  await upsertSubscriptionMirror({ supabaseAdmin: args.supabaseAdmin, subscription: sub, environment: stripeEnvironment });
  return sub;
}

export async function resumeCustomerSubscription(args: Ctx & { profileId: string }) {
  const stripe = ensureStripe(args);
  const profile = await getProfileWithStripe(args, args.profileId);
  if (!profile.stripe_subscription_id) throw new Error('Inget aktivt abonnemang');
  const sub = await stripe.subscriptions.update(profile.stripe_subscription_id, { pause_collection: '' as any });
  await upsertSubscriptionMirror({ supabaseAdmin: args.supabaseAdmin, subscription: sub, environment: stripeEnvironment });
  return sub;
}

export async function cancelCustomerSubscription(args: Ctx & { profileId: string }) {
  const stripe = ensureStripe(args);
  const profile = await getProfileWithStripe(args, args.profileId);
  if (!profile.stripe_subscription_id) throw new Error('Inget aktivt abonnemang');
  const sub = await stripe.subscriptions.update(profile.stripe_subscription_id, { cancel_at_period_end: true });
  await upsertSubscriptionMirror({ supabaseAdmin: args.supabaseAdmin, subscription: sub, environment: stripeEnvironment });
  return sub;
}

// ---- Archive (DELETE customer route) ----
export async function archiveStripeCustomer(args: Ctx & { profileId: string }) {
  const profile = await getProfileWithStripe(args, args.profileId);
  if (!args.stripeClient || !profile.stripe_customer_id) return { skipped: true };
  try {
    if (profile.stripe_subscription_id) {
      await args.stripeClient.subscriptions.cancel(profile.stripe_subscription_id);
    }
  } catch (e) { console.warn('cancel sub failed', e); }
  return { archived: true };
}
```

## 7. `lib/stripe/subscription-pricing.ts`

```ts
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { stripeEnvironment } from './dynamic-config';
import { upsertSubscriptionMirror } from './mirror';
import { logStripeSync } from './sync-log';
import { DEFAULT_CURRENCY } from './config';

export async function applyPriceToSubscription(args: {
  stripeClient: Stripe;
  subscriptionId: string;
  monthlyPriceSek: number;
  source: 'admin_manual' | 'scheduled_upcoming';
  supabaseAdmin: SupabaseClient;
}) {
  const sub = await args.stripeClient.subscriptions.retrieve(args.subscriptionId);
  const item = sub.items.data[0];
  if (!item) throw new Error('Subscription saknar items');

  const productId = typeof item.price.product === 'string' ? item.price.product : item.price.product.id;
  const interval = item.price.recurring?.interval ?? 'month';
  const intervalCount = item.price.recurring?.interval_count ?? 1;

  const newPrice = await args.stripeClient.prices.create({
    unit_amount: Math.round(args.monthlyPriceSek * 100),
    currency: DEFAULT_CURRENCY,
    recurring: { interval, interval_count: intervalCount },
    product: productId,
  });

  const updated = await args.stripeClient.subscriptions.update(sub.id, {
    items: [{ id: item.id, price: newPrice.id }],
    proration_behavior: 'create_prorations',
    metadata: { ...sub.metadata, price_source: args.source, price_changed_at: new Date().toISOString() },
  });

  await upsertSubscriptionMirror({ supabaseAdmin: args.supabaseAdmin, subscription: updated, environment: stripeEnvironment });
  await logStripeSync({
    supabaseAdmin: args.supabaseAdmin,
    eventId: `price_change_${sub.id}_${Date.now()}`,
    eventType: 'admin.price.applied',
    objectType: 'subscription',
    objectId: sub.id,
    syncDirection: 'supabase_to_stripe',
    status: 'success',
    environment: stripeEnvironment,
    payloadSummary: { newPrice: newPrice.id, source: args.source },
  });

  return updated;
}
```

## 8. `lib/stripe/invite.ts`

> Ren wrapper. Den faktiska invite-logiken (skapa kund/sub + Supabase
> `inviteUserByEmail`) finns redan i `api/admin/customers/[id]/route.ts`
> action `send_invite`. För `api/admin/customers/route.ts` POST används
> denna wrapper.

```ts
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';

export type SendInviteResult =
  | { ok: true; profile: any }
  | { ok: false; error: string };

export async function sendCustomerInvite(args: {
  supabaseAdmin: SupabaseClient;
  stripeClient: Stripe | null;
  profileId: string;
  payload: any;
  appUrl: string;
}): Promise<SendInviteResult> {
  // Återanvänd action='send_invite'-flödet via direkt funktionsanrop hellre än HTTP.
  // För enkelhet: anropa Supabase auth invite + Stripe customer create här.
  try {
    const { data: profile } = await args.supabaseAdmin
      .from('customer_profiles')
      .select('*')
      .eq('id', args.profileId)
      .single();
    if (!profile) return { ok: false, error: 'Profil saknas' };

    let stripeCustomerId: string | null = profile.stripe_customer_id;
    let stripeSubscriptionId: string | null = profile.stripe_subscription_id;

    if (
      args.stripeClient &&
      !stripeCustomerId &&
      args.payload.pricing_status === 'fixed' &&
      Number(args.payload.monthly_price) > 0
    ) {
      const customer = await args.stripeClient.customers.create({
        email: profile.contact_email,
        name: profile.business_name,
        preferred_locales: ['sv'],
        metadata: { customer_profile_id: profile.id },
      });
      stripeCustomerId = customer.id;
      // (Sub creation kan utföras här eller skjutas till activation)
    }

    const { error: inviteError } = await args.supabaseAdmin.auth.admin.inviteUserByEmail(
      profile.contact_email,
      {
        data: { business_name: profile.business_name, customer_profile_id: profile.id, stripe_customer_id: stripeCustomerId },
        redirectTo: `${args.appUrl}/auth/callback`,
      }
    );
    if (inviteError) return { ok: false, error: inviteError.message };

    const { data: updated } = await args.supabaseAdmin
      .from('customer_profiles')
      .update({
        status: 'invited',
        invited_at: new Date().toISOString(),
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
      })
      .eq('id', profile.id)
      .select()
      .single();

    return { ok: true, profile: updated };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Invite-fel' };
  }
}
```

## 9. `lib/stripe/customer-access.ts`

```ts
import type Stripe from 'stripe';
export async function assertInvoiceItemBelongsToCustomer(stripe: Stripe, itemId: string, customerId: string) {
  const item = await stripe.invoiceItems.retrieve(itemId);
  const itemCustomerId = typeof item.customer === 'string' ? item.customer : item.customer?.id ?? null;
  if (itemCustomerId !== customerId) throw new Error('Resursen tillhör inte kunden');
  return item;
}
```

---

## 10. **NY** — Stripe webhook receiver

`app/src/app/api/stripe/webhook/route.ts`

> Detta är den **enda** källan till ground-truth-data i `invoices`/`subscriptions`-
> tabellerna i produktion. Manuella sync-routes används bara för backfill.

```ts
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { stripe, stripeEnvironment } from '@/lib/stripe/dynamic-config';
import { getStripeConfigEnvNames } from '@/lib/stripe/environment';
import { upsertInvoiceMirror, upsertSubscriptionMirror } from '@/lib/stripe/mirror';
import { logStripeSync } from '@/lib/stripe/sync-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const { webhookSecret } = getStripeConfigEnvNames(stripeEnvironment);
const WEBHOOK_SECRET = process.env[webhookSecret];

export async function POST(req: NextRequest) {
  if (!stripe || !WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Stripe webhook not configured' }, { status: 500 });
  }
  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET);
  } catch (err: any) {
    return NextResponse.json({ error: `Signature: ${err.message}` }, { status: 400 });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // Idempotens via unique stripe_event_id
  try {
    switch (event.type) {
      case 'invoice.created':
      case 'invoice.finalized':
      case 'invoice.paid':
      case 'invoice.payment_failed':
      case 'invoice.voided':
      case 'invoice.marked_uncollectible':
      case 'invoice.updated':
        await upsertInvoiceMirror({
          supabaseAdmin,
          invoice: event.data.object as Stripe.Invoice,
          environment: stripeEnvironment,
        });
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed':
        await upsertSubscriptionMirror({
          supabaseAdmin,
          subscription: event.data.object as Stripe.Subscription,
          environment: stripeEnvironment,
        });
        break;
      default:
        // skipped event
        await logStripeSync({
          supabaseAdmin, eventId: event.id, eventType: event.type, objectType: null, objectId: null,
          syncDirection: 'stripe_to_supabase', status: 'skipped', environment: stripeEnvironment,
        });
        return NextResponse.json({ received: true, skipped: true });
    }

    await logStripeSync({
      supabaseAdmin, eventId: event.id, eventType: event.type,
      objectType: (event.data.object as any).object,
      objectId: (event.data.object as any).id,
      syncDirection: 'stripe_to_supabase', status: 'success', environment: stripeEnvironment,
    });
    return NextResponse.json({ received: true });
  } catch (err: any) {
    await logStripeSync({
      supabaseAdmin, eventId: event.id, eventType: event.type, objectType: null, objectId: null,
      syncDirection: 'stripe_to_supabase', status: 'failed', errorMessage: err?.message,
      environment: stripeEnvironment,
    });
    return NextResponse.json({ error: err?.message || 'Internal' }, { status: 500 });
  }
}
```

**Stripe-konfiguration:**
- I Stripe Dashboard ⇒ Developers ⇒ Webhooks ⇒ Add endpoint
- URL: `https://<din-domän>/api/stripe/webhook`
- Events: alla `invoice.*` + `customer.subscription.*`
- Spara `signing secret` som `STRIPE_TEST_WEBHOOK_SECRET` resp `STRIPE_LIVE_WEBHOOK_SECRET`.

**Lokal utveckling:** `stripe listen --forward-to localhost:3000/api/stripe/webhook`

---

## 11. Sync-routes (befintliga från bundle)

`api/studio/stripe/sync-invoices/route.ts`, `sync-subscriptions/route.ts`, `status/route.ts` — använd som de är i bundle 01/07/08. De fungerar oförändrat så länge `lib/stripe/*` ovan finns på plats.

---

## 12. Cron-rekommendation (valfritt, för säkerhets skull)

Kör en daglig backfill som "double-check" mot webhooks. Kan vara en
Vercel Cron (`vercel.json`):

```json
{
  "crons": [
    { "path": "/api/studio/stripe/sync-subscriptions", "schedule": "0 3 * * *" },
    { "path": "/api/studio/stripe/sync-invoices",      "schedule": "30 3 * * *" }
  ]
}
```

> Kräver att routerna accepterar `Bearer`-token från `CRON_SECRET` i
> stället för bara session — lägg till en check i `withAuth`-wrappern.

---

## Checklista

- [ ] Skapa alla `lib/stripe/*`-filer enligt ovan
- [ ] Skapa `app/src/app/api/stripe/webhook/route.ts`
- [ ] Sätt env: `STRIPE_ENV`, `STRIPE_TEST_*`, `STRIPE_LIVE_*` (secret + publishable + webhook)
- [ ] Skapa webhook i Stripe Dashboard för båda miljöerna
- [ ] Smoke test: `stripe trigger invoice.paid` ⇒ rad i `invoices` + `stripe_sync_log`
- [ ] Smoke test: skapa kund via admin-UI ⇒ Stripe customer + sub skapas + raderna speglas
- [ ] Smoke test: ändra månadspris ⇒ ny price skapas + sub uppdateras + spegling
- [ ] (valfritt) Vercel cron för daglig backfill

Klart? Gå till `03-api-routes-och-auth-lager.md`.
