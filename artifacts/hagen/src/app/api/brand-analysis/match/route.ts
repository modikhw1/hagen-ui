/**
 * Profile Match Endpoint
 *
 * POST /api/brand-analysis/match
 * Compare a candidate video against a profile fingerprint.
 *
 * Body:
 * {
 *   "candidate_video_id": string,
 *   "fingerprint": ProfileFingerprint  // from /api/brand-analysis/profile
 * }
 *
 * OR for batch matching:
 * {
 *   "candidate_video_ids": string[],
 *   "fingerprint": ProfileFingerprint
 * }
 *
 * Returns MatchResult(s) with overall_match, layer_scores, and explanation.
 */

import { NextRequest, NextResponse } from 'next/server'
import { computeMatch } from '@/lib/services/brand/profile-fingerprint'
import type { ProfileFingerprint, MatchResult } from '@/lib/services/brand/profile-fingerprint.types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { candidate_video_id, candidate_video_ids, fingerprint } = body as {
      candidate_video_id?: string
      candidate_video_ids?: string[]
      fingerprint: ProfileFingerprint
    }

    if (!fingerprint || !fingerprint.embedding || fingerprint.embedding.length !== 1536) {
      return NextResponse.json(
        { error: 'Valid fingerprint with embedding required' },
        { status: 400 }
      )
    }

    // Single video match
    if (candidate_video_id) {
      const match = await computeMatch(candidate_video_id, fingerprint)
      return NextResponse.json({
        success: true,
        match
      })
    }

    // Batch match
    if (candidate_video_ids && Array.isArray(candidate_video_ids)) {
      if (candidate_video_ids.length > 50) {
        return NextResponse.json(
          { error: 'Maximum 50 candidate videos allowed' },
          { status: 400 }
        )
      }

      const matches: MatchResult[] = []
      const errors: Array<{ video_id: string; error: string }> = []

      for (const videoId of candidate_video_ids) {
        try {
          const match = await computeMatch(videoId, fingerprint)
          matches.push(match)
        } catch (err) {
          errors.push({
            video_id: videoId,
            error: err instanceof Error ? err.message : 'Unknown error'
          })
        }
      }

      // Sort by overall match descending
      matches.sort((a, b) => b.overall_match - a.overall_match)

      return NextResponse.json({
        success: true,
        matches,
        errors: errors.length > 0 ? errors : undefined
      })
    }

    return NextResponse.json(
      { error: 'Either candidate_video_id or candidate_video_ids required' },
      { status: 400 }
    )
  } catch (error) {
    console.error('POST /api/brand-analysis/match error:', error)
    return NextResponse.json(
      {
        error: 'Failed to compute match',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
