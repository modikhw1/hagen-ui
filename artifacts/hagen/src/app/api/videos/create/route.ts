/**
 * Simple Video Record Creation (No Metadata Fetch)
 * 
 * Creates a minimal analyzed_videos record for deep analysis
 * without fetching expensive metadata from Supadata/etc.
 * 
 * POST /api/videos/create
 * Body: { url: string }
 * Returns: { id: uuid, url: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

const createRequestSchema = z.object({
  url: z.string().url('Invalid video URL'),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { url } = createRequestSchema.parse(body)

    console.log(`📝 Creating video record: ${url}`)

    // Check if already exists
    const { data: existing } = await supabase
      .from('analyzed_videos')
      .select('id, video_url, visual_analysis')
      .eq('video_url', url)
      .single()

    if (existing) {
      console.log('✅ Video record already exists')
      return NextResponse.json({
        id: existing.id,
        url: existing.video_url,
        hasAnalysis: !!existing.visual_analysis,
        alreadyExists: true
      })
    }

    // Extract basic info from URL
    const videoIdMatch = url.match(/video\/(\d+)/)
    const platformVideoId = videoIdMatch ? videoIdMatch[1] : `v_${Date.now()}`
    
    const platform = url.includes('tiktok') ? 'tiktok' : 
                     url.includes('youtube') ? 'youtube' : 
                     url.includes('instagram') ? 'instagram' : 'unknown'

    // Create minimal record
    const { data: newVideo, error: createError } = await supabase
      .from('analyzed_videos')
      .insert({
        video_url: url,
        video_id: platformVideoId,
        platform,
        metadata: {
          url,
          platform,
          videoId: platformVideoId,
          provider: 'minimal'
        },
        created_at: new Date().toISOString()
      })
      .select('id, video_url')
      .single()

    if (createError) {
      console.error('❌ Failed to create video record:', createError)
      return NextResponse.json(
        { error: 'creation-failed', message: createError.message },
        { status: 500 }
      )
    }

    console.log(`✅ Created video record: ${newVideo.id}`)

    return NextResponse.json({
      id: newVideo.id,
      url: newVideo.video_url,
      hasAnalysis: false,
      alreadyExists: false
    })

  } catch (error) {
    console.error('❌ Video creation failed:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'validation-error', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { 
        error: 'creation-failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
