import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

function readServerEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

export function createSupabaseAdmin() {
  const url = readServerEnv('SUPABASE_URL') ?? readServerEnv('NEXT_PUBLIC_SUPABASE_URL') ?? readServerEnv('VITE_SUPABASE_URL');
  const key = readServerEnv('SUPABASE_SERVICE_ROLE_KEY') ?? readServerEnv('VITE_SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !key) {
    throw new Error('Supabase admin not configured: missing Supabase URL or service role key');
  }

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
