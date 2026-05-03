/**
 * Brand Reference Video API
 * 
 * POST /api/brand-profile/[id]/reference-video
 * 
 * Add a reference video that the customer admires
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { chat } from '@/lib/claude/client'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { videoUrl, reason, aspectsAdmired } = body

    if (!videoUrl) {
      return NextResponse.json(
        { error: 'Video URL is required' },
        { status: 400 }
      )
    }

    console.log(`📎 Adding reference video to brand profile: ${id}`)

    // Detect platform
    const platform = detectPlatform(videoUrl)

    // Check if video already exists in analyzed_videos
    const { data: existingVideo } = await supabase
      .from('analyzed_videos')
      .select('id')
      .eq('video_url', videoUrl)
      .single()

    // Extract tone signals using Claude (lightweight analysis)
    let extractedTone = {}
    if (reason) {
      extractedTone = await extractToneFromReason(reason, aspectsAdmired)
    }

    // Store reference video
    const { data: refVideo, error } = await supabase
      .from('brand_reference_videos')
      .insert({
        brand_profile_id: id,
        video_url: videoUrl,
        platform,
        reason,
        aspects_admired: aspectsAdmired || [],
        analyzed_video_id: existingVideo?.id || null,
        extracted_tone: extractedTone
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to store reference video:', error)
      return NextResponse.json(
        { error: 'Failed to add reference video' },
        { status: 500 }
      )
    }

    // Also update the brand profile's reference_videos JSONB array
    const { data: profile } = await supabase
      .from('brand_profiles')
      .select('reference_videos')
      .eq('id', id)
      .single()

    const currentRefs = profile?.reference_videos || []
    await supabase
      .from('brand_profiles')
      .update({
        reference_videos: [
          ...currentRefs,
          {
            url: videoUrl,
            platform,
            why_admired: reason,
            analyzed_video_id: existingVideo?.id || null
          }
        ]
      })
      .eq('id', id)

    console.log(`✅ Reference video added`)

    return NextResponse.json({
      referenceVideo: refVideo,
      linkedToAnalyzed: !!existingVideo
    })
  } catch (error) {
    console.error('Reference video error:', error)
    return NextResponse.json(
      { error: 'Failed to add reference video' },
      { status: 500 }
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data: videos, error } = await supabase
      .from('brand_reference_videos')
      .select(`
        *,
        analyzed_video:analyzed_videos(
          id,
          metadata,
          gemini_analysis
        )
      `)
      .eq('brand_profile_id', id)

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch reference videos' },
        { status: 500 }
      )
    }

    return NextResponse.json({ videos })
  } catch (error) {
    console.error('Reference video fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch reference videos' },
      { status: 500 }
    )
  }
}

function detectPlatform(url: string): string {
  if (url.includes('tiktok.com')) return 'tiktok'
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube'
  if (url.includes('instagram.com')) return 'instagram'
  return 'unknown'
}

async function extractToneFromReason(reason: string, aspects?: string[]): Promise<Record<string, any>> {
  const prompt = `Based on why someone admires a video, extract tone signals.

They said: "${reason}"
${aspects?.length ? `Aspects they specifically mentioned: ${aspects.join(', ')}` : ''}

Extract as JSON:
{
  "energy": 1-10 (inferred from what they like),
  "humor_level": 1-10,
  "production_style": "raw" | "polished" | "mixed",
  "content_type": "educational" | "entertainment" | "promotional" | "behind-scenes",
  "tone_tags": ["tag1", "tag2"] (e.g., casual, authentic, energetic, professional)
}

Only output the JSON, no explanation.`

  try {
    const response = await chat(
      'You extract structured data from text. Only output valid JSON.',
      [{ role: 'user', content: prompt }],
      { maxTokens: 300, temperature: 0.3 }
    )

    return JSON.parse(response.content)
  } catch {
    return {}
  }
}
