/**
 * Brand Profile API
 * 
 * GET /api/brand-profile - List brand profiles
 * POST /api/brand-profile - Create new brand profile (starts conversation)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { startConversation } from '@/lib/services/brand/conversation'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '20')

    let query = supabase
      .from('brand_profiles')
      .select(`
        id,
        name,
        business_type,
        characteristics,
        tone,
        status,
        created_at,
        updated_at
      `)
      .order('updated_at', { ascending: false })
      .limit(limit)

    if (status) {
      query = query.eq('status', status)
    }

    const { data: profiles, error } = await query

    if (error) {
      console.error('Error fetching brand profiles:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ profiles })
  } catch (error) {
    console.error('Brand profile list error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch brand profiles' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { brandName, userId } = body

    if (!brandName) {
      return NextResponse.json(
        { error: 'Brand name is required' },
        { status: 400 }
      )
    }

    console.log(`🚀 Starting brand profile conversation for: ${brandName}`)

    const result = await startConversation(brandName, userId)

    console.log(`✅ Brand conversation started: ${result.conversation.id}`)

    return NextResponse.json({
      profileId: result.profile.id,
      conversationId: result.conversation.id,
      openingMessage: result.openingMessage,
      currentPhase: result.conversation.current_phase
    })
  } catch (error) {
    console.error('Brand profile creation error:', error)
    return NextResponse.json(
      { error: 'Failed to start brand profiling session' },
      { status: 500 }
    )
  }
}
