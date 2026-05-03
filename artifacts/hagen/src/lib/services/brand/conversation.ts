/**
 * Brand Conversation Handler
 * 
 * Manages the multi-turn dialogue for brand discovery.
 * Uses Claude to conduct conversations and extract insights.
 */

import { createClient } from '@supabase/supabase-js'
import { chat, chatWithExtraction } from '@/lib/claude/client'
import { 
  CONVERSATION_PHASES, 
  INSIGHT_EXTRACTION_INSTRUCTIONS,
  SYNTHESIS_PROMPT,
  buildPhasePrompt,
  buildPersonaWithFeedback
} from './prompts'
import {
  extractVideoUrls,
  analyzeVideoForBrandContext,
  formatVideoContextForPrompt,
  type VideoAnalysisContext
} from './video-context'
import type { 
  BrandConversation, 
  BrandConversationMessage,
  ConversationPhase,
  MessageInsights,
  AccumulatedInsights,
  BrandSynthesis
} from './types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

const PHASE_ORDER: ConversationPhase[] = [
  'introduction',
  'business_goals', 
  'social_goals',
  'tone_discovery',
  'audience',
  'references',
  'synthesis'
]

/**
 * Fetch session notes from past conversations to inform the AI
 * Returns an array of actionable feedback points
 */
