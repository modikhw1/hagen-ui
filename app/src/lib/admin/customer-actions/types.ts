import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import type { AuthenticatedUser } from '@/lib/auth/api-auth';
import type { Database, Tables } from '@/types/database';

export type CustomerProfileRow = Tables<'customer_profiles'>;
export type SupabaseAdminClient = SupabaseClient<Database>;
export type ActionResult = Response | Record<string, unknown>;

export interface AdminActionContext {
  id: string;
  user: AuthenticatedUser;
  supabaseAdmin: SupabaseAdminClient;
  stripeClient: Stripe | null;
  beforeProfile: CustomerProfileRow | null;
}
