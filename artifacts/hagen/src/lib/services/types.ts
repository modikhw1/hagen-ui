/**
 * Service Layer Types
 * 
 * These interfaces define contracts that any implementation must follow.
 * This allows us to swap out providers (Gemini→Claude, Supadata→Different API)
 * without changing application code.
 */

// Video Analysis Provider Interface
export interface VideoAnalysisProvider {
  name: string
  analyzeVideo(url: string, options?: VideoAnalysisOptions): Promise<VideoAnalysis>
}

export interface VideoAnalysisOptions {
  includeAudio?: boolean
  includeVisual?: boolean
  includeText?: boolean
  detailLevel?: 'basic' | 'detailed' | 'comprehensive'
  // Learning context options
  learningContext?: string           // Pre-built few-shot prompt from RAG
  videoMetadata?: {                  // Metadata for RAG retrieval
    transcript?: string
    title?: string
    description?: string
    hashtags?: string[]
    industry?: string
    contentFormat?: string
    existingAnalysis?: unknown       // Prior analysis (for re-analysis with learning)
  }
  useLearning?: boolean              // Whether to fetch learning examples (default: true)
  evaluateQuality?: boolean          // Whether to run LLM judge after analysis
  humanBaseline?: string             // Human correction for quality evaluation
}

export interface VideoAnalysis {
  provider: string
  analyzedAt: string
  
  // These interfaces are flexible to support different analysis providers
  // Each provider may return different fields
  visual?: {
    scenes?: Scene[]
    colorPalette?: string[]
    lighting?: string
    composition?: string
    aestheticStyle?: string
    overallQuality?: number
    // Gemini-specific fields
    hookStrength?: number
    hookDescription?: string
    mainElements?: string[]
    colorDiversity?: number
    transitions?: string[]
    textOverlays?: string[]
    visualHierarchy?: string
    compositionQuality?: number
    brandingElements?: string[]
    summary?: string
    [key: string]: unknown  // Allow additional provider-specific fields
  }
  
  audio?: {
    musicGenre?: string
    musicEnergy?: number
    voiceTone?: string
    soundEffects?: string[]
    audioQuality?: number
    // Gemini-specific fields
    quality?: number
    musicType?: string
    hasVoiceover?: boolean
    voiceoverQuality?: number | null
    voiceoverTone?: string
    energyLevel?: string
    audioEnergy?: number
    audioVisualSync?: number
    audioMix?: string
    [key: string]: unknown  // Allow additional provider-specific fields
  }
  
  content?: {
    pacing?: string
    emotions?: string[]
    themes?: string[]
    hooks?: Hook[]
    callToAction?: string
    // Gemini-specific fields
    topic?: string
    style?: string
    format?: string
    duration?: number
    keyMessage?: string
    narrativeStructure?: string
    callsToAction?: string[]
    [key: string]: unknown  // Allow additional provider-specific fields
  }
  
  technical?: {
    duration?: number
    resolution?: string
    fps?: number
    editingStyle?: string
    cutFrequency?: number
    // Gemini-specific fields
    pacing?: string
    [key: string]: unknown  // Allow additional provider-specific fields
  }
  
  // Gemini comprehensive analysis fields
  script?: {
    transcript?: string
    [key: string]: unknown
  }
  humor?: {
    type?: string
    interpretation?: string
    [key: string]: unknown
  }
  engagement?: {
    [key: string]: unknown
  }
  production?: {
    [key: string]: unknown
  }
  trends?: {
    trendingElements?: string[]
    trendAlignment?: number
    timelessness?: number
    [key: string]: unknown
  }
  scenes?: {
    sceneBreakdown?: unknown[]
    editAsPunchline?: boolean
    editPunchlineExplanation?: string
    visualNarrativeSync?: number
    misdirectionTechnique?: string
    [key: string]: unknown
  }
  
  // Quality evaluation scores (from LLM judge)
  qualityScore?: {
    mechanism_match: number      // 0-100: Does analysis identify correct humor mechanism?
    key_insight_captured: number // 0-100: Does it capture the human's main insight?
    error_avoided: number        // 0-100: Does it avoid previous errors?
    depth_of_analysis: number    // 0-100: How deep/nuanced is the analysis?
    overall: number              // 0-100: Overall alignment with human understanding
    explanation: string          // Brief explanation of the score
    evaluated_at?: string
  }
  
  // Raw response from provider (for debugging/re-processing)
  rawResponse?: unknown
}

export interface Scene {
  timestamp: number
  duration: number
  description: string
  objects?: string[]
  actions?: string[]
  emotions?: string[]
}

export interface Hook {
  type: 'visual' | 'verbal' | 'text' | 'action'
  timestamp: number
  description: string
  strength: number // 0-1
}

// Metadata Provider Interface
export interface MetadataProvider {
  name: string
  fetchMetadata(url: string): Promise<VideoMetadata>
}

export interface VideoMetadata {
  provider: string
  platform: string
  videoId: string
  url: string
  
  title?: string
  description?: string
  
  author: {
    username: string
    displayName: string
    avatarUrl?: string
    verified?: boolean
    followerCount?: number
  }
  
  stats: {
    views?: number
    likes?: number
    comments?: number
    shares?: number
    saves?: number
  }
  
  media: {
    type: 'video' | 'image' | 'carousel'
    duration?: number
    thumbnailUrl?: string
  }
  
  tags?: string[]
  createdAt: string
  
  // Platform-specific data
  additionalData?: Record<string, unknown>
  
  // Raw response from provider
  rawResponse?: unknown
}

// Embedding Provider Interface
export interface EmbeddingProvider {
  name: string
  model: string
  dimensions: number
  generateEmbedding(text: string): Promise<number[]>
  generateEmbeddings(texts: string[]): Promise<number[][]>
  prepareTextForEmbedding(data: {
    metadata?: any
    analysis?: any
    userRatings?: Record<string, any>
    userTags?: string[]
    computedMetrics?: Record<string, number>
  }): string
}

// Metrics Calculator Interface
export interface MetricsCalculator {
  name: string
  calculateMetrics(video: {
    metadata: VideoMetadata
    analysis?: VideoAnalysis
  }): Record<string, number>
}
