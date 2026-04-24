import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import {
  clearCustomerUpcomingPriceChange,
  extractNextSchedulePhase,
  monthlyPriceOreFromSchedulePhaseItem,
  subscriptionHasPromotedScheduledPrice,
  upsertCustomerUpcomingPriceChange,
} from '@/lib/admin/customer-billing-store';
import {
  revalidateAdminBillingViews,
  revalidateAdminCustomerViews,
} from '@/lib/admin/cache-tags';
import { stripe, stripeEnvironment } from '@/lib/stripe/dynamic-config';
import { getStripeConfigEnvNames } from '@/lib/stripe/environment';
import {
  upsertCreditNoteMirror,
  upsertRefundMirror,
} from '@/lib/stripe/billing-adjustments';
import {
  upsertInvoiceMirror,
  upsertSubscriptionMirror,
} from '@/lib/stripe/mirror';
import {
  hasProcessedStripeEvent,
  logStripeSync,
  markStripeEventProcessed,
} from '@/lib/stripe/sync-log';
import { monthlyAmountOreFromRecurringUnit } from '@/lib/stripe/price-amounts';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const { webhookSecret } = getStripeConfigEnvNames(stripeEnvironment);
const WEBHOOK_SECRET = process.env[webhookSecret];

async function releaseInvoiceSnoozeOnEscalation(invoice: Stripe.Invoice) {
  if (invoice.status !== 'open' && invoice.status !== 'uncollectible') {
    return;
  }

  const supabaseAdmin = createSupabaseAdmin();
  await supabaseAdmin
    .from('attention_snoozes')
    .update({
      released_at: new Date().toISOString(),
      release_reason: 'escalated',
    } as never)
    .eq('subject_type', 'invoice')
    .eq('subject_id', invoice.id)
    .is('released_at', null);
}

function getObjectMetadata(event: Stripe.Event) {
  return {
    objectType:
      typeof event.data.object.object === 'string' ? event.data.object.object : null,
    objectId: 'id' in event.data.object ? String(event.data.object.id) : null,
  };
}

async function resolveCustomerProfileId(params: {
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeInvoiceId?: string | null;
}) {
  const { supabaseAdmin, stripeCustomerId, stripeSubscriptionId, stripeInvoiceId } = params;

  if (stripeInvoiceId) {
    const invoiceLookup = await supabaseAdmin
      .from('invoices')
      .select('customer_profile_id')
      .eq('stripe_invoice_id', stripeInvoiceId)
      .maybeSingle();

    if (!invoiceLookup.error && invoiceLookup.data?.customer_profile_id) {
      return invoiceLookup.data.customer_profile_id;
    }
  }

  if (stripeSubscriptionId) {
    const subscriptionLookup = await supabaseAdmin
      .from('subscriptions')
      .select('customer_profile_id')
      .eq('stripe_subscription_id', stripeSubscriptionId)
      .maybeSingle();

    if (!subscriptionLookup.error && subscriptionLookup.data?.customer_profile_id) {
      return subscriptionLookup.data.customer_profile_id;
    }
  }

  if (stripeCustomerId) {
    const customerLookup = await supabaseAdmin
      .from('customer_profiles')
      .select('id')
      .eq('stripe_customer_id', stripeCustomerId)
      .maybeSingle();

    if (!customerLookup.error && customerLookup.data?.id) {
      return customerLookup.data.id;
    }
  }

  return null;
}

async function revalidateStripeCustomerViews(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  refs: {
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    stripeInvoiceId?: string | null;
  },
) {
  const customerProfileId = await resolveCustomerProfileId({
    supabaseAdmin,
    stripeCustomerId: refs.stripeCustomerId ?? null,
    stripeSubscriptionId: refs.stripeSubscriptionId ?? null,
    stripeInvoiceId: refs.stripeInvoiceId ?? null,
  });

  if (customerProfileId) {
    revalidateAdminCustomerViews(customerProfileId);
  }
}

function readStripeCustomerId(value: string | Stripe.Customer | Stripe.DeletedCustomer | null) {
  return typeof value === 'string' ? value : value?.id ?? null;
}

function readStripeSubscriptionId(
  value: string | Stripe.Subscription | null | undefined,
) {
  return typeof value === 'string' ? value : value?.id ?? null;
}

