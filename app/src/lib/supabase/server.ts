import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

let serverClient: SupabaseClient<Database> | null = null

export function getServerSupabase(): SupabaseClient<Database> {
  if (serverClient) {
    return serverClient
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

  if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase env vars not set - using placeholder client')
    serverClient = createClient('https://placeholder.supabase.co', 'placeholder-key', {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
    return serverClient
  }

  serverClient = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  return serverClient
}
