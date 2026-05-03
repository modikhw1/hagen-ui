import OpenAI from 'openai'
import type { EmbeddingProvider } from '../types'

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  name = 'openai'
  model = 'text-embedding-3-small'
  dimensions = 1536
  
  private client: OpenAI

  constructor(apiKey: string, model?: string) {
    this.client = new OpenAI({ apiKey })
    if (model) {
      this.model = model
      // Update dimensions based on model
      if (model === 'text-embedding-3-small') this.dimensions = 1536
      if (model === 'text-embedding-ada-002') this.dimensions = 1536
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: text,
        encoding_format: 'float'
      })

      return response.data[0].embedding
    } catch (error) {
      console.error('OpenAI embedding generation failed:', error)
      throw error
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: texts,
        encoding_format: 'float'
      })

      return response.data.map(item => item.embedding)
    } catch (error) {
      console.error('OpenAI batch embedding generation failed:', error)
      throw error
    }
  }

  /**
   * Prepare text for embedding by combining all relevant data
   * This is where we combine metadata + analysis + ratings into one string
   */
  prepareTextForEmbedding(data: {
    metadata?: any
    analysis?: any
    userRatings?: Record<string, any>
    userTags?: string[]
    computedMetrics?: Record<string, number>
  }): string {
    const parts: string[] = []

    // Metadata
    if (data.metadata) {
      parts.push(`Title: ${data.metadata.title || 'N/A'}`)
      parts.push(`Description: ${data.metadata.description || 'N/A'}`)
      parts.push(`Platform: ${data.metadata.platform}`)
      parts.push(`Author: ${data.metadata.author?.displayName || 'N/A'}`)
      if (data.metadata.tags?.length > 0) {
        parts.push(`Tags: ${data.metadata.tags.join(', ')}`)
      }
    }

    // Visual analysis
    if (data.analysis?.visual) {
      const v = data.analysis.visual
      parts.push(`Visual Style: ${v.aestheticStyle || 'N/A'}`)
      parts.push(`Lighting: ${v.lighting || 'N/A'}`)
      parts.push(`Color Palette: ${v.colorPalette?.join(', ') || 'N/A'}`)
      parts.push(`Composition: ${v.composition || 'N/A'}`)
    }

    // Audio analysis
    if (data.analysis?.audio) {
      const a = data.analysis.audio
      parts.push(`Music Genre: ${a.musicGenre || 'N/A'}`)
      parts.push(`Voice Tone: ${a.voiceTone || 'N/A'}`)
    }

    // Content analysis
    if (data.analysis?.content) {
      const c = data.analysis.content
      parts.push(`Pacing: ${c.pacing || 'N/A'}`)
      parts.push(`Emotions: ${c.emotions?.join(', ') || 'N/A'}`)
      parts.push(`Themes: ${c.themes?.join(', ') || 'N/A'}`)
      if (c.hooks?.length > 0) {
        parts.push(`Hook Strength: ${c.hooks[0].strength || 0}`)
      }
    }

    // User ratings (YOUR subjective analysis)
    if (data.userRatings && Object.keys(data.userRatings).length > 0) {
      parts.push(`User Ratings:`)
      Object.entries(data.userRatings).forEach(([key, value]) => {
        parts.push(`  ${key}: ${value}`)
      })
    }

    // User tags
    if (data.userTags && data.userTags.length > 0) {
      parts.push(`User Tags: ${data.userTags.join(', ')}`)
    }

    // Computed metrics
    if (data.computedMetrics && Object.keys(data.computedMetrics).length > 0) {
      parts.push(`Metrics:`)
      Object.entries(data.computedMetrics).forEach(([key, value]) => {
        parts.push(`  ${key}: ${value.toFixed(2)}`)
      })
    }

    return parts.join('\n')
  }
}

export function createOpenAIEmbeddings(apiKey?: string, model?: string): OpenAIEmbeddingProvider {
  const key = apiKey || process.env.OPENAI_API_KEY
  if (!key) {
    throw new Error('OpenAI API key not provided')
  }
  return new OpenAIEmbeddingProvider(key, model)
}

/**
 * Simple function to generate a single embedding
 * Uses a singleton provider instance
 */
let embeddingProvider: OpenAIEmbeddingProvider | null = null

export async function generateEmbedding(text: string): Promise<number[]> {
  if (!embeddingProvider) {
    embeddingProvider = createOpenAIEmbeddings()
  }
  return embeddingProvider.generateEmbedding(text)
}