async function syncUpcomingPriceFromSchedule(params: {
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>;
  schedule: Stripe.SubscriptionSchedule;
}) {
  if (!stripe) {
    return;
  }

  const customerProfileId = await resolveCustomerProfileId({
    supabaseAdmin: params.supabaseAdmin,
    stripeCustomerId: readStripeCustomerId(params.schedule.customer),
    stripeSubscriptionId: readStripeSubscriptionId(params.schedule.subscription),
  });

  if (!customerProfileId) {
    return;
  }

  const nextPhase = extractNextSchedulePhase(params.schedule);
  if (!nextPhase) {
    await params.supabaseAdmin
      .from('customer_profiles')
      .update({
        upcoming_monthly_price: null,
        upcoming_price_effective_date: null,
      } as never)
      .eq('id', customerProfileId);
    await clearCustomerUpcomingPriceChange({
      supabaseAdmin: params.supabaseAdmin,
      customerId: customerProfileId,
    });
    return;
  }

  const nextItem = nextPhase.items[0];
  if (!nextItem) {
    return;
  }

  const price =
    typeof nextItem.price === 'string'
      ? await stripe.prices.retrieve(nextItem.price)
      : nextItem.price;
  if (!price || ('deleted' in price && price.deleted)) {
    return;
  }
  const monthlyPriceOre = monthlyPriceOreFromSchedulePhaseItem(nextItem, price ?? null);
  if (monthlyPriceOre == null) {
    return;
  }

  const effectiveDate = new Date(nextPhase.start_date * 1000).toISOString().slice(0, 10);

  await params.supabaseAdmin
    .from('customer_profiles')
    .update({
      upcoming_monthly_price: Math.round(monthlyPriceOre / 100),
      upcoming_price_effective_date: effectiveDate,
    } as never)
    .eq('id', customerProfileId);

  await upsertCustomerUpcomingPriceChange({
    supabaseAdmin: params.supabaseAdmin,
    customerId: customerProfileId,
    stripeSubscriptionId: readStripeSubscriptionId(params.schedule.subscription),
    stripeScheduleId: params.schedule.id,
    priceOre: monthlyPriceOre,
    effectiveDate,
  });
}

async function promoteUpcomingPriceIfSubscriptionMatches(params: {
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>;
  customerProfileId: string;
  subscription: Stripe.Subscription;
}) {
  const item = params.subscription.items.data[0];
  if (!item?.price?.recurring) {
    return;
  }

  const profileResult = await params.supabaseAdmin
    .from('customer_profiles')
    .select('monthly_price, upcoming_monthly_price, upcoming_price_effective_date')
    .eq('id', params.customerProfileId)
    .maybeSingle();

  if (profileResult.error || !profileResult.data) {
    return;
  }

  const currentMonthlyPriceOre = monthlyAmountOreFromRecurringUnit({
    unitAmountOre: item.price.unit_amount ?? 0,
    interval: item.price.recurring.interval,
    intervalCount: item.price.recurring.interval_count ?? 1,
  });

  if (
    !subscriptionHasPromotedScheduledPrice({
      currentMonthlyPriceOre,
      upcomingPriceSek: profileResult.data.upcoming_monthly_price,
    })
  ) {
    return;
  }

  await params.supabaseAdmin
    .from('customer_profiles')
    .update({
      monthly_price: Math.round(currentMonthlyPriceOre / 100),
      pricing_status: 'fixed',
      upcoming_monthly_price: null,
      upcoming_price_effective_date: null,
    } as never)
    .eq('id', params.customerProfileId);

  await clearCustomerUpcomingPriceChange({
    supabaseAdmin: params.supabaseAdmin,
    customerId: params.customerProfileId,
  });
}

