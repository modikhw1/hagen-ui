import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * GET /api/user-clips
 * Returns the current user's assigned clips
 */
export async function GET(request: Request) {
  try {
    const cookieStore = await cookies()
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get auth token from cookie
    const accessToken = cookieStore.get('sb-access-token')?.value

    if (!accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user from token
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken)

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    // Fetch user's clips
    const { data: clips, error: clipsError } = await supabase
      .from('user_clips')
      .select('*')
      .eq('user_id', user.id)
      .order('assigned_at', { ascending: false })

    if (clipsError) {
      console.error('Error fetching clips:', clipsError)
      return NextResponse.json({ error: 'Failed to fetch clips' }, { status: 500 })
    }

    return NextResponse.json({ clips: clips || [] })
  } catch (error) {
    console.error('user-clips error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/user-clips
 * Unlock a clip for the current user
 */
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const accessToken = cookieStore.get('sb-access-token')?.value

    if (!accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken)

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    const { clipId } = await request.json()

    if (!clipId) {
      return NextResponse.json({ error: 'clipId required' }, { status: 400 })
    }

    // Update the clip as unlocked
    const { data, error } = await supabase
      .from('user_clips')
      .update({
        is_unlocked: true,
        unlocked_at: new Date().toISOString()
      })
      .eq('user_id', user.id)
      .eq('clip_id', clipId)
      .select()
      .single()

    if (error) {
      console.error('Error unlocking clip:', error)
      return NextResponse.json({ error: 'Failed to unlock clip' }, { status: 500 })
    }

    return NextResponse.json({ success: true, clip: data })
  } catch (error) {
    console.error('user-clips POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
