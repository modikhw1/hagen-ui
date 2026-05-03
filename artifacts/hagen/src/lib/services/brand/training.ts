/**
 * Brand Training Service
 * 
 * Handles:
 * - Persisting training notes on messages and conversations
 * - Extracting training examples from conversations
 * - RAG retrieval of relevant examples for better responses
 * - Pattern recognition across conversations
 */

import { createClient } from '@supabase/supabase-js'
import { generateEmbedding } from '@/lib/openai/client'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

// Types
export interface TrainingNote {
  messageId: string
  note: string
}

export interface SessionNotes {
  conversationId: string
  notes: string
  quality?: 'unreviewed' | 'good' | 'needs_improvement' | 'bad' | 'excluded'
}

export interface TrainingExample {
  id?: string
  exampleType: 'good_question' | 'good_response' | 'good_transition' | 'insight_extraction' | 'bad_example' | 'conversation_flow' | 'brand_synthesis'
  context?: string
  content: string
  outcome?: string
  explanation?: string
  tags?: string[]
  phase?: string
  businessType?: string
  qualityScore?: number
}

export interface RetrievedExample {
  id: string
  exampleType: string
  context: string | null
  content: string
  outcome: string | null
  explanation: string | null
  tags: string[]
  phase: string | null
  qualityScore: number
  similarity: number
}

export interface RetrievedPattern {
  id: string
  patternName: string
  patternType: string
  description: string
  whenToUse: string | null
  howToApply: string | null
  similarity: number
}

// ============================================================================
// NOTE PERSISTENCE
// ============================================================================

/**
 * Save a training note for a specific message
 */
export async function saveMessageNote(messageId: string, note: string): Promise<void> {
  const { error } = await supabase
    .from('brand_conversation_messages')
    .update({ training_note: note })
    .eq('id', messageId)

  if (error) {
    throw new Error(`Failed to save message note: ${error.message}`)
  }
}

/**
 * Save multiple message notes at once
 */
export async function saveMessageNotes(notes: TrainingNote[]): Promise<void> {
  const updates = notes.map(({ messageId, note }) => 
    supabase
      .from('brand_conversation_messages')
      .update({ training_note: note })
      .eq('id', messageId)
  )

  await Promise.all(updates)
}

/**
 * Save session-level notes for a conversation
 */
export async function saveSessionNotes(sessionNotes: SessionNotes): Promise<void> {
  const updateData: Record<string, unknown> = {
    session_notes: sessionNotes.notes
  }
  
  if (sessionNotes.quality) {
    updateData.training_quality = sessionNotes.quality
  }

  const { error } = await supabase
    .from('brand_conversations')
    .update(updateData)
    .eq('id', sessionNotes.conversationId)

  if (error) {
    throw new Error(`Failed to save session notes: ${error.message}`)
  }
}

/**
 * Get all notes for a conversation (messages + session)
 */
export async function getConversationNotes(conversationId: string): Promise<{
  sessionNotes: string | null
  trainingQuality: string | null
  messageNotes: { messageId: string; content: string; role: string; note: string }[]
}> {
  // Get conversation session notes
  const { data: conversation, error: convError } = await supabase
    .from('brand_conversations')
    .select('session_notes, training_quality')
    .eq('id', conversationId)
    .single()

  if (convError) {
    throw new Error(`Failed to get conversation: ${convError.message}`)
  }

  // Get message notes
  const { data: messages, error: msgError } = await supabase
    .from('brand_conversation_messages')
    .select('id, content, role, training_note')
    .eq('conversation_id', conversationId)
    .not('training_note', 'is', null)
    .order('message_index')

  if (msgError) {
    throw new Error(`Failed to get messages: ${msgError.message}`)
  }

  return {
    sessionNotes: conversation?.session_notes || null,
    trainingQuality: conversation?.training_quality || null,
    messageNotes: (messages || []).map(m => ({
      messageId: m.id,
      content: m.content,
      role: m.role,
      note: m.training_note
    }))
  }
}

// ============================================================================
// TRAINING EXAMPLE MANAGEMENT
// ============================================================================

/**
 * Create a training example from a message or conversation excerpt
 */
