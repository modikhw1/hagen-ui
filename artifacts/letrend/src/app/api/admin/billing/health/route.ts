import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { isEnvFilter, resolveConcreteBillingEnv } from '@/lib/admin/billing';
import { getBillingHealthSnapshot } from '@/lib/admin/billing-service';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { getStripeEnvironment } from '@/lib/stripe/environment';

export const GET = withAuth(async (request, user) => {
  requireScope(user, 'billing.health.read');

  const supabaseAdmin = createSupabaseAdmin();
  const requestedEnv = request.nextUrl.searchParams.get('env');
  if (requestedEnv !== null && !isEnvFilter(requestedEnv)) {
    return jsonError('Ogiltiga query-parametrar', 400);
  }

  const env = resolveConcreteBillingEnv(requestedEnv ?? 'all', getStripeEnvironment());
  const payload = await getBillingHealthSnapshot({
    supabaseAdmin,
    environment: env,
  });

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, max-age=15',
    },
  });
}, ['admin']);
