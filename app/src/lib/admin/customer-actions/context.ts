import 'server-only';

import type { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/auth/api-auth';
import { stripe } from '@/lib/stripe/dynamic-config';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import type { AdminActionContext } from './types';

export async function createAdminActionContext(
  request: NextRequest,
  id: string,
): Promise<AdminActionContext> {
  const user = await validateApiRequest(request, ['admin']);
  const supabaseAdmin = createSupabaseAdmin();
  const beforeResult = await supabaseAdmin
    .from('customer_profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (beforeResult.error) {
    throw new Error(beforeResult.error.message);
  }

  return {
    id,
    user,
    supabaseAdmin,
    stripeClient: stripe,
    beforeProfile: beforeResult.data,
  };
}
