/**
 * Brand Profile Detail API
 * 
 * GET /api/brand-profile/[id] - Get brand profile details
 * PATCH /api/brand-profile/[id] - Update brand profile
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Get profile
    const { data: profile, error: profileError } = await supabase
      .from('brand_profiles')
      .select('*')
      .eq('id', id)
      .single()

    if (profileError) {
      return NextResponse.json(
        { error: 'Brand profile not found' },
        { status: 404 }
      )
    }

    // Get associated conversation
    const { data: conversation } = await supabase
      .from('brand_conversations')
      .select('*')
      .eq('brand_profile_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    // Get conversation messages if conversation exists
    let messages: any[] = []
    if (conversation) {
      const { data: msgs } = await supabase
        .from('brand_conversation_messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('message_index', { ascending: true })
      
      messages = msgs || []
    }

    // Get reference videos
    const { data: referenceVideos } = await supabase
      .from('brand_reference_videos')
      .select('*')
      .eq('brand_profile_id', id)

    return NextResponse.json({
      profile,
      conversation,
      messages,
      referenceVideos: referenceVideos || []
    })
  } catch (error) {
    console.error('Brand profile fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch brand profile' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Only allow updating certain fields
    const allowedFields = [
      'name',
      'business_type',
      'characteristics',
      'tone',
      'current_state',
      'goals',
      'target_audience',
      'status'
    ]

    const updates: Record<string, any> = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      )
    }

    const { data: profile, error } = await supabase
      .from('brand_profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update brand profile' },
        { status: 500 }
      )
    }

    return NextResponse.json({ profile })
  } catch (error) {
    console.error('Brand profile update error:', error)
    return NextResponse.json(
      { error: 'Failed to update brand profile' },
      { status: 500 }
    )
  }
}
