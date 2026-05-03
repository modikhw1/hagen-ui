/**
 * Discernment Conversation Handler
 * 
 * Manages the dialogue between user and AI for video analysis
 * Uses GPT-4 to understand context, ask questions, and learn preferences
 */

import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export interface ConversationContext {
  sessionId: string
  videoUrl: string
  geminiAnalysis: Record<string, any>
  metadata: any
  viralKnowledge: Array<{ principle: string; category: string; explanation?: string }>
  userDirections: Array<{ statement: string; direction_type: string; applies_to: string }>
  userVocabulary: Array<{ term: string; definition: string }>
  focusAreas: Array<{ area: string; description: string; importance_weight: number }>
  messageHistory: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
}

export interface ConversationResponse {
  message: string
  suggestedActions?: Array<{
    type: 'compare' | 'drill_down' | 'add_direction' | 'add_vocabulary' | 'mark_irrelevant' | 'finalize'
    label: string
    data?: any
  }>
  internalNotes?: {
    detectedPreferences?: string[]
    suggestedFocusAreas?: string[]
    interpretations?: string[]
  }
}

/**
 * Build the system prompt for the conversation
 */
function buildSystemPrompt(context: ConversationContext): string {
  const analysisSummary = summarizeAnalysis(context.geminiAnalysis)
  
  const userPrefs = context.userDirections?.length > 0 
    ? context.userDirections.map(d => d.statement).join('; ')
    : 'None established yet'
  
  const focusAreas = context.focusAreas?.length > 0
    ? context.focusAreas.map(f => f.area).join(', ')
    : 'None established yet'

  return `You help people develop their eye for evaluating video content. Your job is to understand what THEY value - not to teach them what to value.

VIDEO ANALYSIS:
${analysisSummary}

USER'S PREFERENCES: ${userPrefs}
FOCUS AREAS: ${focusAreas}

HOW TO RESPOND:
1. Make ONE brief observation about something specific in the video
2. Ask ONE follow-up question to understand their perspective

QUESTION STYLE:
- Reference specific moments: "At 0:03 when they..."
- Ask about tradeoffs: "Would you sacrifice X to get more Y?"
- Probe vague answers: "What do you mean by 'authentic'?"
- Compare: "How does this compare to what you usually see?"

AVOID:
- Generic questions ("What did you think?")
- Being agreeable ("Great point!")
- Long responses
- Multiple questions at once

KEEP IT SHORT. One observation + one question. Under 50 words total.`
}

/**
 * Summarize analysis to avoid overwhelming the prompt
 */
function summarizeAnalysis(analysis: Record<string, any>): string {
  const parts: string[] = []
  
  if (analysis.social_dynamics?.summary) {
    parts.push(`Social Dynamics: ${analysis.social_dynamics.summary}`)
  }
  if (analysis.tonal_journey?.summary) {
    parts.push(`Tonal Arc: ${analysis.tonal_journey.summary}`)
  }
  if (analysis.persuasion_mechanics?.summary) {
    parts.push(`Persuasion: ${analysis.persuasion_mechanics.summary}`)
  }
  if (analysis.authenticity_detection?.summary) {
    parts.push(`Authenticity: ${analysis.authenticity_detection.summary}`)
  }
  if (analysis.production_craft?.summary) {
    parts.push(`Production: ${analysis.production_craft.summary}`)
  }
  
  // If no summaries, include raw keys
  if (parts.length === 0) {
    const keys = Object.keys(analysis)
    if (keys.length > 0) {
      parts.push(`Analysis completed for: ${keys.join(', ')}`)
      // Include first 500 chars of stringified analysis
      parts.push(JSON.stringify(analysis).slice(0, 500) + '...')
    } else {
      parts.push('(Analysis data not available - focus on user\'s observations)')
    }
  }
  
  return parts.join('\n')
}

/**
 * Process a user message and generate a response
 */
export async function processConversation(
  context: ConversationContext,
  userMessage: string
): Promise<ConversationResponse> {
  // Build messages array
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: buildSystemPrompt(context) },
    ...context.messageHistory,
    { role: 'user', content: userMessage }
  ]

  // Call GPT-4
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    temperature: 0.7,
    max_tokens: 500
  })

  const assistantMessage = completion.choices[0].message.content || ''

  // Analyze the exchange to extract learnings
  const learnings = await extractLearnings(context, userMessage, assistantMessage)

  // Store the learnings
  await storeLearnings(context.sessionId, learnings)

  // Determine suggested actions based on context
  const suggestedActions = determineSuggestedActions(context, userMessage, assistantMessage)

  return {
    message: assistantMessage,
    suggestedActions,
    internalNotes: learnings
  }
}

/**
 * Extract learnings from the conversation exchange
 */
