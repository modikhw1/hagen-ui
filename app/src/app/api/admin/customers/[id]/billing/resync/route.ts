import { NextRequest } from 'next/server';
import { withAuth, requireScope } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { stripe, stripeEnvironment } from '@/lib/stripe/dynamic-config';
import {
  upsertInvoiceMirror,
  upsertSubscriptionMirror,
} from '@/lib/stripe/mirror';
import { logStripeSync } from '@/lib/stripe/sync-log';
import {
  adminCustomerTag,
  adminCustomerBillingTag,
  adminCustomerSubscriptionTag,
} from '@/lib/admin/cache-tags';
import { revalidateTag } from 'next/cache';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/admin/customers/[id]/billing/resync
 *
 * Force-syncar all Stripe-data för en kund: hämtar fresh customer, subscriptions och invoices
 * från Stripe och skriver över de lokala speglingarna. Loggar varje uppdatering till
 * stripe_sync_events med source='manual_resync'.
 */
export const POST = withAuth(
  async (_request: NextRequest, user, { params }: RouteParams) => {
    requireScope(user, 'super_admin');

    const { id } = await params;
    if (!id) return jsonError('Kund-ID krävs', 400);

    if (!stripe) {
      return jsonError('Stripe är inte konfigurerat', 500);
    }

    const supabaseAdmin = createSupabaseAdmin();

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('customer_profiles')
      .select('id, stripe_customer_id, business_name')
      .eq('id', id)
      .maybeSingle();

    if (profileError) return jsonError(profileError.message, 500);
    if (!profile) return jsonError('Kund hittades inte', 404);
    if (!profile.stripe_customer_id) {
      return jsonError('Kunden har inget kopplat Stripe-customer-ID', 400);
    }

    const summary = {
      subscriptions_synced: 0,
      invoices_synced: 0,
      errors: [] as string[],
    };

    try {
      // 1. Subscriptions
      const subs = await stripe.subscriptions.list({
        customer: profile.stripe_customer_id,
        status: 'all',
        limit: 50,
      });
      for (const sub of subs.data) {
        try {
          await upsertSubscriptionMirror({
            supabaseAdmin,
            subscription: sub,
            environment: stripeEnvironment,
          });
          summary.subscriptions_synced += 1;
        } catch (err) {
          summary.errors.push(`subscription ${sub.id}: ${err instanceof Error ? err.message : 'unknown'}`);
        }
      }

      // 2. Invoices
      const invoices = await stripe.invoices.list({
        customer: profile.stripe_customer_id,
        limit: 100,
      });
      for (const invoice of invoices.data) {
        try {
          await upsertInvoiceMirror({
            supabaseAdmin,
            invoice,
            environment: stripeEnvironment,
          });
          summary.invoices_synced += 1;
        } catch (err) {
          summary.errors.push(`invoice ${invoice.id}: ${err instanceof Error ? err.message : 'unknown'}`);
        }
      }

      // Logga sync-händelsen
      await logStripeSync({
        supabaseAdmin,
        eventId: null,
        eventType: 'manual.customer.resync',
        objectType: 'customer',
        objectId: profile.stripe_customer_id,
        syncDirection: 'stripe_to_supabase',
        status: 'success',
        environment: stripeEnvironment,
        customerProfileId: id,
        source: 'manual_resync',
        appliedChanges: summary,
      });

      // Invalidera cache
      revalidateTag(adminCustomerTag(id), 'max');
      revalidateTag(adminCustomerBillingTag(id), 'max');
      revalidateTag(adminCustomerSubscriptionTag(id), 'max');

      return jsonOk({ ok: true, summary });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Resync misslyckades';
      await logStripeSync({
        supabaseAdmin,
        eventId: null,
        eventType: 'manual.customer.resync',
        objectType: 'customer',
        objectId: profile.stripe_customer_id,
        syncDirection: 'stripe_to_supabase',
        status: 'failed',
        errorMessage: message,
        environment: stripeEnvironment,
        customerProfileId: id,
        source: 'manual_resync',
        appliedChanges: summary,
      });
      return jsonError(message, 500);
    }
  },
  ['admin'],
);