async function fetchLearnedFeedback(): Promise<string[]> {
  const { data: conversations } = await supabase
    .from('brand_conversations')
    .select('session_notes')
    .not('session_notes', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(10)  // Get most recent 10 conversations with feedback

  if (!conversations || conversations.length === 0) {
    return []
  }

  // Extract and clean up the notes
  return conversations
    .map(c => c.session_notes?.trim())
    .filter((note): note is string => !!note && note.length > 10)
}

/**
 * Start a new brand profiling conversation
 */
export async function startConversation(brandName: string, userId?: string): Promise<{
  conversation: BrandConversation
  profile: { id: string }
  openingMessage: string
}> {
  // Create brand profile first
  const { data: profile, error: profileError } = await supabase
    .from('brand_profiles')
    .insert({
      name: brandName,
      user_id: userId,
      status: 'draft'
    })
    .select('id')
    .single()

  if (profileError || !profile) {
    throw new Error(`Failed to create brand profile: ${profileError?.message}`)
  }

  // Create conversation
  const { data: conversation, error: convError } = await supabase
    .from('brand_conversations')
    .insert({
      brand_profile_id: profile.id,
      status: 'active',
      current_phase: 'introduction',
      accumulated_insights: {}
    })
    .select('*')
    .single()

  if (convError || !conversation) {
    throw new Error(`Failed to create conversation: ${convError?.message}`)
  }

  // Fetch learned feedback to inform the opening message
  const feedbackNotes = await fetchLearnedFeedback()
  
  // Generate dynamic opening message using Claude
  let openingMessage: string
  
  // Always generate dynamically now with the improved persona
  const persona = buildPersonaWithFeedback(feedbackNotes)
  const openingPrompt = `${persona}

You are starting a brand discovery conversation with a business owner.
Their business is called: "${brandName}"

Generate an opening message that:
1. Brief intro (one line max)
2. Immediately asks about their ACTUAL content - what does their feed look like, what have they posted recently
3. Maximum 2 sentences total
4. Direct and professional - you're a consultant, not making small talk

BAD example (too chatty): "Hi! I'm so excited to learn about your business! Tell me your story..."
GOOD example: "I help businesses clarify their content voice. Let's start with what's real - describe your last few social posts. What content are you actually putting out there?"

Generate the opening now.`

  try {
    const response = await chat(
      openingPrompt,
      [{ role: 'user', content: 'Generate the opening message.' }],
      { maxTokens: 100, temperature: 0.5 }  // Lower temp for more consistency
    )
    openingMessage = response.content
  } catch (error) {
    // Fall back to static opener on error
    console.error('Failed to generate dynamic opener:', error)
    openingMessage = "I help businesses find their content voice. To start - can you describe what your social media feed actually looks like? What kind of posts have you been sharing recently?"
  }

  // Store the opening message
  await supabase
    .from('brand_conversation_messages')
    .insert({
      conversation_id: conversation.id,
      role: 'assistant',
      content: openingMessage,
      message_index: 0,
      phase: 'introduction',
      extracted_insights: {}
    })

  return {
    conversation: conversation as BrandConversation,
    profile: { id: profile.id },
    openingMessage
  }
}

/**
 * Process a user message and generate AI response
 */
export async function processMessage(
  conversationId: string,
  userMessage: string
): Promise<{
  response: string
  insights: MessageInsights
  phaseComplete: boolean
  nextPhase?: ConversationPhase
  tokensUsed: number
  userMessageId: string
  assistantMessageId: string
  videoAnalyses?: VideoAnalysisContext[]
}> {
  // Load conversation context
  const context = await loadConversationContext(conversationId)
  if (!context) {
    throw new Error('Conversation not found')
  }

  // Get message count for index
  const messageIndex = context.messages.length

  // Store user message
  const { data: userMsgData, error: userMsgError } = await supabase
    .from('brand_conversation_messages')
    .insert({
      conversation_id: conversationId,
      role: 'user',
      content: userMessage,
      message_index: messageIndex,
      phase: context.conversation.current_phase,
      extracted_insights: {}
    })
    .select('id')
    .single()

  if (userMsgError) {
    throw new Error(`Failed to store user message: ${userMsgError.message}`)
  }

  // Build conversation history for Claude
  const messageHistory = context.messages.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content
  }))
  messageHistory.push({ role: 'user', content: userMessage })

  // Fetch learned feedback from past conversations
  const feedbackNotes = await fetchLearnedFeedback()

  // Check for video URLs in the user message and analyze them
  const videoUrls = extractVideoUrls(userMessage)
  let videoContextPrompt = ''
  let videoAnalyses: VideoAnalysisContext[] = []
  
  if (videoUrls.length > 0) {
    console.log(`🎬 Detected ${videoUrls.length} video link(s) in message`)
    
    // Analyze each video (in parallel for speed)
    const analysisPromises = videoUrls.map(url => 
      analyzeVideoForBrandContext(url, context.conversation.current_phase)
    )
    const analyses = await Promise.all(analysisPromises)
    
    // Filter out failed analyses
    const successfulAnalyses = analyses.filter((a): a is VideoAnalysisContext => a !== null)
    videoAnalyses = successfulAnalyses
    
    if (successfulAnalyses.length > 0) {
      videoContextPrompt = formatVideoContextForPrompt(successfulAnalyses)
      console.log(`✅ Analyzed ${successfulAnalyses.length} video(s) for brand context`)
    }
  }

  // Build phase-specific system prompt with learned behaviors
  let systemPrompt = buildPhasePrompt(
    context.conversation.current_phase as keyof typeof CONVERSATION_PHASES,
    context.conversation.accumulated_insights,
    feedbackNotes
  )
  
  // Inject video context if available
  if (videoContextPrompt) {
    systemPrompt = systemPrompt + '\n\n' + videoContextPrompt
  }

  // Get response with insight extraction
  const result = await chatWithExtraction<MessageInsights>(
    systemPrompt,
    messageHistory,
    INSIGHT_EXTRACTION_INSTRUCTIONS,
    { maxTokens: 1500 }
  )

  // Merge new insights with accumulated
  const mergedInsights = mergeInsights(
    context.conversation.accumulated_insights,
    result.extraction
  )

  // Determine if phase should advance
  const { shouldAdvance, nextPhase } = determinePhaseTransition(
    context.conversation.current_phase as ConversationPhase,
    context.messages.length,
    result.extraction
  )

  // Store assistant response
  const { data: assistantMsgData, error: assistantMsgError } = await supabase
    .from('brand_conversation_messages')
    .insert({
      conversation_id: conversationId,
      role: 'assistant',
      content: result.response,
      message_index: messageIndex + 1,
      phase: context.conversation.current_phase,
      extracted_insights: result.extraction,
      tokens_used: result.usage.inputTokens + result.usage.outputTokens
    })
    .select('id')
    .single()

  if (assistantMsgError) {
    throw new Error(`Failed to store assistant message: ${assistantMsgError.message}`)
  }

  // Update conversation state
  await supabase
    .from('brand_conversations')
    .update({
      accumulated_insights: mergedInsights,
      current_phase: shouldAdvance ? nextPhase : context.conversation.current_phase,
      message_count: messageIndex + 2,
      total_tokens_used: context.conversation.total_tokens_used + result.usage.inputTokens + result.usage.outputTokens
    })
    .eq('id', conversationId)

  return {
    response: result.response,
    insights: result.extraction,
    phaseComplete: shouldAdvance,
    nextPhase: shouldAdvance ? nextPhase : undefined,
    tokensUsed: result.usage.inputTokens + result.usage.outputTokens,
    userMessageId: userMsgData.id,
    assistantMessageId: assistantMsgData.id,
    videoAnalyses: videoAnalyses.length > 0 ? videoAnalyses : undefined
  }
}

