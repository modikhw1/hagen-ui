/**
 * Service Registry - Centralized dependency injection
 * 
 * This allows us to swap implementations easily:
 * - registry.setVideoAnalyzer(new ClaudeAnalyzer()) // Switch from Gemini to Claude
 * - registry.setMetadataProvider(new CustomProvider()) // Switch from Supadata
 */

import type {
  VideoAnalysisProvider,
  MetadataProvider,
  EmbeddingProvider,
  MetricsCalculator
} from './types'

import { createGeminiAnalyzer } from './video/gemini'
import { createSupadataProvider } from './metadata/supadata'
import { createOpenAIEmbeddings } from './embeddings/openai'
import { createMetricsCalculator } from './metrics/calculator'

class ServiceRegistry {
  private videoAnalyzer?: VideoAnalysisProvider
  private metadataProvider?: MetadataProvider
  private embeddingProvider?: EmbeddingProvider
  private metricsCalculator?: MetricsCalculator

  // Video Analyzer
  setVideoAnalyzer(analyzer: VideoAnalysisProvider) {
    this.videoAnalyzer = analyzer
    console.log(`📹 Video analyzer set: ${analyzer.name}`)
  }

  getVideoAnalyzer(): VideoAnalysisProvider {
    if (!this.videoAnalyzer) {
      throw new Error('Video analyzer not configured. Call setVideoAnalyzer() first.')
    }
    return this.videoAnalyzer
  }

  // Metadata Provider
  setMetadataProvider(provider: MetadataProvider) {
    this.metadataProvider = provider
    console.log(`📊 Metadata provider set: ${provider.name}`)
  }

  getMetadataProvider(): MetadataProvider {
    if (!this.metadataProvider) {
      throw new Error('Metadata provider not configured. Call setMetadataProvider() first.')
    }
    return this.metadataProvider
  }

  // Embedding Provider
  setEmbeddingProvider(provider: EmbeddingProvider) {
    this.embeddingProvider = provider
    console.log(`🔢 Embedding provider set: ${provider.name} (${provider.dimensions}D)`)
  }

  getEmbeddingProvider(): EmbeddingProvider {
    if (!this.embeddingProvider) {
      throw new Error('Embedding provider not configured. Call setEmbeddingProvider() first.')
    }
    return this.embeddingProvider
  }

  // Metrics Calculator
  setMetricsCalculator(calculator: MetricsCalculator) {
    this.metricsCalculator = calculator
    console.log(`📈 Metrics calculator set: ${calculator.name}`)
  }

  getMetricsCalculator(): MetricsCalculator {
    if (!this.metricsCalculator) {
      throw new Error('Metrics calculator not configured. Call setMetricsCalculator() first.')
    }
    return this.metricsCalculator
  }

  // Initialize with defaults
  async initializeDefaults() {
    console.log('🚀 Initializing service registry...')

    // Gemini video analyzer
    if (process.env.GEMINI_API_KEY) {
      try {
        this.setVideoAnalyzer(createGeminiAnalyzer())
      } catch (e) {
        console.warn('⚠️  Could not initialize Gemini analyzer:', e)
      }
    }

    // Supadata metadata
    if (process.env.SUPADATA_API_KEY) {
      try {
        this.setMetadataProvider(createSupadataProvider())
      } catch (e) {
        console.warn('⚠️  Could not initialize Supadata provider:', e)
      }
    }

    // OpenAI embeddings
    if (process.env.OPENAI_API_KEY) {
      try {
        const model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'
        this.setEmbeddingProvider(createOpenAIEmbeddings(undefined, model))
      } catch (e) {
        console.warn('⚠️  Could not initialize OpenAI embeddings:', e)
      }
    }

    // Metrics calculator (always available)
    this.setMetricsCalculator(createMetricsCalculator())

    console.log('✅ Service registry initialized')
  }

  // Check which services are available
  getAvailableServices() {
    return {
      videoAnalyzer: !!this.videoAnalyzer,
      metadataProvider: !!this.metadataProvider,
      embeddingProvider: !!this.embeddingProvider,
      metricsCalculator: !!this.metricsCalculator
    }
  }
}

// Singleton instance
export const serviceRegistry = new ServiceRegistry()

// Auto-initialize in API routes
if (typeof window === 'undefined') {
  serviceRegistry.initializeDefaults().catch(console.error)
}
