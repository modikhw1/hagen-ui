/**
 * Brand Training Notes API
 * 
 * POST /api/brand-profile/notes - Save training notes
 * GET /api/brand-profile/notes?conversationId=xxx - Get notes for a conversation
 */

import { NextRequest, NextResponse } from 'next/server'
import { 
  saveMessageNote, 
  saveMessageNotes, 
  saveSessionNotes, 
  getConversationNotes 
} from '@/lib/services/brand/training'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const conversationId = searchParams.get('conversationId')

    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversationId is required' },
        { status: 400 }
      )
    }

    const notes = await getConversationNotes(conversationId)

    return NextResponse.json(notes)
  } catch (error) {
    console.error('Get notes error:', error)
    return NextResponse.json(
      { error: 'Failed to get notes' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { conversationId, messageNotes, sessionNotes, trainingQuality } = body

    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversationId is required' },
        { status: 400 }
      )
    }

    // Save message-level notes if provided
    if (messageNotes && Array.isArray(messageNotes)) {
      await saveMessageNotes(messageNotes.map((n: { messageId: string; note: string }) => ({
        messageId: n.messageId,
        note: n.note
      })))
    }

    // Save session-level notes if provided
    if (sessionNotes !== undefined || trainingQuality !== undefined) {
      await saveSessionNotes({
        conversationId,
        notes: sessionNotes || '',
        quality: trainingQuality
      })
    }

    return NextResponse.json({ 
      success: true,
      message: 'Notes saved successfully'
    })
  } catch (error) {
    console.error('Save notes error:', error)
    return NextResponse.json(
      { error: 'Failed to save notes' },
      { status: 500 }
    )
  }
}