async function extractLearnings(
  context: ConversationContext,
  userMessage: string,
  assistantResponse: string
): Promise<{
  detectedPreferences?: string[]
  suggestedFocusAreas?: string[]
  interpretations?: string[]
  newVocabulary?: Array<{ term: string; possibleDefinition: string }>
  redirectDetected?: { from: string; to: string }
}> {
  const analysisPrompt = `Analyze this conversation exchange to extract learning about the user's preferences:

USER SAID: "${userMessage}"
ASSISTANT RESPONDED: "${assistantResponse}"

CONTEXT: This is a conversation about a video where the user is developing their personal discernment criteria.

Extract:
1. Any preferences they expressed (likes, dislikes, what matters to them)
2. Any new terms they used that might be their vocabulary
3. Any focus areas they seem to care about
4. If they redirected a question, what did they redirect FROM and TO?

Return JSON:
{
  "detectedPreferences": ["preference statements"],
  "suggestedFocusAreas": ["areas they seem to care about"],
  "newVocabulary": [{"term": "word", "possibleDefinition": "what it might mean"}],
  "redirectDetected": {"from": "original topic", "to": "what they wanted instead"} | null,
  "interpretations": ["what we learned about how they think"]
}`

  const analysis = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: analysisPrompt }],
    temperature: 0.3,
    response_format: { type: 'json_object' }
  })

  try {
    const parsed = JSON.parse(analysis.choices[0].message.content || '{}')
    return {
      detectedPreferences: parsed.detectedPreferences || [],
      suggestedFocusAreas: parsed.suggestedFocusAreas || [],
      newVocabulary: parsed.newVocabulary || [],
      redirectDetected: parsed.redirectDetected || undefined,
      interpretations: parsed.interpretations || []
    }
  } catch {
    return {
      detectedPreferences: [],
      suggestedFocusAreas: [],
      newVocabulary: [],
      redirectDetected: undefined,
      interpretations: []
    }
  }
}

/**
 * Store learnings in the database
 */
async function storeLearnings(
  sessionId: string,
  learnings: {
    detectedPreferences?: string[]
    suggestedFocusAreas?: string[]
    newVocabulary?: Array<{ term: string; possibleDefinition: string }>
    redirectDetected?: { from: string; to: string }
  }
): Promise<void> {
  // Store new focus areas (tentatively, low weight)
  // Note: Without user_id, we just insert - duplicates will be handled by constraint
  if (learnings.suggestedFocusAreas) {
    for (const area of learnings.suggestedFocusAreas) {
      try {
        await supabase
          .from('focus_areas')
          .insert({
            area,
            description: `Detected from conversation`,
            importance_weight: 0.3, // Start low, increase with more mentions
            ai_inferred: true,
            source_session_id: sessionId,
            times_referenced: 1,
            last_referenced: new Date().toISOString()
          })
      } catch {
        // Ignore duplicates - in production would update times_referenced
      }
    }
  }

  // Note: Vocabulary should be confirmed before adding
  // Preferences should be synthesized at session end
}

/**
 * Determine suggested actions for the UI
 */
function determineSuggestedActions(
  context: ConversationContext,
  userMessage: string,
  assistantResponse: string
): ConversationResponse['suggestedActions'] {
  const actions: ConversationResponse['suggestedActions'] = []

  // Always offer to finalize after some exchanges
  if (context.messageHistory.length >= 6) {
    actions.push({
      type: 'finalize',
      label: 'Wrap up and get final assessment'
    })
  }

  // Offer comparison if they mention another video
  if (userMessage.toLowerCase().includes('other video') || 
      userMessage.toLowerCase().includes('yesterday') ||
      userMessage.toLowerCase().includes('compare')) {
    actions.push({
      type: 'compare',
      label: 'Compare with another video'
    })
  }

  // Offer to add direction if they state a preference strongly
  if (userMessage.toLowerCase().includes('always') ||
      userMessage.toLowerCase().includes('never') ||
      userMessage.toLowerCase().includes('i prefer') ||
      userMessage.toLowerCase().includes('i look for')) {
    actions.push({
      type: 'add_direction',
      label: 'Save this as a preference rule'
    })
  }

  // Offer drill-down if they mention a timestamp
  const timestampMatch = userMessage.match(/\d+:\d+|\d+ second/i)
  if (timestampMatch) {
    actions.push({
      type: 'drill_down',
      label: `Analyze that moment in detail`
    })
  }

  return actions.length > 0 ? actions : undefined
}

/**
 * Generate the initial message to start a conversation
 */
export async function generateOpeningMessage(
  context: ConversationContext
): Promise<string> {
  const hasHistory = context.focusAreas.length > 0 || context.userDirections.length > 0
  const analysisSummary = summarizeAnalysis(context.geminiAnalysis)
  
  const focusAreasList = context.focusAreas?.map(f => f.area).join(', ') || ''
  const directionsList = context.userDirections?.map(d => d.statement).join('; ') || ''

  const prompt = hasHistory
    ? `The user submitted a video. Based on what they care about (${focusAreasList}), make one observation and ask one question.

VIDEO INFO:
${analysisSummary}

Keep it under 40 words. Be specific to this video.`
    : `A user submitted their first video. Make one observation about something notable in it, then ask what drew them to this video.

VIDEO INFO:
${analysisSummary}

Keep it under 40 words. Don't be generic - reference something specific from the analysis.`

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 250
  })

  return completion.choices[0].message.content || "The video makes some specific structural choices. What drew you to analyze this one?"
}

