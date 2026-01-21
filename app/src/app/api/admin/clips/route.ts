import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseConfig } from '@/lib/env'
import { verifyAdminAccess } from '@/lib/auth/admin'

const config = getSupabaseConfig()
const supabaseUrl = config.url
const supabaseServiceKey = config.serviceKey || config.anonKey

/**
 * GET /api/admin/clips
 * Returns all users with their assigned clips (admin only)
 */
export async function GET() {
  try {
    if (!config.isConfigured) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }

    // Verify admin access
    const auth = await verifyAdminAccess()
    if (!auth.isAdmin) {
      // 401 for auth failures, 403 for authorization failures
      const isAuthFailure = auth.error === 'No access token' || auth.error === 'Invalid session'
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: isAuthFailure ? 401 : 403 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get all profiles with their clips
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select(`
        id,
        email,
        business_name,
        created_at,
        user_clips (
          id,
          clip_id,
          assigned_at,
          is_unlocked,
          unlocked_at,
          notes
        )
      `)
      .order('created_at', { ascending: false })

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError)
      return NextResponse.json({ error: 'Failed to fetch profiles' }, { status: 500 })
    }

    return NextResponse.json({ profiles: profiles || [] })
  } catch (error) {
    console.error('admin clips GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/admin/clips
 * Assign a clip to a user (admin only)
 */
export async function POST(request: Request) {
  try {
    if (!config.isConfigured) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }

    // Verify admin access
    const auth = await verifyAdminAccess()
    if (!auth.isAdmin) {
      // 401 for auth failures, 403 for authorization failures
      const isAuthFailure = auth.error === 'No access token' || auth.error === 'Invalid session'
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: isAuthFailure ? 401 : 403 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { userId, clipId, notes } = await request.json()

    if (!userId || !clipId) {
      return NextResponse.json({ error: 'userId and clipId required' }, { status: 400 })
    }

    // Assign clip to user
    const { data, error } = await supabase
      .from('user_clips')
      .upsert({
        user_id: userId,
        clip_id: clipId,
        assigned_by: auth.userId,
        notes: notes || null,
        assigned_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,clip_id'
      })
      .select()
      .single()

    if (error) {
      console.error('Error assigning clip:', error)
      return NextResponse.json({ error: 'Failed to assign clip' }, { status: 500 })
    }

    return NextResponse.json({ success: true, clip: data })
  } catch (error) {
    console.error('admin clips POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/clips
 * Remove a clip from a user (admin only)
 */
export async function DELETE(request: Request) {
  try {
    if (!config.isConfigured) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }

    // Verify admin access
    const auth = await verifyAdminAccess()
    if (!auth.isAdmin) {
      // 401 for auth failures, 403 for authorization failures
      const isAuthFailure = auth.error === 'No access token' || auth.error === 'Invalid session'
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: isAuthFailure ? 401 : 403 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const clipId = searchParams.get('clipId')

    if (!userId || !clipId) {
      return NextResponse.json({ error: 'userId and clipId required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('user_clips')
      .delete()
      .eq('user_id', userId)
      .eq('clip_id', clipId)

    if (error) {
      console.error('Error removing clip:', error)
      return NextResponse.json({ error: 'Failed to remove clip' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('admin clips DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
