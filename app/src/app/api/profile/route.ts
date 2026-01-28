import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { getServerSupabase } from '@/lib/supabase/server'

// Extract user ID from auth token cookie
async function getUserIdFromCookies(): Promise<string | null> {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get('sb-access-token')?.value

  if (!accessToken) {
    // Try to find Supabase auth cookie
    const allCookies = cookieStore.getAll()
    for (const cookie of allCookies) {
      if (cookie.name.startsWith('sb-') && cookie.name.endsWith('-auth-token')) {
        try {
          const parsed = JSON.parse(cookie.value)
          const token = parsed?.access_token || (Array.isArray(parsed) ? parsed[0] : null)
          if (token) {
            return await verifyAndGetUserId(token)
          }
        } catch {
          continue
        }
      }
    }
    return null
  }

  return await verifyAndGetUserId(accessToken)
}

async function verifyAndGetUserId(token: string): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) return null

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  })

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  return user.id
}

export async function GET(request: NextRequest) {
  try {
    // Try cookie auth first, fall back to header
    let userId = await getUserIdFromCookies()
    if (!userId) {
      userId = request.headers.get('x-user-id')
    }

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Error fetching profile:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ profile })
  } catch (error) {
    console.error('Profile API error:', error)
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    // Try cookie auth first, fall back to header
    let userId = await getUserIdFromCookies()
    if (!userId) {
      userId = request.headers.get('x-user-id')
    }

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const supabase = getServerSupabase()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile, error } = await (supabase as any)
      .from('profiles')
      .update(body)
      .eq('id', userId)
      .select()
      .single()

    if (error) {
      console.error('Error updating profile:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ profile })
  } catch (error) {
    console.error('Profile update error:', error)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }
}
