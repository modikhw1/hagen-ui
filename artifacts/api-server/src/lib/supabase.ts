import { createClient } from '@supabase/supabase-js';

export function createSupabaseAdmin() {
  const url = process.env['SUPABASE_URL'] ?? process.env['VITE_SUPABASE_URL'] ?? '';
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';

  if (!url || !key) {
    throw new Error('Supabase admin not configured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createSupabaseUserClient(accessToken: string) {
  const url = process.env['SUPABASE_URL'] ?? process.env['VITE_SUPABASE_URL'] ?? '';
  const anonKey = process.env['SUPABASE_ANON_KEY'] ?? process.env['VITE_SUPABASE_ANON_KEY'] ?? '';

  if (!url || !anonKey) {
    throw new Error('Supabase user client not configured');
  }

  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