export async function createTrainingExample(example: TrainingExample): Promise<string> {
  // Generate embedding for the example content
  const textForEmbedding = [
    example.context,
    example.content,
    example.outcome,
    example.explanation
  ].filter(Boolean).join('\n\n')

  const embedding = await generateEmbedding(textForEmbedding)

  const { data, error } = await supabase
    .from('brand_training_examples')
    .insert({
      example_type: example.exampleType,
      context: example.context,
      content: example.content,
      outcome: example.outcome,
      explanation: example.explanation,
      tags: example.tags,
      phase: example.phase,
      business_type: example.businessType,
      quality_score: example.qualityScore || 0.5,
      embedding
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(`Failed to create training example: ${error.message}`)
  }

  return data.id
}

/**
 * Extract training examples from a reviewed conversation
 */
export async function extractExamplesFromConversation(
  conversationId: string,
  options: {
    includeGoodResponses?: boolean
    includeBadExamples?: boolean
    minNoteLength?: number
  } = {}
): Promise<TrainingExample[]> {
  const { includeGoodResponses = true, includeBadExamples = true, minNoteLength = 10 } = options

  // Get conversation with messages
  const { data: conversation, error: convError } = await supabase
    .from('brand_conversations')
    .select(`
      id,
      current_phase,
      session_notes,
      training_quality,
      brand_profiles!inner (
        business_type
      )
    `)
    .eq('id', conversationId)
    .single()

  if (convError) {
    throw new Error(`Failed to get conversation: ${convError.message}`)
  }

  const { data: messages, error: msgError } = await supabase
    .from('brand_conversation_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('message_index')

  if (msgError) {
    throw new Error(`Failed to get messages: ${msgError.message}`)
  }

  const examples: TrainingExample[] = []
  const businessType = (conversation.brand_profiles as any)?.business_type

  // Process messages with training notes
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    
    if (!msg.training_note || msg.training_note.length < minNoteLength) {
      continue
    }

    const note = msg.training_note.toLowerCase()
    const isPositive = note.includes('good') || note.includes('great') || note.includes('perfect') || note.includes('works')
    const isNegative = note.includes('bad') || note.includes('wrong') || note.includes("don't") || note.includes('avoid')

    // Get context (previous message)
    const context = i > 0 ? messages[i - 1].content : undefined
    // Get outcome (next message)
    const outcome = i < messages.length - 1 ? messages[i + 1].content : undefined

    if (isPositive && includeGoodResponses && msg.role === 'assistant') {
      examples.push({
        exampleType: 'good_response',
        context,
        content: msg.content,
        outcome,
        explanation: msg.training_note,
        phase: msg.phase,
        businessType,
        qualityScore: 0.8
      })
    }

    if (isNegative && includeBadExamples) {
      examples.push({
        exampleType: 'bad_example',
        context,
        content: msg.content,
        outcome,
        explanation: msg.training_note,
        phase: msg.phase,
        businessType,
        qualityScore: 0.7  // Still valuable for learning what NOT to do
      })
    }
  }

  return examples
}

// ============================================================================
// RAG RETRIEVAL
// ============================================================================

/**
 * Find relevant training examples for the current conversation context
 */
export async function findRelevantExamples(
  currentContext: string,
  options: {
    phase?: string
    businessType?: string
    exampleTypes?: string[]
    limit?: number
    threshold?: number
  } = {}
): Promise<RetrievedExample[]> {
  const { phase, businessType, exampleTypes, limit = 5, threshold = 0.6 } = options

  // Generate embedding for current context
  const embedding = await generateEmbedding(currentContext)

  // Use the database function for retrieval
  const { data, error } = await supabase.rpc('find_training_examples', {
    query_embedding: embedding,
    example_types: exampleTypes || null,
    target_phase: phase || null,
    target_business_type: businessType || null,
    match_threshold: threshold,
    match_count: limit
  })

  if (error) {
    console.error('Failed to find training examples:', error)
    return []
  }

  // Record usage for retrieved examples
  for (const example of data || []) {
    await supabase.rpc('record_example_usage', { example_uuid: example.id })
  }

  return (data || []).map((e: any) => ({
    id: e.id,
    exampleType: e.example_type,
    context: e.context,
    content: e.content,
    outcome: e.outcome,
    explanation: e.explanation,
    tags: e.tags || [],
    phase: e.phase,
    qualityScore: e.quality_score,
    similarity: e.similarity
  }))
}

/**
 * Find relevant patterns for the current situation
 */
export async function findRelevantPatterns(
  currentContext: string,
  options: {
    phase?: string
    patternTypes?: string[]
    limit?: number
    threshold?: number
  } = {}
): Promise<RetrievedPattern[]> {
  const { phase, patternTypes, limit = 3, threshold = 0.6 } = options

  const embedding = await generateEmbedding(currentContext)

  const { data, error } = await supabase.rpc('find_training_patterns', {
    query_embedding: embedding,
    pattern_types: patternTypes || null,
    target_phase: phase || null,
    match_threshold: threshold,
    match_count: limit
  })

  if (error) {
    console.error('Failed to find training patterns:', error)
    return []
  }

  return (data || []).map((p: any) => ({
    id: p.id,
    patternName: p.pattern_name,
    patternType: p.pattern_type,
    description: p.description,
    whenToUse: p.when_to_use,
    howToApply: p.how_to_apply,
    similarity: p.similarity
  }))
}

/**
 * Build context augmentation for the AI from retrieved examples and patterns
 */
export async function buildRAGContext(
  conversationHistory: string,
  currentPhase: string,
  businessType?: string
): Promise<string> {
  // Find relevant examples
  const examples = await findRelevantExamples(conversationHistory, {
    phase: currentPhase,
    businessType,
    exampleTypes: ['good_response', 'good_question', 'insight_extraction'],
    limit: 3
  })

  // Find relevant patterns
  const patterns = await findRelevantPatterns(conversationHistory, {
    phase: currentPhase,
    limit: 2
  })

  if (examples.length === 0 && patterns.length === 0) {
    return ''
  }

  let context = '\n\n---\nLEARNED FROM PAST CONVERSATIONS:\n'

  if (examples.length > 0) {
    context += '\nRelevant examples:\n'
    for (const ex of examples) {
      context += `\n[${ex.exampleType}] ${ex.explanation || ''}\n`
      if (ex.context) context += `Context: "${ex.context.slice(0, 100)}..."\n`
      context += `Response: "${ex.content.slice(0, 200)}..."\n`
    }
  }

  if (patterns.length > 0) {
    context += '\nPatterns to apply:\n'
    for (const p of patterns) {
      context += `\n• ${p.patternName}: ${p.description}\n`
      if (p.howToApply) context += `  How to apply: ${p.howToApply}\n`
    }
  }

  context += '---\n'

  return context
}

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================

/**
 * Export all training data for a conversation (for review or backup)
 */
export async function exportConversationTrainingData(conversationId: string): Promise<{
  conversation: any
  messages: any[]
  examples: any[]
}> {
  const { data: conversation } = await supabase
    .from('brand_conversations')
    .select(`
      *,
      brand_profiles (*)
    `)
    .eq('id', conversationId)
    .single()

  const { data: messages } = await supabase
    .from('brand_conversation_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('message_index')

  const { data: examples } = await supabase
    .from('brand_training_examples')
    .select('*')
    .eq('conversation_id', conversationId)

  return {
    conversation,
    messages: messages || [],
    examples: examples || []
  }
}

/**
 * Get training statistics
 */
export async function getTrainingStats(): Promise<{
  totalConversations: number
  reviewedConversations: number
  totalExamples: number
  examplesByType: Record<string, number>
  totalPatterns: number
}> {
  const { count: totalConv } = await supabase
    .from('brand_conversations')
    .select('*', { count: 'exact', head: true })

  const { count: reviewedConv } = await supabase
    .from('brand_conversations')
    .select('*', { count: 'exact', head: true })
    .neq('training_quality', 'unreviewed')

  const { count: totalEx } = await supabase
    .from('brand_training_examples')
    .select('*', { count: 'exact', head: true })

  const { data: exampleTypes } = await supabase
    .from('brand_training_examples')
    .select('example_type')

  const examplesByType: Record<string, number> = {}
  for (const ex of exampleTypes || []) {
    examplesByType[ex.example_type] = (examplesByType[ex.example_type] || 0) + 1
  }

  const { count: totalPat } = await supabase
    .from('brand_training_patterns')
    .select('*', { count: 'exact', head: true })

  return {
    totalConversations: totalConv || 0,
    reviewedConversations: reviewedConv || 0,
    totalExamples: totalEx || 0,
    examplesByType,
    totalPatterns: totalPat || 0
  }
}