/**
 * Generate final synthesis after conversation
 */
export async function generateFinalSynthesis(
  context: ConversationContext
): Promise<{
  summary: string
  viralityScore: {
    objective: number
    userAlignment: number
    overall: number
    confidence: 'low' | 'medium' | 'high'
  }
  keyTakeaways: string[]
  userLearnings: string[]
  verdict: 'study' | 'skip' | 'replicate' | 'adapt' | 'reference'
  verdictReasoning: string
}> {
  const synthesisPrompt = `Synthesize this entire video analysis conversation into a final assessment.

VIDEO ANALYSIS:
${JSON.stringify(context.geminiAnalysis, null, 2)}

CONVERSATION:
${context.messageHistory.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')}

USER'S KNOWN PREFERENCES:
${context.userDirections.map(d => d.statement).join('\n')}

USER'S FOCUS AREAS:
${context.focusAreas.map(f => f.area).join(', ')}

VIRAL CONTENT PRINCIPLES:
${context.viralKnowledge.map(v => `[${v.category}] ${v.principle}`).join('\n')}

Generate a final synthesis with:
1. A brief summary of what makes this video notable (2-3 sentences)
2. Virality scores:
   - Objective quality (based on craft, technique, principles): 1-10
   - User alignment (how well it matches their preferences): 1-10
   - Overall recommendation score: 1-10
   - Confidence in these scores: low/medium/high
3. 2-3 key takeaways from this video
4. What we learned about the user from this conversation
5. A verdict: study (analyze more), skip (not worth time), replicate (copy approach), adapt (modify for their use), reference (save for inspiration)
6. Brief reasoning for the verdict

Return as JSON.`

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: synthesisPrompt }],
    temperature: 0.5,
    response_format: { type: 'json_object' }
  })

  try {
    const parsed = JSON.parse(completion.choices[0].message.content || '{}')
    return {
      summary: parsed.summary || 'No summary generated',
      viralityScore: {
        objective: parsed.viralityScore?.objective ?? 5,
        userAlignment: parsed.viralityScore?.userAlignment ?? 5,
        overall: parsed.viralityScore?.overall ?? 5,
        confidence: parsed.viralityScore?.confidence || 'low'
      },
      keyTakeaways: parsed.keyTakeaways || [],
      userLearnings: parsed.userLearnings || [],
      verdict: parsed.verdict || 'reference',
      verdictReasoning: parsed.verdictReasoning || 'Assessment complete'
    }
  } catch (e) {
    console.error('Synthesis parse error:', e)
    return {
      summary: 'Unable to generate synthesis',
      viralityScore: { objective: 5, userAlignment: 5, overall: 5, confidence: 'low' },
      keyTakeaways: [],
      userLearnings: [],
      verdict: 'skip',
      verdictReasoning: 'Error in synthesis'
    }
  }
}

/**
 * Generate text for embedding from the entire session
 */
export function generateEmbeddingText(
  context: ConversationContext,
  synthesis: Awaited<ReturnType<typeof generateFinalSynthesis>>
): string {
  const parts: string[] = []

  // Video metadata
  if (context.metadata) {
    parts.push(`Platform: ${context.metadata.platform || 'unknown'}`)
    parts.push(`Author: ${context.metadata.author?.displayName || context.metadata.author?.username || 'unknown'}`)
    if (context.metadata.description) {
      parts.push(`Description: ${context.metadata.description}`)
    }
  }

  // Key analysis points
  if (context.geminiAnalysis) {
    const analysis = context.geminiAnalysis
    
    if (analysis.social_dynamics?.summary) {
      parts.push(`Social dynamics: ${analysis.social_dynamics.summary}`)
    }
    if (analysis.tonal_journey?.summary) {
      parts.push(`Tonal journey: ${analysis.tonal_journey.summary}`)
    }
    if (analysis.persuasion_mechanics?.summary) {
      parts.push(`Persuasion: ${analysis.persuasion_mechanics.summary}`)
    }
    if (analysis.authenticity_detection?.summary) {
      parts.push(`Authenticity: ${analysis.authenticity_detection.summary}`)
    }
  }

  // User's observations from conversation
  const userMessages = context.messageHistory
    .filter(m => m.role === 'user')
    .map(m => m.content)
  if (userMessages.length > 0) {
    parts.push(`User observations: ${userMessages.join(' ')}`)
  }

  // Synthesis
  parts.push(`Summary: ${synthesis.summary || 'No summary'}`)
  parts.push(`Verdict: ${synthesis.verdict || 'unknown'} - ${synthesis.verdictReasoning || ''}`)
  if (synthesis.keyTakeaways && synthesis.keyTakeaways.length > 0) {
    parts.push(`Key takeaways: ${synthesis.keyTakeaways.join('; ')}`)
  }
  if (synthesis.viralityScore) {
    parts.push(`Scores: objective=${synthesis.viralityScore.objective || 5}, alignment=${synthesis.viralityScore.userAlignment || 5}`)
  }

  return parts.join('\n')
}
