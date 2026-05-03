/**
 * Video Correction API
 * 
 * POST /api/brand-profile/video-correction
 * 
 * Stores corrections to Gemini interpretations back into the analyzed_videos table
 * This creates a training signal for future Gemini fine-tuning
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

interface CorrectionPayload {
  analyzedVideoId: string
  corrections: {
    tone?: string
    style?: string
    humorType?: string
    whyFunny?: string
    conceptCore?: string
    [key: string]: string | undefined
  }
  correctionNote: string
  conversationId?: string  // Optional: link back to conversation for context
  messageId?: string       // Optional: link to specific message
}

export async function POST(request: NextRequest) {
  try {
    const body: CorrectionPayload = await request.json()
    const { analyzedVideoId, corrections, correctionNote, conversationId, messageId } = body

    if (!analyzedVideoId) {
      return NextResponse.json(
        { error: 'analyzedVideoId is required' },
        { status: 400 }
      )
    }

    if (!corrections || Object.keys(corrections).length === 0) {
      return NextResponse.json(
        { error: 'At least one correction is required' },
        { status: 400 }
      )
    }

    console.log(`🔧 Processing correction for video: ${analyzedVideoId}`)

    // Fetch existing video data
    const { data: video, error: fetchError } = await supabase
      .from('analyzed_videos')
      .select('id, video_url, visual_analysis, user_notes, gemini_corrections')
      .eq('id', analyzedVideoId)
      .single()

    if (fetchError || !video) {
      console.error('Video not found:', fetchError)
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      )
    }

    // Build the correction record
    const correctionRecord = {
      timestamp: new Date().toISOString(),
      corrections,
      note: correctionNote,
      conversationId,
      messageId,
      // Store original values for training comparison
      originalValues: extractOriginalValues(video.visual_analysis, Object.keys(corrections))
    }

    // Get existing corrections array or initialize
    const existingCorrections = video.gemini_corrections || []
    const updatedCorrections = [...existingCorrections, correctionRecord]

    // Also update the visual_analysis with corrected values
    // This ensures the corrected interpretation is used going forward
    const updatedAnalysis = applyCorrectionsToAnalysis(video.visual_analysis, corrections)

    // Update the video record
    const { error: updateError } = await supabase
      .from('analyzed_videos')
      .update({
        visual_analysis: updatedAnalysis,
        gemini_corrections: updatedCorrections,
        // Also append to user_notes for visibility
        user_notes: appendCorrectionToNotes(video.user_notes, correctionNote, corrections)
      })
      .eq('id', analyzedVideoId)

    if (updateError) {
      console.error('Failed to update video:', updateError)
      return NextResponse.json(
        { error: 'Failed to save correction' },
        { status: 500 }
      )
    }

    console.log(`✅ Correction saved for video: ${analyzedVideoId}`)

    return NextResponse.json({
      success: true,
      videoId: analyzedVideoId,
      correctionCount: updatedCorrections.length,
      message: 'Correction saved to Gemini training data'
    })
  } catch (error) {
    console.error('Correction API error:', error)
    return NextResponse.json(
      { error: 'Failed to process correction' },
      { status: 500 }
    )
  }
}

/**
 * Extract original values from visual_analysis for the fields being corrected
 */
function extractOriginalValues(
  analysis: any, 
  fields: string[]
): Record<string, any> {
  const originals: Record<string, any> = {}
  
  if (!analysis) return originals

  const raw = analysis.rawResponse || analysis

  for (const field of fields) {
    switch (field) {
      case 'tone':
        originals.tone = getDeep(raw, 'audio', 'voiceoverTone') || 
                         getDeep(raw, 'content', 'emotionalTone')
        break
      case 'style':
        originals.style = getDeep(raw, 'content', 'format') || 
                          getDeep(raw, 'content', 'style')
        break
      case 'humorType':
        originals.humorType = getDeep(raw, 'humor_analysis', 'primary_type') || 
                              getDeep(raw, 'humor', 'primaryType')
        break
      case 'whyFunny':
        originals.whyFunny = getDeep(raw, 'humor_analysis', 'why_funny') || 
                             getDeep(raw, 'humor', 'whyFunny')
        break
      case 'conceptCore':
        originals.conceptCore = getDeep(raw, 'script', 'conceptCore') || 
                                getDeep(raw, 'script', 'concept_core')
        break
    }
  }

  return originals
}

/**
 * Apply corrections to the visual_analysis object
 */
function applyCorrectionsToAnalysis(
  analysis: any, 
  corrections: Record<string, string | undefined>
): any {
  if (!analysis) return analysis

  // Deep clone to avoid mutation
  const updated = JSON.parse(JSON.stringify(analysis))
  
  // Ensure we have the structure to store corrections
  if (!updated.humanCorrections) {
    updated.humanCorrections = {}
  }

  // Store corrections in a dedicated section
  for (const [key, value] of Object.entries(corrections)) {
    if (value !== undefined) {
      updated.humanCorrections[key] = value
    }
  }

  // Also update the specific fields in the analysis for immediate use
  const raw = updated.rawResponse || updated
  
  if (corrections.tone) {
    if (!raw.content) raw.content = {}
    raw.content.emotionalTone = corrections.tone
    raw.content.correctedTone = corrections.tone
  }
  
  if (corrections.style) {
    if (!raw.content) raw.content = {}
    raw.content.style = corrections.style
    raw.content.correctedStyle = corrections.style
  }
  
  if (corrections.humorType) {
    if (!raw.humor_analysis) raw.humor_analysis = {}
    raw.humor_analysis.primary_type = corrections.humorType
    raw.humor_analysis.corrected = true
  }
  
  if (corrections.whyFunny) {
    if (!raw.humor_analysis) raw.humor_analysis = {}
    raw.humor_analysis.why_funny = corrections.whyFunny
    raw.humor_analysis.corrected = true
  }
  
  if (corrections.conceptCore) {
    if (!raw.script) raw.script = {}
    raw.script.concept_core = corrections.conceptCore
    raw.script.corrected = true
  }

  return updated
}

/**
 * Append correction note to user_notes for visibility
 */
function appendCorrectionToNotes(
  existingNotes: string | null,
  correctionNote: string,
  corrections: Record<string, string | undefined>
): string {
  const correctionSummary = Object.entries(corrections)
    .filter(([_, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ')

  const newNote = `[GEMINI CORRECTION ${new Date().toISOString().split('T')[0]}] ${correctionNote}. Changed: ${correctionSummary}`
  
  if (!existingNotes) {
    return newNote
  }
  
  return `${existingNotes}\n\n${newNote}`
}

/**
 * Safely get nested property
 */
function getDeep(obj: any, ...keys: string[]): any {
  let current = obj
  for (const key of keys) {
    if (current === null || current === undefined) return undefined
    current = current[key]
  }
  return current
}

/**
 * GET - Retrieve corrections for a video
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const videoId = searchParams.get('videoId')

    if (!videoId) {
      return NextResponse.json(
        { error: 'videoId is required' },
        { status: 400 }
      )
    }

    const { data: video, error } = await supabase
      .from('analyzed_videos')
      .select('id, video_url, gemini_corrections, visual_analysis')
      .eq('id', videoId)
      .single()

    if (error || !video) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      videoId: video.id,
      url: video.video_url,
      corrections: video.gemini_corrections || [],
      hasHumanCorrections: (video.visual_analysis as any)?.humanCorrections != null
    })
  } catch (error) {
    console.error('Correction fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch corrections' },
      { status: 500 }
    )
  }
}
