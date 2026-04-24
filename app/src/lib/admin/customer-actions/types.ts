import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import type { AuthenticatedUser } from '@/lib/auth/api-auth';
import type { Database, Tables } from '@/types/database';

export type CustomerProfileRow = Tables<'customer_profiles'>;
export type SupabaseAdminClient = SupabaseClient<Database>;

export interface ActionMeta {
  requestId: string;
  durationMs: number;
  affectedEntities?: Array<{ type: string; id: string }>;
}

export type ActionSuccess<T = unknown> = {
  success: true;
  data: T;
  meta?: ActionMeta;
};

export type ActionFailure = {
  success: false;
  error: string;
  details?: unknown;
  statusCode?: number;
  meta?: ActionMeta;
};

export type ActionResult<T = unknown> = Response | ActionSuccess<T> | ActionFailure;

export interface AdminActionContext {
  id: string;
  requestId: string;
  user: AuthenticatedUser;
  clientIp: string | null;
  userAgent: string | null;
  supabaseAdmin: SupabaseAdminClient;
  stripeClient: Stripe | null;
  beforeProfile: CustomerProfileRow | null;
}
