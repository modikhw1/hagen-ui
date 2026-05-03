import OpenAI from 'openai'

const apiKey = process.env.OPENAI_API_KEY

if (!apiKey) {
  throw new Error('Missing OPENAI_API_KEY environment variable')
}

export const openai = new OpenAI({
  apiKey,
})

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AnalysisResult {
  summary: string
  insights: string[]
  sentiment?: 'positive' | 'negative' | 'neutral'
}

/**
 * Analyze text using GPT-4
 */
export async function analyzeText(
  text: string,
  prompt: string = 'Analyze the following text and provide insights:'
): Promise<AnalysisResult> {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are an expert analyst. Provide structured insights in JSON format.',
        },
        {
          role: 'user',
          content: `${prompt}\n\nText: ${text}\n\nProvide response in JSON format with: summary, insights (array), sentiment.`,
        },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      throw new Error('No response from OpenAI')
    }

    return JSON.parse(content) as AnalysisResult
  } catch (error) {
    console.error('OpenAI analysis error:', error)
    throw error
  }
}

/**
 * Generate a chat completion
 */
export async function chat(messages: ChatMessage[]): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages,
      temperature: 0.7,
    })

    return completion.choices[0]?.message?.content || ''
  } catch (error) {
    console.error('OpenAI chat error:', error)
    throw error
  }
}

/**
 * Generate embeddings for semantic search
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    })

    return response.data[0].embedding
  } catch (error) {
    console.error('OpenAI embedding error:', error)
    throw error
  }
}
