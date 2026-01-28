import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Helper to set cookie for server-side auth
function setAuthCookie(accessToken: string | null) {
  if (typeof document === 'undefined') return

  if (accessToken) {
    // Set cookie with access token for server-side routes
    document.cookie = `sb-access-token=${accessToken}; path=/; max-age=3600; SameSite=Lax`
  } else {
    // Clear cookie on logout
    document.cookie = 'sb-access-token=; path=/; max-age=0'
  }
}

// Create a mock client for build time when env vars aren't available
const createSupabaseClient = (): SupabaseClient<Database> => {
  if (!supabaseUrl || !supabaseAnonKey) {
    // Return a mock client that will be replaced at runtime
    console.warn('Supabase env vars not set - using placeholder client')
    return createClient('https://placeholder.supabase.co', 'placeholder-key')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      // Use implicit flow for email confirmation (PKCE requires same browser context)
      flowType: 'implicit',
      // Increase lock timeout to prevent "signal aborted" errors
      lockAcquireTimeout: 10000,
    } as any,
  })

  // Sync access token to cookie for server-side auth
  if (typeof window !== 'undefined') {
    client.auth.onAuthStateChange((event, session) => {
      setAuthCookie(session?.access_token || null)
    })

    // Set initial cookie if already logged in
    client.auth.getSession().then(({ data: { session } }) => {
      setAuthCookie(session?.access_token || null)
    })
  }

  return client
}

export const supabase = createSupabaseClient()
