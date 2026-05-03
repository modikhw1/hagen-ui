/**
 * Discern API - Handle conversation messages
 * 
 * POST /api/discern/message
 * 
 * Workflow:
 * 1. Receive session ID and user message
 * 2. Load conversation context
 * 3. Process message with GPT-4
 * 4. Store both messages
 * 5. Return assistant response
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { 
  processConversation, 
  generateFinalSynthesis,
  generateEmbeddingText,
  type ConversationContext 
} from '@/lib/services/analysis/conversation'
import { generateEmbedding } from '@/lib/services/embeddings/openai'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function buildConversationContext(sessionId: string): Promise<ConversationContext | null> {
  // Load session
  const { data: session, error } = await supabase
    .from('discernment_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (error || !session) return null

  // Load message history
  const { data: messages } = await supabase
    .from('conversation_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('message_index', { ascending: true })

  // Load viral knowledge
  const { data: viralKnowledge } = await supabase
    .from('viral_knowledge')
    .select('principle, category, explanation')
    .eq('active', true)

  // Load user context if user_id exists
  let userDirections: any[] = []
  let userVocabulary: any[] = []
  let focusAreas: any[] = []

  if (session.user_id) {
    const [directions, vocabulary, areas] = await Promise.all([
      supabase.from('user_directions').select('statement, direction_type, applies_to').eq('user_id', session.user_id),
      supabase.from('user_vocabulary').select('term, definition').eq('user_id', session.user_id),
      supabase.from('focus_areas').select('area, description, importance_weight').eq('user_id', session.user_id).order('importance_weight', { ascending: false })
    ])

    userDirections = directions.data || []
    userVocabulary = vocabulary.data || []
    focusAreas = areas.data || []
  }

  return {
    sessionId: session.id,
    videoUrl: session.video_url,
    geminiAnalysis: session.gemini_analysis || {},
    metadata: session.video_metadata || {},
    viralKnowledge: viralKnowledge || [],
    userDirections,
    userVocabulary,
    focusAreas,
    messageHistory: (messages || []).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }))
  }
}

export async function POST(request: Request) {
  try {
    const { sessionId, message, action } = await request.json()

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
    }

    // Handle special actions
    if (action === 'finalize') {
      return handleFinalize(sessionId)
    }

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Build conversation context
    const context = await buildConversationContext(sessionId)
    if (!context) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Get next message index
    const messageIndex = context.messageHistory.length

    // Store user message
    await supabase.from('conversation_messages').insert({
      session_id: sessionId,
      role: 'user',
      content: message,
      message_index: messageIndex
    })

    // Process conversation
    const response = await processConversation(context, message)

    // Store assistant response
    await supabase.from('conversation_messages').insert({
      session_id: sessionId,
      role: 'assistant',
      content: response.message,
      message_index: messageIndex + 1,
      internal_notes: response.internalNotes
    })

    // Update session last_message_at
    await supabase
      .from('discernment_sessions')
      .update({ 
        last_message_at: new Date().toISOString(),
        message_count: messageIndex + 2 // Including this exchange
      })
      .eq('id', sessionId)

    return NextResponse.json({
      message: response.message,
      suggestedActions: response.suggestedActions,
      messageCount: messageIndex + 2
    })

  } catch (error) {
    console.error('Message processing error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process message' },
      { status: 500 }
    )
  }
}

async function handleFinalize(sessionId: string) {
  try {
    // Build context
    const context = await buildConversationContext(sessionId)
    if (!context) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Generate final synthesis
    const synthesis = await generateFinalSynthesis(context)

    // Generate embedding text
    const embeddingText = generateEmbeddingText(context, synthesis)

    // Generate embedding
    const embedding = await generateEmbedding(embeddingText)

    // Update session with final data
    await supabase
      .from('discernment_sessions')
      .update({
        status: 'completed',
        final_synthesis: synthesis,
        embedding,
        completed_at: new Date().toISOString()
      })
      .eq('id', sessionId)

    // Also save to analyzed_videos table if it exists
    try {
      await supabase.from('analyzed_videos').upsert({
        video_url: context.videoUrl,
        platform: context.metadata?.platform || 'unknown',
        video_id: context.metadata?.id || null,
        title: context.metadata?.title || context.metadata?.description?.slice(0, 100) || 'Untitled',
        author_name: context.metadata?.author?.displayName || context.metadata?.author?.username || 'Unknown',
        thumbnail_url: context.metadata?.thumbnail || null,
        duration: context.metadata?.duration || null,
        view_count: context.metadata?.viewCount || context.metadata?.playCount || null,
        like_count: context.metadata?.likeCount || null,
        metadata: context.metadata,
        ai_analysis: context.geminiAnalysis,
        user_ratings: {
          objective: synthesis.viralityScore.objective,
          alignment: synthesis.viralityScore.userAlignment,
          overall: synthesis.viralityScore.overall,
          verdict: synthesis.verdict
        },
        embedding,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'video_url'
      })
    } catch (e) {
      // Table might not exist, that's ok
      console.log('Could not save to analyzed_videos:', e)
    }

    // Store final message
    const messageIndex = context.messageHistory.length
    await supabase.from('conversation_messages').insert({
      session_id: sessionId,
      role: 'assistant',
      content: `## Final Assessment\n\n${synthesis.summary}\n\n**Verdict: ${synthesis.verdict.toUpperCase()}** - ${synthesis.verdictReasoning}\n\n**Scores:**\n- Objective Quality: ${synthesis.viralityScore.objective}/10\n- Alignment with Your Preferences: ${synthesis.viralityScore.userAlignment}/10\n- Overall: ${synthesis.viralityScore.overall}/10 (${synthesis.viralityScore.confidence} confidence)\n\n**Key Takeaways:**\n${(synthesis.keyTakeaways || []).map((t: string) => `- ${t}`).join('\\n')}\n\n**What I learned about your preferences:**\n${(synthesis.userLearnings || []).map((l: string) => `- ${l}`).join('\\n')}`,
      message_index: messageIndex,
      internal_notes: { type: 'synthesis', synthesis }
    })

    return NextResponse.json({
      synthesis,
      embeddingGenerated: !!embedding,
      saved: true
    })

  } catch (error) {
    console.error('Finalize error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to finalize session' },
      { status: 500 }
    )
  }
}

// Handle special actions
export async function PUT(request: Request) {
  try {
    const { sessionId, action, data } = await request.json()

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
    }

    // Get session for user_id
    const { data: session, error: sessionError } = await supabase
      .from('discernment_sessions')
      .select('user_id')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    switch (action) {
      case 'add_direction': {
        if (!data?.statement || !data?.directionType) {
          return NextResponse.json({ error: 'Statement and direction type required' }, { status: 400 })
        }

        const { error } = await supabase.from('user_directions').insert({
          user_id: session.user_id,
          statement: data.statement,
          direction_type: data.directionType,
          applies_to: data.appliesTo || 'all',
          source_session_id: sessionId,
          confidence: 1.0
        })

        if (error) throw error
        return NextResponse.json({ success: true, action: 'direction_added' })
      }

      case 'add_vocabulary': {
        if (!data?.term || !data?.definition) {
          return NextResponse.json({ error: 'Term and definition required' }, { status: 400 })
        }

        const { error } = await supabase.from('user_vocabulary').insert({
          user_id: session.user_id,
          term: data.term,
          definition: data.definition,
          source_session_id: sessionId,
          confirmed: true
        })

        if (error) throw error
        return NextResponse.json({ success: true, action: 'vocabulary_added' })
      }

      case 'update_focus_area': {
        if (!data?.area) {
          return NextResponse.json({ error: 'Area required' }, { status: 400 })
        }

        const { error } = await supabase
          .from('focus_areas')
          .upsert({
            user_id: session.user_id,
            area: data.area,
            description: data.description || '',
            importance_weight: data.importance || 0.5,
            ai_inferred: false
          }, {
            onConflict: 'user_id,area'
          })

        if (error) throw error
        return NextResponse.json({ success: true, action: 'focus_area_updated' })
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

  } catch (error) {
    console.error('Action error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to perform action' },
      { status: 500 }
    )
  }
}
