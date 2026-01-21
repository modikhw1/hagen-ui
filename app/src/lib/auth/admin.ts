import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { headers } from 'next/headers';
import { getSupabaseConfig } from '@/lib/env';

export interface AdminAuthResult {
  isAdmin: boolean;
  userId: string | null;
  error: string | null;
}

/**
 * Extract access token from Supabase auth cookie or Authorization header
 * Supabase stores auth in cookies like: sb-{project_ref}-auth-token
 */
async function getAccessToken(): Promise<string | null> {
  // First try Authorization header (Bearer token)
  const headersList = await headers();
  const authHeader = headersList.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Then try Supabase cookies
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();

  // Look for Supabase auth cookie (format: sb-{ref}-auth-token)
  for (const cookie of allCookies) {
    if (cookie.name.startsWith('sb-') && cookie.name.endsWith('-auth-token')) {
      try {
        // Supabase stores a JSON array [access_token, refresh_token, ...]
        const parsed = JSON.parse(cookie.value);
        if (Array.isArray(parsed) && parsed[0]) {
          return parsed[0];
        }
      } catch {
        // Not JSON, might be direct token
        return cookie.value;
      }
    }
  }

  // Fallback: check for legacy sb-access-token
  const legacyToken = cookieStore.get('sb-access-token')?.value;
  if (legacyToken) {
    return legacyToken;
  }

  return null;
}

/**
 * Verify admin access using JWT token from cookies or Authorization header
 * Checks is_admin column OR @letrend.se email domain
 */
export async function verifyAdminAccess(): Promise<AdminAuthResult> {
  const config = getSupabaseConfig();

  if (!config.isConfigured) {
    return { isAdmin: false, userId: null, error: 'Supabase not configured' };
  }

  const supabase = createClient(config.url, config.serviceKey || config.anonKey);
  const accessToken = await getAccessToken();

  if (!accessToken) {
    return { isAdmin: false, userId: null, error: 'No access token' };
  }

  // Verify JWT and get user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(accessToken);

  if (authError || !user) {
    return { isAdmin: false, userId: null, error: 'Invalid session' };
  }

  // Check admin status in profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, is_admin')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return { isAdmin: false, userId: user.id, error: 'Profile not found' };
  }

  const isAdmin = profile.is_admin === true || profile.email?.endsWith('@letrend.se') || false;

  return { isAdmin, userId: user.id, error: isAdmin ? null : 'Not an admin' };
}

/**
 * Helper to get Supabase admin client for admin routes
 */
export function getAdminSupabase(): SupabaseClient | null {
  const config = getSupabaseConfig();
  if (!config.isConfigured || !config.serviceKey) {
    return null;
  }
  return createClient(config.url, config.serviceKey);
}