/**
 * Transition to next phase explicitly
 */
export async function transitionPhase(conversationId: string): Promise<{
  newPhase: ConversationPhase
  transitionMessage: string
}> {
  const context = await loadConversationContext(conversationId)
  if (!context) {
    throw new Error('Conversation not found')
  }

  const currentPhaseIndex = PHASE_ORDER.indexOf(context.conversation.current_phase as ConversationPhase)
  if (currentPhaseIndex === -1 || currentPhaseIndex >= PHASE_ORDER.length - 1) {
    throw new Error('Cannot transition further')
  }

  const newPhase = PHASE_ORDER[currentPhaseIndex + 1]

  const phaseConfig = CONVERSATION_PHASES[newPhase as keyof typeof CONVERSATION_PHASES];
  // Use sampleOpener if transitionPrompt is not present (for introduction phase)
  const inspiration = (phaseConfig as any).transitionPrompt || (phaseConfig as any).sampleOpener || '';

  // Generate a contextual transition message
  const messageHistory = context.messages.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content
  }));

  // Fetch learned feedback for transition messages too
  const feedbackNotes = await fetchLearnedFeedback()
  const persona = buildPersonaWithFeedback(feedbackNotes)

  const transitionSystemPrompt = `${persona}

You are transitioning to the next phase of the conversation.
CURRENT INSIGHTS: ${JSON.stringify(context.conversation.accumulated_insights, null, 2)}

Generate a natural transition message that:
1. Briefly acknowledges what you've learned so far
2. Smoothly introduces the next topic: ${phaseConfig.goal}

Use this as inspiration but make it natural: "${inspiration}"

Keep it warm and conversational, under 100 words.`;

  const response = await chat(
    transitionSystemPrompt,
    messageHistory,
    { maxTokens: 300 }
  );

  // Store transition message
  const messageIndex = context.messages.length
  await supabase
    .from('brand_conversation_messages')
    .insert({
      conversation_id: conversationId,
      role: 'assistant',
      content: response.content,
      message_index: messageIndex,
      phase: newPhase,
      extracted_insights: {},
      tokens_used: response.usage.inputTokens + response.usage.outputTokens
    })

  // Update conversation phase
  await supabase
    .from('brand_conversations')
    .update({
      current_phase: newPhase,
      message_count: messageIndex + 1,
      total_tokens_used: context.conversation.total_tokens_used + response.usage.inputTokens + response.usage.outputTokens
    })
    .eq('id', conversationId)

  return {
    newPhase,
    transitionMessage: response.content
  }
}

/**
 * Generate final brand synthesis
 */
export async function generateSynthesis(conversationId: string): Promise<BrandSynthesis> {
  const context = await loadConversationContext(conversationId)
  if (!context) {
    throw new Error('Conversation not found')
  }

  // Build full conversation transcript
  const transcript = context.messages
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n')

  // Fetch learned feedback for synthesis too
  const feedbackNotes = await fetchLearnedFeedback()
  const persona = buildPersonaWithFeedback(feedbackNotes)

  const systemPrompt = `${persona}

You have completed a brand discovery conversation. Now generate a comprehensive synthesis.

CONVERSATION TRANSCRIPT:
${transcript}

ACCUMULATED INSIGHTS:
${JSON.stringify(context.conversation.accumulated_insights, null, 2)}

${SYNTHESIS_PROMPT}`

  const response = await chat(
    systemPrompt,
    [{ role: 'user', content: 'Please generate the brand profile synthesis based on our conversation.' }],
    { maxTokens: 3000, temperature: 0.5 }
  )

  // Parse synthesis JSON
  const jsonMatch = response.content.match(/```json\n?([\s\S]*?)\n?```/)
  let synthesis: BrandSynthesis

  if (jsonMatch) {
    try {
      synthesis = JSON.parse(jsonMatch[1])
    } catch {
      throw new Error('Failed to parse synthesis JSON')
    }
  } else {
    try {
      synthesis = JSON.parse(response.content)
    } catch {
      throw new Error('Failed to parse synthesis response')
    }
  }

  // Update brand profile with synthesis
  await supabase
    .from('brand_profiles')
    .update({
      characteristics: synthesis.characteristics,
      tone: synthesis.tone,
      current_state: synthesis.current_state,
      goals: synthesis.goals,
      target_audience: synthesis.target_audience,
      conversation_synthesis: synthesis.narrative_summary,
      key_insights: synthesis.key_insights,
      status: 'complete'
    })
    .eq('id', context.brandProfileId)

  // Mark conversation as completed
  await supabase
    .from('brand_conversations')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString()
    })
    .eq('id', conversationId)

  return synthesis
}

