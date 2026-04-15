import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth/api-auth';
import { getStripeEnvironment } from '@/lib/stripe/environment';
import { z } from 'zod';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  page: z.coerce.number().int().min(1).optional(),
  status: z.string().trim().min(1).optional(),
  environment: z.enum(['test', 'live']).optional(),
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
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'Ogiltiga query-parametrar' }, { status: 400 });
  }

  const { limit = 50, page = 1, status } = parsed.data;
  const environment = parsed.data.environment || getStripeEnvironment();
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const schemaWarnings: string[] = [];

  const buildSubscriptionQuery = (withEnvironmentFilter: boolean) => {
    let query = supabaseAdmin
      .from('subscriptions')
      .select('*', { count: 'exact' })
      .order('created', { ascending: false })
      .range(from, to);

    if (withEnvironmentFilter) {
      query = query.eq('environment', environment);
    }

    if (status) {
      query = query.eq('status', status);
    }

    return query;
  };

  let { data: subscriptions, error, count } = await buildSubscriptionQuery(true);
  if (error && isMissingColumnError(error.message)) {
    schemaWarnings.push('Migration 040 saknas i databasen. Visar abonnemang utan miljöfiltrering och utan garanterad test/live-separation.');
    const fallback = await buildSubscriptionQuery(false);
    subscriptions = fallback.data;
    error = fallback.error;
    count = fallback.count;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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

  return NextResponse.json({
    subscriptions: payload,
    environment,
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
