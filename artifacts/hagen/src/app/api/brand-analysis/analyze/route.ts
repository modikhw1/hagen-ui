/**
 * Brand Analysis (Schema v1) - Analyze a video via Vertex (if configured)
 *
 * POST /api/brand-analysis/analyze
 *
 * Request:
 * {
 *   "video_id": "uuid" (optional),
 *   "video_url": "https://..." (optional)
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   analysis: VideoBrandAnalysis
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getBrandAnalyzer } from '@/lib/services/brand'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { video_id, video_url, gcs_uri } = body || {}

    if (!video_id && !video_url) {
      return NextResponse.json({ error: 'video_id or video_url is required' }, { status: 400 })
    }

    // Load video record if we can (for gcs_uri)
    let videoRecord:
      | {
          id: string
          video_url: string | null
          platform: string | null
          gcs_uri: string | null
        }
      | null = null

    if (video_id) {
      const { data, error } = await supabase
        .from('analyzed_videos')
        .select('id, video_url, platform, gcs_uri')
        .eq('id', video_id)
        .single()

      if (error) throw error
      videoRecord = data
    } else if (video_url) {
      const { data, error } = await supabase
        .from('analyzed_videos')
        .select('id, video_url, platform, gcs_uri')
        .eq('video_url', video_url)
        .single()

      if (error) {
        // If the video isn't in DB yet, we can still proceed but only with URL.
        videoRecord = null
      } else {
        videoRecord = data
      }
    }

    const analyzer = getBrandAnalyzer()

    const analysis = await analyzer.analyze({
      videoId: videoRecord?.id || video_id || undefined,
      videoUrl: videoRecord?.video_url || video_url || undefined,
      gcsUri: gcs_uri || videoRecord?.gcs_uri || undefined
    })

    return NextResponse.json({
      success: true,
      analysis
    })
  } catch (error) {
    console.error('POST brand-analysis/analyze error:', error)
    return NextResponse.json(
      {
        error: 'Failed to analyze video',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