/**
 * Load conversation context
 */
async function loadConversationContext(conversationId: string): Promise<{
  conversation: BrandConversation
  messages: BrandConversationMessage[]
  brandProfileId: string
} | null> {
  const { data: conversation, error } = await supabase
    .from('brand_conversations')
    .select('*')
    .eq('id', conversationId)
    .single()

  if (error || !conversation) return null

  const { data: messages } = await supabase
    .from('brand_conversation_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('message_index', { ascending: true })

  return {
    conversation: conversation as BrandConversation,
    messages: (messages || []) as BrandConversationMessage[],
    brandProfileId: conversation.brand_profile_id
  }
}

/**
 * Merge new insights into accumulated insights
 */
function mergeInsights(
  accumulated: AccumulatedInsights,
  newInsights: MessageInsights
): AccumulatedInsights {
  const merged: AccumulatedInsights = { ...accumulated }

  // Merge signals (prefer non-null values)
  if (newInsights.signals) {
    merged.signals = { ...merged.signals }
    for (const [key, value] of Object.entries(newInsights.signals)) {
      if (value !== null && value !== undefined) {
        (merged.signals as Record<string, unknown>)[key] = value
      }
    }
  }

  // Merge tone signals (average numbers, concat arrays)
  if (newInsights.tone_signals) {
    merged.tone_signals = { ...merged.tone_signals };
    for (const [key, value] of Object.entries(newInsights.tone_signals)) {
      if (value !== null && value !== undefined) {
        if (Array.isArray(value)) {
          const existing = Array.isArray((merged.tone_signals as Record<string, unknown>)[key])
            ? ((merged.tone_signals as Record<string, unknown>)[key] as string[])
            : [];
          (merged.tone_signals as Record<string, unknown>)[key] = Array.from(new Set([...(existing || []), ...value]));
        } else {
          (merged.tone_signals as Record<string, unknown>)[key] = value;
        }
      }
    }
  }

  // Merge goal signals
  if (newInsights.goal_signals) {
    merged.goal_signals = { ...merged.goal_signals, ...newInsights.goal_signals }
  }

  // Merge personality signals
  if (newInsights.personality_signals) {
    merged.personality_signals = { ...merged.personality_signals, ...newInsights.personality_signals }
  }

  // Accumulate notable quotes
  if (newInsights.notable_quotes && newInsights.notable_quotes.length > 0) {
    merged.notable_quotes = [...(merged.notable_quotes || []), ...newInsights.notable_quotes]
  }

  return merged
}

/**
 * Determine if conversation should advance to next phase
 */
function determinePhaseTransition(
  currentPhase: ConversationPhase,
  messageCount: number,
  latestInsights: MessageInsights
): { shouldAdvance: boolean; nextPhase: ConversationPhase } {
  const currentIndex = PHASE_ORDER.indexOf(currentPhase)
  const nextPhase = currentIndex < PHASE_ORDER.length - 1 
    ? PHASE_ORDER[currentIndex + 1] 
    : currentPhase

  // Simple heuristic: advance after ~4 exchanges per phase
  // or if insights indicate high confidence
  const messagesInPhase = messageCount % 8 // rough estimate
  const shouldAdvance = messagesInPhase >= 4 || 
    (latestInsights.confidence && latestInsights.confidence > 0.8)

  return { shouldAdvance: false, nextPhase } // Manual transition for now
}

export { loadConversationContext }
