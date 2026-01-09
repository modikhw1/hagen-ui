import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Create a mock client for build time when env vars aren't available
const createSupabaseClient = (): SupabaseClient<Database> => {
  if (!supabaseUrl || !supabaseAnonKey) {
    // Return a mock client that will be replaced at runtime
    console.warn('Supabase env vars not set - using placeholder client')
    return createClient('https://placeholder.supabase.co', 'placeholder-key')
  }
  return createClient<Database>(supabaseUrl, supabaseAnonKey)
}

export const supabase = createSupabaseClient()