export async function POST(req: NextRequest) {
  if (!stripe || !WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Stripe webhook not configured' }, { status: 500 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, WEBHOOK_SECRET);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid webhook signature';
    return NextResponse.json({ error: `Signature: ${message}` }, { status: 400 });
  }

  const supabaseAdmin = createSupabaseAdmin();
  if (await hasProcessedStripeEvent(supabaseAdmin, event.id)) {
    return NextResponse.json({ received: true, already_processed: true });
  }

  const objectMeta = getObjectMetadata(event);

  try {
    switch (event.type) {
      case 'invoice.created':
      case 'invoice.finalized':
      case 'invoice.paid':
      case 'invoice.payment_failed':
      case 'invoice.voided':
      case 'invoice.marked_uncollectible':
      case 'invoice.updated': {
        const invoice = event.data.object as Stripe.Invoice;
        await upsertInvoiceMirror({
          supabaseAdmin,
          invoice,
          environment: stripeEnvironment,
        });

        if (event.type === 'invoice.payment_failed') {
          await releaseInvoiceSnoozeOnEscalation(invoice);
        }

        await revalidateStripeCustomerViews(supabaseAdmin, {
          stripeCustomerId: readStripeCustomerId(invoice.customer),
          stripeSubscriptionId: readStripeSubscriptionId(
            (invoice as Stripe.Invoice & {
              subscription?: string | Stripe.Subscription | null;
            }).subscription ?? null,
          ),
          stripeInvoiceId: invoice.id,
        });
        revalidateAdminBillingViews();
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed': {
        const subscription = event.data.object as Stripe.Subscription;
        await upsertSubscriptionMirror({
          supabaseAdmin,
          subscription,
          environment: stripeEnvironment,
        });

        const customerProfileId = await resolveCustomerProfileId({
          supabaseAdmin,
          stripeCustomerId: readStripeCustomerId(subscription.customer),
          stripeSubscriptionId: subscription.id,
        });

        if (customerProfileId) {
          await promoteUpcomingPriceIfSubscriptionMatches({
            supabaseAdmin,
            customerProfileId,
            subscription,
          });
        }

        await revalidateStripeCustomerViews(supabaseAdmin, {
          stripeCustomerId: readStripeCustomerId(subscription.customer),
          stripeSubscriptionId: subscription.id,
        });
        revalidateAdminBillingViews();
        break;
      }

      case 'subscription_schedule.updated':
      case 'subscription_schedule.released': {
        const schedule = event.data.object as Stripe.SubscriptionSchedule;
        await syncUpcomingPriceFromSchedule({
          supabaseAdmin,
          schedule,
        });

        const subscriptionId =
          typeof schedule.subscription === 'string'
            ? schedule.subscription
            : schedule.subscription?.id ?? null;

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await upsertSubscriptionMirror({
            supabaseAdmin,
            subscription,
            environment: stripeEnvironment,
          });

          await revalidateStripeCustomerViews(supabaseAdmin, {
            stripeCustomerId: readStripeCustomerId(subscription.customer),
            stripeSubscriptionId: subscription.id,
          });
        }
        revalidateAdminBillingViews();
        break;
      }

      case 'credit_note.created':
      case 'credit_note.updated': {
        const creditNote = event.data.object as Stripe.CreditNote;
        await upsertCreditNoteMirror({
          supabaseAdmin,
          creditNote,
          environment: stripeEnvironment,
        });

        await revalidateStripeCustomerViews(supabaseAdmin, {
          stripeCustomerId: readStripeCustomerId(creditNote.customer),
          stripeInvoiceId:
            typeof creditNote.invoice === 'string' ? creditNote.invoice : creditNote.invoice?.id,
        });
        revalidateAdminBillingViews();
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        for (const refund of charge.refunds?.data ?? []) {
          await upsertRefundMirror({
            supabaseAdmin,
            refund,
            charge,
            environment: stripeEnvironment,
          });
        }

        await revalidateStripeCustomerViews(supabaseAdmin, {
          stripeCustomerId: readStripeCustomerId(charge.customer),
        });
        revalidateAdminBillingViews();
        break;
      }

      default: {
        await markStripeEventProcessed(supabaseAdmin, event.id, event.type);
        await logStripeSync({
          supabaseAdmin,
          eventId: event.id,
          eventType: event.type,
          objectType: objectMeta.objectType,
          objectId: objectMeta.objectId,
          syncDirection: 'stripe_to_supabase',
          status: 'skipped',
          environment: stripeEnvironment,
        });
        return NextResponse.json({ received: true, skipped: true });
      }
    }

    await markStripeEventProcessed(supabaseAdmin, event.id, event.type);
    await logStripeSync({
      supabaseAdmin,
      eventId: event.id,
      eventType: event.type,
      objectType: objectMeta.objectType,
      objectId: objectMeta.objectId,
      syncDirection: 'stripe_to_supabase',
      status: 'success',
      environment: stripeEnvironment,
      payloadSummary: {
        livemode: event.livemode,
        environment: stripeEnvironment,
      },
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    await logStripeSync({
      supabaseAdmin,
      eventId: event.id,
      eventType: event.type,
      objectType: objectMeta.objectType,
      objectId: objectMeta.objectId,
      syncDirection: 'stripe_to_supabase',
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Internal',
      environment: stripeEnvironment,
      payloadSummary: {
        livemode: event.livemode,
        environment: stripeEnvironment,
      },
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal' },
      { status: 500 },
    );
  }
}
