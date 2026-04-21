import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { z } from 'zod';

const querySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(500).optional(),
    page: z.coerce.number().int().min(1).optional(),
    status: z.string().trim().min(1).optional(),
    q: z.string().trim().min(1).optional(),
    from: z.string().trim().min(1).optional(),
    to: z.string().trim().min(1).optional(),
    environment: z.enum(['test', 'live']).optional(),
    customer_profile_id: z.string().uuid().optional(),
    stripe_subscription_id: z.string().trim().min(1).optional(),
  })
  .strict();

function isMissingColumnError(message?: string | null) {
  return (
    typeof message === 'string' &&
    message.toLowerCase().includes('column') &&
    message.toLowerCase().includes('does not exist')
  );
}

function isMissingTableError(message?: string | null) {
  return (
    typeof message === 'string' &&
    message.toLowerCase().includes('relation') &&
    message.toLowerCase().includes('does not exist')
  );
}

export const GET = withAuth(async (request: NextRequest) => {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    limit: url.searchParams.get('limit') ?? undefined,
    page: url.searchParams.get('page') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    q: url.searchParams.get('q') ?? undefined,
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
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
    q,
    from: fromDate,
    to: toDate,
    customer_profile_id,
    stripe_subscription_id,
  } = parsed.data;
  const environment = parsed.data.environment;
  const supabaseAdmin = createSupabaseAdmin();
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const schemaWarnings: string[] = [];
  let searchedCustomerProfileIds: string[] | null = null;
  let searchedStripeCustomerIds: string[] | null = null;

  if (q) {
    const { data: matchingCustomers, error: matchingCustomersError } = await supabaseAdmin
      .from('customer_profiles')
      .select('id, stripe_customer_id')
      .ilike('business_name', `%${q}%`)
      .limit(50);

    if (matchingCustomersError) {
      return jsonError(matchingCustomersError.message, 500);
    }

    searchedCustomerProfileIds = (matchingCustomers ?? [])
      .map((customer) => customer.id)
      .filter((value): value is string => Boolean(value));
    searchedStripeCustomerIds = (matchingCustomers ?? [])
      .map((customer) => customer.stripe_customer_id)
      .filter((value): value is string => Boolean(value));

    if (searchedCustomerProfileIds.length === 0 && searchedStripeCustomerIds.length === 0) {
      return jsonOk({
        subscriptions: [],
        environment: environment ?? 'all',
        schemaWarnings,
        summary: {
          activeCount: 0,
          expiringCount: 0,
          mrrOre: 0,
        },
        pagination: {
          page,
          limit,
          total: 0,
          pageCount: 1,
          hasNextPage: false,
          hasPreviousPage: page > 1,
        },
      });
    }
  }

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

    if (searchedCustomerProfileIds?.length) {
      query = query.in('customer_profile_id', searchedCustomerProfileIds);
    }

    if (stripe_subscription_id) {
      query = query.eq('stripe_subscription_id', stripe_subscription_id);
    }

    if (fromDate) {
      query = query.gte('created', `${fromDate}T00:00:00.000Z`);
    }

    if (toDate) {
      query = query.lte('created', `${toDate}T23:59:59.999Z`);
    }

    return query;
  };

  let { data: subscriptions, error, count } = await buildSubscriptionQuery(Boolean(environment));
  if (error && isMissingColumnError(error.message)) {
    schemaWarnings.push(
      'Migration 040 saknas i databasen. Visar abonnemang utan miljöfiltrering och utan garanterad test/live-separation.',
    );
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

  const payload = (subscriptions || [])
    .map((subscription) => ({
      ...subscription,
      customer_name:
        (subscription.customer_profile_id && byProfileId.get(subscription.customer_profile_id)) ||
        byStripeCustomerId.get(subscription.stripe_customer_id) ||
        subscription.stripe_customer_id?.slice(0, 18) ||
        'Okänd',
    }))
    .filter((subscription) =>
      searchedStripeCustomerIds?.length
        ? searchedStripeCustomerIds.includes(subscription.stripe_customer_id)
        : true,
    );

  let mrrOre = payload
    .filter((subscription) => subscription.status === 'active' && !subscription.cancel_at_period_end)
    .reduce((sum, subscription) => {
      const intervalCount = subscription.interval_count ?? 1;
      if (subscription.interval === 'year') return sum + Math.round(subscription.amount / 12);
      if (intervalCount === 3) return sum + Math.round(subscription.amount / 3);
      if ((subscription.interval ?? 'month') === 'month' && intervalCount > 1) {
        return sum + Math.round(subscription.amount / intervalCount);
      }
      return sum + subscription.amount;
    }, 0);

  if (
    environment &&
    !q &&
    !fromDate &&
    !toDate &&
    !status &&
    !customer_profile_id &&
    !stripe_subscription_id
  ) {
    const mrrViewResult = await (((supabaseAdmin.from('v_admin_billing_mrr' as never) as never) as {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{
            data: { mrr_ore: number | null } | null;
            error: { message?: string } | null;
          }>;
        };
      };
    }).select('mrr_ore')).eq('environment', environment).maybeSingle();

    if (mrrViewResult.data?.mrr_ore !== null && mrrViewResult.data?.mrr_ore !== undefined) {
      mrrOre = Number(mrrViewResult.data.mrr_ore);
    } else if (mrrViewResult.error && isMissingTableError(mrrViewResult.error.message)) {
      schemaWarnings.push(
        'Viewen v_admin_billing_mrr saknas i databasen. MRR beräknas med fallback i API-lagret.',
      );
    }
  }

  return jsonOk({
    subscriptions: payload,
    environment: environment ?? 'all',
    schemaWarnings,
    summary: {
      activeCount: payload.filter(
        (subscription) => subscription.status === 'active' && !subscription.cancel_at_period_end,
      ).length,
      expiringCount: payload.filter((subscription) => subscription.cancel_at_period_end).length,
      mrrOre,
    },
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
