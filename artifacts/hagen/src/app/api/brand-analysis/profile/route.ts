/**
 * Profile Fingerprint Endpoint
 *
 * POST /api/brand-analysis/profile
 * Compute a profile fingerprint from a list of video URLs.
 *
 * Body:
 * {
 *   "profile_name"?: string,
 *   "video_urls": string[]  // 5-10 video URLs
 * }
 *
 * Returns the computed ProfileFingerprint with layers and confidence.
 */

import { NextRequest, NextResponse } from 'next/server'
import { computeFingerprint } from '@/lib/services/brand/profile-fingerprint'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { profile_name, video_urls } = body as {
      profile_name?: string
      video_urls: string[]
    }

    if (!video_urls || !Array.isArray(video_urls) || video_urls.length === 0) {
      return NextResponse.json(
        { error: 'video_urls array is required' },
        { status: 400 }
      )
    }

    if (video_urls.length > 20) {
      return NextResponse.json(
        { error: 'Maximum 20 video URLs allowed' },
        { status: 400 }
      )
    }

    const fingerprint = await computeFingerprint({
      profile_name,
      video_urls
    })

    return NextResponse.json({
      success: true,
      fingerprint
    })
  } catch (error) {
    console.error('POST /api/brand-analysis/profile error:', error)
    return NextResponse.json(
      {
        error: 'Failed to compute profile fingerprint',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
