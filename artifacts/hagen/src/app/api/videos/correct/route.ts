/**
 * Video Correction API
 * 
 * Saves human corrections to video analysis, creating learning examples
 * that improve future Gemini analysis through RAG.
 * 
 * POST /api/videos/correct
 * Body: {
 *   videoId: string,
 *   field: string,           // e.g., 'humorType', 'humorMechanism'
 *   originalValue: string,
 *   correctedValue: string,
 *   explanation: string,
 *   culturalContext?: string,
 *   visualElements?: string[]
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { saveVideoCorrection, saveVideoAnalysisExample, getLearningStats } from '@/lib/services/video/learning'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const {
      videoId,
      field,
      originalValue,
      correctedValue,
      explanation,
      culturalContext,
      visualElements
    } = body

    // Validate required fields
    if (!videoId) {
      return NextResponse.json(
        { error: 'videoId is required' },
        { status: 400 }
      )
    }

    if (!field || !correctedValue || !explanation) {
      return NextResponse.json(
        { error: 'field, correctedValue, and explanation are required' },
        { status: 400 }
      )
    }

    console.log(`📝 Saving correction for video ${videoId}: ${field}`)

    const result = await saveVideoCorrection(videoId, {
      field,
      originalValue: originalValue || '',
      correctedValue,
      explanation,
      culturalContext,
      visualElements
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to save correction' },
        { status: 500 }
      )
    }

    console.log(`✅ Correction saved for video ${videoId}`)

    return NextResponse.json({
      success: true,
      message: 'Correction saved and will improve future analysis'
    })

  } catch (error) {
    console.error('Error in POST /api/videos/correct:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * Add a new learning example directly (for bulk import)
 * 
 * PUT /api/videos/correct
 * Body: SaveExampleInput
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()

    const {
      videoId,
      videoUrl,
      exampleType,
      videoSummary,
      geminiInterpretation,
      correctInterpretation,
      explanation,
      humorTypeCorrection,
      culturalContext,
      visualElements,
      tags,
      humorTypes,
      industry,
      contentFormat,
      qualityScore
    } = body

    // Validate required fields
    if (!exampleType || !videoSummary || !correctInterpretation || !explanation) {
      return NextResponse.json(
        { error: 'exampleType, videoSummary, correctInterpretation, and explanation are required' },
        { status: 400 }
      )
    }

    console.log(`📝 Adding learning example: ${exampleType}`)

    const result = await saveVideoAnalysisExample({
      videoId,
      videoUrl,
      exampleType,
      videoSummary,
      geminiInterpretation,
      correctInterpretation,
      explanation,
      humorTypeCorrection,
      culturalContext,
      visualElements,
      tags,
      humorTypes,
      industry,
      contentFormat,
      qualityScore
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to save example' },
        { status: 500 }
      )
    }

    console.log(`✅ Learning example saved: ${result.id}`)

    return NextResponse.json({
      success: true,
      id: result.id,
      message: 'Learning example saved'
    })

  } catch (error) {
    console.error('Error in PUT /api/videos/correct:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * Get learning statistics
 * 
 * GET /api/videos/correct
 */
export async function GET() {
  try {
    const stats = await getLearningStats()
    
    return NextResponse.json({
      success: true,
      stats
    })

  } catch (error) {
    console.error('Error in GET /api/videos/correct:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
