/**
 * Brand Profile Message API
 * 
 * POST /api/brand-profile/message
 * 
 * Handles conversation messages for brand discovery
 */

import { NextRequest, NextResponse } from 'next/server'
import { processMessage, transitionPhase, generateSynthesis } from '@/lib/services/brand/conversation'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { conversationId, message, action } = body

    if (!conversationId) {
      return NextResponse.json(
        { error: 'Conversation ID is required' },
        { status: 400 }
      )
    }

    // Handle special actions
    if (action === 'transition') {
      console.log(`📍 Transitioning phase for conversation: ${conversationId}`)
      
      const result = await transitionPhase(conversationId)
      
      return NextResponse.json({
        message: result.transitionMessage,
        newPhase: result.newPhase,
        action: 'transition'
      })
    }

    if (action === 'synthesize') {
      console.log(`🎯 Generating synthesis for conversation: ${conversationId}`)
      
      const synthesis = await generateSynthesis(conversationId)
      
      return NextResponse.json({
        synthesis,
        action: 'synthesize'
      })
    }

    // Regular message processing
    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    console.log(`💬 Processing message for conversation: ${conversationId}`)

    const result = await processMessage(conversationId, message)

    return NextResponse.json({
      message: result.response,
      insights: result.insights,
      phaseComplete: result.phaseComplete,
      nextPhase: result.nextPhase,
      tokensUsed: result.tokensUsed,
      userMessageId: result.userMessageId,
      assistantMessageId: result.assistantMessageId,
      videoAnalyses: result.videoAnalyses
    })
  } catch (error) {
    console.error('Brand message processing error:', error)
    return NextResponse.json(
      { error: 'Failed to process message' },
      { status: 500 }
    )
  }
}
