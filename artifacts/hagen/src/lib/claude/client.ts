/**
 * Claude API Client
 * 
 * Anthropic Claude integration for brand profiling conversations.
 * Claude's conversational style is ideal for nuanced brand discovery dialogues.
 */

import Anthropic from '@anthropic-ai/sdk'

// Initialize the Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!
})

export const CLAUDE_MODELS = {
  // Sonnet for conversational brand profiling - good balance of quality and speed
  CONVERSATION: 'claude-sonnet-4-20250514',
  // Haiku for quick extraction tasks
  EXTRACTION: 'claude-sonnet-4-20250514'
} as const

export interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ClaudeResponse {
  content: string
  stopReason: string | null
  usage: {
    inputTokens: number
    outputTokens: number
  }
}

/**
 * Send a message to Claude with conversation history
 */
export async function chat(
  systemPrompt: string,
  messages: ClaudeMessage[],
  options: {
    model?: string
    maxTokens?: number
    temperature?: number
  } = {}
): Promise<ClaudeResponse> {
  const {
    model = CLAUDE_MODELS.CONVERSATION,
    maxTokens = 1024,
    temperature = 0.7
  } = options

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    })

    // Extract text content from response
    const textContent = response.content.find(block => block.type === 'text')
    const content = textContent?.type === 'text' ? textContent.text : ''

    return {
      content,
      stopReason: response.stop_reason,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens
      }
    }
  } catch (error) {
    console.error('Claude API error:', error)
    throw error
  }
}

/**
 * Extract structured data from text using Claude
 * Returns both the extraction and raw response
 */
export async function extractStructured<T>(
  systemPrompt: string,
  userMessage: string,
  options: {
    model?: string
    maxTokens?: number
  } = {}
): Promise<{ data: T; raw: string }> {
  const {
    model = CLAUDE_MODELS.EXTRACTION,
    maxTokens = 2048
  } = options

  const response = await chat(
    systemPrompt,
    [{ role: 'user', content: userMessage }],
    { model, maxTokens, temperature: 0.3 } // Lower temp for extraction
  )

  // Try to parse JSON from response
  try {
    // Look for JSON block in response
    const jsonMatch = response.content.match(/```json\n?([\s\S]*?)\n?```/)
    if (jsonMatch) {
      return {
        data: JSON.parse(jsonMatch[1]) as T,
        raw: response.content
      }
    }

    // Try parsing the whole response as JSON
    return {
      data: JSON.parse(response.content) as T,
      raw: response.content
    }
  } catch {
    // If parsing fails, return empty object
    console.warn('Failed to parse structured response:', response.content)
    return {
      data: {} as T,
      raw: response.content
    }
  }
}

/**
 * Generate a conversational response with simultaneous insight extraction
 * This is the core pattern for brand profiling - dual output
 */
export async function chatWithExtraction<T>(
  systemPrompt: string,
  messages: ClaudeMessage[],
  extractionInstructions: string,
  options: {
    model?: string
    maxTokens?: number
  } = {}
): Promise<{
  response: string
  extraction: T
  usage: { inputTokens: number; outputTokens: number }
}> {
  const {
    model = CLAUDE_MODELS.CONVERSATION,
    maxTokens = 2048
  } = options

  // Augment system prompt to request dual output
  const augmentedSystem = `${systemPrompt}

IMPORTANT: After your conversational response, you MUST output a JSON block with extracted insights.

${extractionInstructions}

Format your response as:
[Your conversational response here]

\`\`\`json
{
  // extracted data here
}
\`\`\``

  const response = await chat(augmentedSystem, messages, { model, maxTokens, temperature: 0.7 })

  // Split response into conversational part and JSON
  const jsonMatch = response.content.match(/```json\n?([\s\S]*?)\n?```/)
  
  let conversationalResponse = response.content
  let extraction = {} as T

  if (jsonMatch) {
    // Remove JSON block from conversational response
    conversationalResponse = response.content.replace(/```json\n?[\s\S]*?\n?```/, '').trim()
    
    try {
      extraction = JSON.parse(jsonMatch[1]) as T
    } catch {
      console.warn('Failed to parse extraction JSON')
    }
  }

  return {
    response: conversationalResponse,
    extraction,
    usage: response.usage
  }
}

export { anthropic }
