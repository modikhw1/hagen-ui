/**
 * Brand Training Examples API
 * 
 * GET /api/brand-profile/training - Get training stats and examples
 * POST /api/brand-profile/training - Create training example or extract from conversation
 */

import { NextRequest, NextResponse } from 'next/server'
import { 
  createTrainingExample,
  extractExamplesFromConversation,
  getTrainingStats,
  exportConversationTrainingData
} from '@/lib/services/brand/training'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const action = searchParams.get('action')
    const conversationId = searchParams.get('conversationId')

    if (action === 'stats') {
      const stats = await getTrainingStats()
      return NextResponse.json(stats)
    }

    if (action === 'export' && conversationId) {
      const data = await exportConversationTrainingData(conversationId)
      return NextResponse.json(data)
    }

    // Default: return stats
    const stats = await getTrainingStats()
    return NextResponse.json(stats)
  } catch (error) {
    console.error('Training API GET error:', error)
    return NextResponse.json(
      { error: 'Failed to get training data' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, conversationId, example } = body

    // Extract examples from a reviewed conversation
    if (action === 'extract' && conversationId) {
      const examples = await extractExamplesFromConversation(conversationId, {
        includeGoodResponses: true,
        includeBadExamples: true
      })

      // Save extracted examples
      const savedIds: string[] = []
      for (const ex of examples) {
        const id = await createTrainingExample({
          ...ex,
          // Link back to conversation
        })
        savedIds.push(id)
      }

      return NextResponse.json({
        success: true,
        extractedCount: examples.length,
        savedIds
      })
    }

    // Create a single training example
    if (action === 'create' && example) {
      const id = await createTrainingExample(example)
      return NextResponse.json({
        success: true,
        exampleId: id
      })
    }

    return NextResponse.json(
      { error: 'Invalid action. Use "extract" or "create"' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Training API POST error:', error)
    return NextResponse.json(
      { error: 'Failed to process training request' },
      { status: 500 }
    )
  }
}
