import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { z } from 'zod';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  page: z.coerce.number().int().min(1).optional(),
  status: z.string().trim().min(1).optional(),
  environment: z.enum(['test', 'live']).optional(),
  customer_profile_id: z.string().uuid().optional(),
  stripe_subscription_id: z.string().trim().min(1).optional(),
}).strict();

function isMissingColumnError(message?: string | null) {
  return typeof message === 'string' && message.toLowerCase().includes('column') && message.toLowerCase().includes('does not exist');
}

export const GET = withAuth(async (request: NextRequest) => {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    limit: url.searchParams.get('limit') ?? undefined,
    page: url.searchParams.get('page') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    environment: url.searchParams.get('environment') ?? undefined,
    customer_profile_id: url.searchParams.get('customer_profile_id') ?? undefined,
    stripe_subscription_id: url.searchParams.get('stripe_subscription_id') ?? undefined,
  });

  if (!parsed.success) {
    return jsonError('Ogiltiga query-parametrar', 400);
  }

  const {
    limit = 50,
    page = 1,
    status,
    customer_profile_id,
    stripe_subscription_id,
  } = parsed.data;
  const environment = parsed.data.environment;
  const supabaseAdmin = createSupabaseAdmin();
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const schemaWarnings: string[] = [];

  const buildSubscriptionQuery = (withEnvironmentFilter: boolean) => {
    let query = supabaseAdmin
      .from('subscriptions')
      .select('*', { count: 'exact' })
      .order('created', { ascending: false })
      .range(from, to);

    if (withEnvironmentFilter && environment) {
      query = query.eq('environment', environment);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (customer_profile_id) {
      query = query.eq('customer_profile_id', customer_profile_id);
    }

    if (stripe_subscription_id) {
      query = query.eq('stripe_subscription_id', stripe_subscription_id);
    }

    return query;
  };

  let { data: subscriptions, error, count } = await buildSubscriptionQuery(Boolean(environment));
  if (error && isMissingColumnError(error.message)) {
    schemaWarnings.push('Migration 040 saknas i databasen. Visar abonnemang utan miljöfiltrering och utan garanterad test/live-separation.');
    const fallback = await buildSubscriptionQuery(false);
    subscriptions = fallback.data;
    error = fallback.error;
    count = fallback.count;
  }

  if (error) {
    return jsonError(error.message, 500);
  }

  const { data: customers } = await supabaseAdmin
    .from('customer_profiles')
    .select('id, business_name, stripe_customer_id');

  const byProfileId = new Map<string, string>();
  const byStripeCustomerId = new Map<string, string>();
  for (const customer of customers || []) {
    if (customer.id && customer.business_name) {
      byProfileId.set(customer.id, customer.business_name);
    }
    if (customer.stripe_customer_id && customer.business_name) {
      byStripeCustomerId.set(customer.stripe_customer_id, customer.business_name);
    }
  }

  const payload = (subscriptions || []).map((subscription) => ({
    ...subscription,
    customer_name:
      (subscription.customer_profile_id && byProfileId.get(subscription.customer_profile_id)) ||
      byStripeCustomerId.get(subscription.stripe_customer_id) ||
      subscription.stripe_customer_id?.slice(0, 18) ||
      'Okänd',
  }));

  return jsonOk({
    subscriptions: payload,
    environment: environment ?? 'all',
    schemaWarnings,
    pagination: {
      page,
      limit,
      total: count || 0,
      pageCount: Math.max(1, Math.ceil((count || 0) / limit)),
      hasNextPage: from + (subscriptions?.length || 0) < (count || 0),
      hasPreviousPage: page > 1,
    },
  });
}, ['admin']);
