import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { withAuth } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { getStripeConfigEnvNames, getStripeEnvironment } from '@/lib/stripe/environment';

function isMissingColumnError(message?: string | null) {
  return (
    typeof message === 'string' &&
    message.toLowerCase().includes('column') &&
    message.toLowerCase().includes('does not exist')
  );
}

const stripeEnvironment = getStripeEnvironment();
const stripeConfigNames = getStripeConfigEnvNames(stripeEnvironment);
const stripeSecretKey = process.env[stripeConfigNames.secretKey];
const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2026-02-25.clover' })
  : null;

export const POST = withAuth(async (request: NextRequest) => {
  try {
    const body = await request.json().catch(() => ({}));
    const customerProfileId =
      typeof body.customer_profile_id === 'string' ? body.customer_profile_id : null;
    const email = typeof body.email === 'string' ? body.email : null;
    const businessName =
      typeof body.business_name === 'string' ? body.business_name : null;

    if (!customerProfileId || !email) {
      return jsonError('customer_profile_id och email kravs', 400);
    }

    if (!stripe) {
      return jsonError('Stripe ar inte konfigurerat', 500);
    }

    const customer = await stripe.customers.create({
      email,
      name: businessName || email,
      metadata: {
        customer_profile_id: customerProfileId,
        source: 'hagen-studio',
      },
    });

    const supabaseAdmin = createSupabaseAdmin();
    const { error: updateError } = await supabaseAdmin
      .from('customer_profiles')
      .update({ stripe_customer_id: customer.id })
      .eq('id', customerProfileId);

    if (updateError) {
      console.error('[studio/stripe/status] Kunde inte uppdatera kundprofil:', updateError);
    }

    await (((supabaseAdmin.from('stripe_sync_log') as never) as {
      insert: (payload: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
    }).insert({
      event_type: 'customer.created',
      stripe_event_id: `studio_${customer.id}`,
      object_type: 'customer',
      object_id: customer.id,
      sync_direction: 'supabase_to_stripe',
      status: 'success',
      environment: stripeEnvironment,
    }));

    return jsonOk({
      success: true,
      stripe_customer_id: customer.id,
      environment: stripeEnvironment,
    });
  } catch (error) {
    console.error('[studio/stripe/status] POST error:', error);
    return jsonError(
      error instanceof Error ? error.message : 'Internt serverfel',
      500,
    );
  }
}, ['admin']);

export const GET = withAuth(async () => {
  const supabaseAdmin = createSupabaseAdmin();
  const isTestMode = stripeEnvironment === 'test';

  const invoiceCountQuery = (((supabaseAdmin.from('invoices') as never) as {
    select: (
      columns: string,
      options: { count: 'exact'; head: true },
    ) => {
      eq: (
        column: string,
        value: string,
      ) => Promise<{ count: number | null; error: { message?: string } | null }>;
    };
  }).select('*', { count: 'exact', head: true })).eq('environment', stripeEnvironment);

  const recentSyncsQuery = (((supabaseAdmin.from('stripe_sync_log') as never) as {
    select: (
      columns: string,
    ) => {
      eq: (
        column: string,
        value: string,
      ) => {
        order: (
          innerColumn: string,
          options: { ascending: boolean },
        ) => {
          limit: (
            limitValue: number,
          ) => Promise<{ data: unknown[] | null; error: { message?: string } | null }>;
        };
      };
      order: (
        innerColumn: string,
        options: { ascending: boolean },
      ) => {
        limit: (
          limitValue: number,
        ) => Promise<{ data: unknown[] | null; error: { message?: string } | null }>;
      };
    };
  }).select('*'));

  const [invoiceCountResult, customerCountResult, syncResult] = await Promise.all([
    invoiceCountQuery,
    supabaseAdmin
      .from('customer_profiles')
      .select('*', { count: 'exact', head: true })
      .not('stripe_customer_id', 'is', null),
    recentSyncsQuery
      .eq('environment', stripeEnvironment)
      .order('created_at', { ascending: false })
      .limit(5)
      .catch((error: unknown) => ({
        data: null,
        error: error instanceof Error ? { message: error.message } : { message: 'Okant fel' },
      })),
  ]);

  let schemaWarnings: string[] = [];
  let recentSyncs = syncResult.data ?? [];

  if (syncResult.error) {
    if (isMissingColumnError(syncResult.error.message)) {
      schemaWarnings = [
        'stripe_sync_log saknar environment-kolumn. Kora migrationskedjan under supabase/migrations for full miljoseparering.',
      ];
      const fallback = await supabaseAdmin
        .from('stripe_sync_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      if (fallback.error) {
        return jsonError(fallback.error.message, 500);
      }

      recentSyncs = fallback.data ?? [];
    } else {
      return jsonError(syncResult.error.message || 'Kunde inte hamta synklogg', 500);
    }
  }

  if (invoiceCountResult.error) {
    if (isMissingColumnError(invoiceCountResult.error.message)) {
      schemaWarnings = [
        ...schemaWarnings,
        'invoices saknar environment-kolumn. Fakturastatistiken ar inte fullt miljoisolerad.',
      ];
    } else {
      return jsonError(invoiceCountResult.error.message || 'Kunde inte hamta fakturastatistik', 500);
    }
  }

  if (customerCountResult.error) {
    return jsonError(
      customerCountResult.error.message || 'Kunde inte hamta kundstatistik',
      500,
    );
  }

  return jsonOk({
    environment: stripeEnvironment,
    isTestMode,
    stats: {
      totalInvoices: invoiceCountResult.count || 0,
      syncedCustomers: customerCountResult.count || 0,
    },
    recentSyncs,
    schemaWarnings,
  });
}, ['admin']);
