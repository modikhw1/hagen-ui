/**
 * Video Context for Brand Conversations
 * 
 * Detects video links in user messages and analyzes them for brand discovery.
 * Creates minimal DB records (no Supadata metadata fetch) then uses the 
 * download → Gemini pipeline for deep analysis.
 * 
 * Updated to use Schema v1.1 via BrandAnalyzer for full signal extraction
 * including replicability, risk_level, environment_requirements, and target_audience.
 */

import { createClient } from '@supabase/supabase-js'
import { createVideoDownloader } from '../video/downloader'
import { createVideoStorageService } from '../video/storage'
import { BrandAnalyzer } from './brand-analyzer'
import type { VideoBrandAnalysis } from './brand-analysis.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

// Patterns to detect video URLs
const VIDEO_URL_PATTERNS = [
  /https?:\/\/(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+/gi,
  /https?:\/\/(?:vm\.)?tiktok\.com\/[\w]+/gi,
  /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=[\w-]+/gi,
  /https?:\/\/youtu\.be\/[\w-]+/gi,
  /https?:\/\/(?:www\.)?instagram\.com\/(?:reel|p)\/[\w-]+/gi,
]

export interface VideoAnalysisContext {
  url: string
  platform: 'tiktok' | 'youtube' | 'instagram' | 'unknown'
  videoId?: string
  analysis: {
    summary: string
    humorType?: string
    whyFunny?: string
    tone: string
    style: string
    targetAudience?: string
    conceptCore?: string
    brandRelevance: string
  }
  // Schema v1.1 signals for brand discovery
  schemaV1Signals?: {
    replicability?: {
      actorCount?: string
      setupComplexity?: string
      skillRequired?: string
      environmentDependency?: string
      equipmentNeeded?: string[]
      estimatedTime?: string
    }
    riskLevel?: {
      contentEdge?: string
      humorRisk?: string
      trendReliance?: string
      controversyPotential?: string
    }
    environmentRequirements?: {
      settingType?: string
      spaceRequirements?: string
      lightingConditions?: string
      noiseTolerance?: string
      customerVisibility?: string
    }
    targetAudience?: {
      ageRange?: { primary?: string; secondary?: string }
      incomeLevel?: string
      lifestyleTags?: string[]
      primaryOccasion?: string
      vibeAlignment?: string
    }
  }
  fromCache: boolean
}

/**
 * Extract video URLs from a message
 */
export function extractVideoUrls(message: string): string[] {
  const urls: string[] = []
  
  for (const pattern of VIDEO_URL_PATTERNS) {
    const matches = message.match(pattern)
    if (matches) {
      urls.push(...matches)
    }
  }
  
  // Deduplicate
  return [...new Set(urls)]
}

/**
 * Detect platform from URL
 */
function detectPlatform(url: string): 'tiktok' | 'youtube' | 'instagram' | 'unknown' {
  if (url.includes('tiktok.com')) return 'tiktok'
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube'
  if (url.includes('instagram.com')) return 'instagram'
  return 'unknown'
}

/**
 * Safely get nested property from any object
 */
function getDeep(obj: any, ...keys: string[]): any {
  let current = obj
  for (const key of keys) {
    if (current === null || current === undefined) return undefined
    current = current[key]
  }
  return current
}

/**
 * Extract platform video ID from URL
 */
function extractPlatformVideoId(url: string): string {
  const tiktokMatch = url.match(/video\/(\d+)/)
  if (tiktokMatch) return tiktokMatch[1]
  
  const ytMatch = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)
  if (ytMatch) return ytMatch[1]
  
  const igMatch = url.match(/(?:reel|p)\/([a-zA-Z0-9_-]+)/)
  if (igMatch) return igMatch[1]
  
  return `vid_${Date.now()}`
}

/**
 * Analyze a video using the full pipeline:
 * 1. Check if already analyzed in DB
 * 2. If not: download → upload to Gemini File API → analyze → save
 * 3. Extract brand-relevant context from analysis
 */
export async function analyzeVideoForBrandContext(
  url: string,
  conversationContext?: string
): Promise<VideoAnalysisContext | null> {
  try {
    console.log(`🎬 Analyzing video for brand context: ${url}`)
    
    const platform = detectPlatform(url)
    
    // Step 1: Check if video is already analyzed
    const { data: existingVideo } = await supabase
      .from('analyzed_videos')
      .select('id, visual_analysis')
      .eq('video_url', url)
      .single()
    
    if (existingVideo?.visual_analysis) {
      console.log(`✅ Found cached analysis for ${url}`)
      return buildContextFromAnalysis(
        url, 
        platform, 
        existingVideo.visual_analysis, 
        existingVideo.id,
        true,
        conversationContext
      )
    }
    
    // Step 2: Check if GEMINI_API_KEY is available
    if (!process.env.GEMINI_API_KEY) {
      console.log('⚠️ GEMINI_API_KEY not set - cannot analyze new videos')
      return {
        url,
        platform,
        fromCache: false,
        analysis: {
          summary: 'Video could not be analyzed (Gemini not configured)',
          tone: 'unknown',
          style: 'unknown',
          brandRelevance: 'User shared this as an example - ask them about it'
        }
      }
    }
    
    // Step 3: Create minimal video record (directly in DB, no metadata fetch)
    console.log('📝 Creating video record...')
    const platformVideoId = extractPlatformVideoId(url)
    
    const { data: newVideo, error: createError } = await supabase
      .from('analyzed_videos')
      .insert({
        video_url: url,
        video_id: platformVideoId,
        platform,
        metadata: {
          url,
          platform,
          videoId: platformVideoId,
          provider: 'minimal'
        },
        created_at: new Date().toISOString()
      })
      .select('id')
      .single()
    
    if (createError) {
      console.error('❌ Failed to create video record:', createError)
      throw new Error(`Database insert failed: ${createError.message}`)
    }
    
    const videoId = newVideo.id
    
    // Step 4: Run deep analysis (download → upload → Gemini → save)
    // Use the existing downloader and analyzer infrastructure
    console.log('📥 Downloading video...')
    const downloader = createVideoDownloader()
    const downloadResult = await downloader.downloadWithYtDlp(url)
    
    if (!downloadResult.success) {
      console.error('❌ Download failed:', downloadResult.error)
      return {
        url,
        platform,
        fromCache: false,
        analysis: {
          summary: `Video could not be downloaded: ${downloadResult.error}`,
          tone: 'unknown',
          style: 'unknown',
          brandRelevance: 'User shared this as an example - ask them what they like about it'
        }
      }
    }
    
    let analysis: VideoBrandAnalysis | null = null
    let legacyAnalysis: any = null
    
    try {
      const storage = createVideoStorageService()
      
      // Try GCS upload first for Vertex/BrandAnalyzer compatibility (preferred path)
      console.log('☁️ Uploading video...')
      let gcsUri: string | undefined
      let geminiFileUri: string | undefined
      
      const gcsResult = await storage.uploadVideo(downloadResult.filePath!, platformVideoId)
      if (gcsResult.success && gcsResult.gsUrl) {
        gcsUri = gcsResult.gsUrl
        console.log(`✅ Uploaded to GCS: ${gcsUri}`)
      } else {
        // Fall back to Gemini File API if GCS isn't configured
        console.log('📝 GCS not available, using Gemini File API...')
        const geminiResult = await storage.uploadToGeminiFileAPI(downloadResult.filePath!)
        if (geminiResult.success && geminiResult.gsUrl) {
          geminiFileUri = geminiResult.gsUrl
        } else {
          throw new Error(`Upload failed: ${geminiResult.error || gcsResult.error}`)
        }
      }
      
      // Use BrandAnalyzer for Schema v1.1 signals
      console.log('🤖 Analyzing with BrandAnalyzer (Schema v1.1)...')
      const brandAnalyzer = new BrandAnalyzer()
      
      if (brandAnalyzer.isConfigured() && gcsUri) {
        // Full Schema v1.1 analysis via Vertex
        analysis = await brandAnalyzer.analyze({
          videoUrl: url,
          videoId: platformVideoId,
          gcsUri
        })
        console.log('✅ BrandAnalyzer analysis complete (Schema v1.1)')
      } else {
        // BrandAnalyzer returns placeholder if not configured
        analysis = await brandAnalyzer.analyze({
          videoUrl: url,
          videoId: platformVideoId,
          geminiFileUri
        })
        console.log('⚠️ BrandAnalyzer returned placeholder (Vertex not configured or no GCS URI)')
      }
      
      // Save analysis to DB
      await supabase
        .from('analyzed_videos')
        .update({
          visual_analysis: analysis,
          analyzed_at: new Date().toISOString()
        })
        .eq('id', videoId)
      
    } finally {
      // Cleanup downloaded file
      try {
        await downloader.cleanup(downloadResult.filePath!)
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    
    // Step 5: Build context from analysis
    const context = buildContextFromAnalysis(
      url, 
      platform, 
      analysis, 
      videoId,
      false,
      conversationContext
    )
    
    console.log(`✅ Video context extracted: ${context.analysis.tone} tone, ${context.analysis.style} style`)
    return context
    
  } catch (error) {
    console.error(`❌ Failed to analyze video: ${error}`)
    return {
      url,
      platform: detectPlatform(url),
      fromCache: false,
      analysis: {
        summary: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        tone: 'unknown',
        style: 'unknown',
        brandRelevance: 'User shared this as an example - ask them what they like about it'
      }
    }
  }
}

/**
 * Build VideoAnalysisContext from stored/computed analysis
 * Handles both Schema v1.1 (from BrandAnalyzer) and legacy formats
 */
function buildContextFromAnalysis(
  url: string,
  platform: 'tiktok' | 'youtube' | 'instagram' | 'unknown',
  analysis: any,
  videoId: string | undefined,
  fromCache: boolean,
  conversationContext?: string
): VideoAnalysisContext {
  // Detect if this is Schema v1.1 format from BrandAnalyzer
  const isSchemaV1 = analysis?.schema_version === 1 || analysis?.raw_output?.schema_version === 1
  
  if (isSchemaV1) {
    return buildContextFromSchemaV1(url, platform, analysis, videoId, fromCache, conversationContext)
  }
  
  // Legacy format handling
  const raw = analysis.rawResponse || analysis
  
  return {
    url,
    platform,
    videoId,
    fromCache,
    analysis: {
      summary: getDeep(raw, 'content', 'summary') || 
               getDeep(raw, 'visual', 'summary') || 
               getDeep(analysis, 'content', 'themes')?.join(', ') ||
               'Video analyzed',
      humorType: getDeep(raw, 'humor_analysis', 'primary_type') || 
                 getDeep(raw, 'humor', 'primaryType'),
      whyFunny: getDeep(raw, 'humor_analysis', 'why_funny') ||
                getDeep(raw, 'humor', 'whyFunny'),
      tone: extractTone(raw, analysis),
      style: getDeep(raw, 'content', 'format') || 
             getDeep(raw, 'content', 'style') ||
             analysis.technical?.editingStyle ||
             'standard',
      targetAudience: getDeep(raw, 'content', 'targetAudience') ||
                      getDeep(raw, 'content', 'target_audience'),
      conceptCore: getDeep(raw, 'script', 'conceptCore') ||
                   getDeep(raw, 'script', 'concept_core'),
      brandRelevance: generateBrandRelevance(raw, analysis, conversationContext)
    }
  }
}

/**
 * Build context from Schema v1.1 analysis (BrandAnalyzer output)
 * Extracts replicability, risk_level, environment_requirements, target_audience
 */
function buildContextFromSchemaV1(
  url: string,
  platform: 'tiktok' | 'youtube' | 'instagram' | 'unknown',
  analysis: any,
  videoId: string | undefined,
  fromCache: boolean,
  conversationContext?: string
): VideoAnalysisContext {
  // Schema v1.1 has raw_output.signals structure
  const rawOutput = analysis.raw_output || analysis
  const signals = rawOutput.signals || {}
  
  // Extract v1.1 specific signals
  const replicability = signals.replicability
  const riskLevel = signals.risk_level
  const envReqs = signals.environment_requirements
  const targetAudience = signals.target_audience
  const personality = signals.personality
  const statement = signals.statement
  const execution = signals.execution
  const humor = signals.humor
  
  // Build tone from personality signals
  const toneIndicators: string[] = []
  if (personality?.energy_1_10) {
    toneIndicators.push(personality.energy_1_10 > 7 ? 'high energy' : personality.energy_1_10 < 4 ? 'calm' : 'moderate energy')
  }
  if (personality?.warmth_1_10) {
    toneIndicators.push(personality.warmth_1_10 > 7 ? 'warm' : personality.warmth_1_10 < 4 ? 'cool' : '')
  }
  if (humor?.present) {
    toneIndicators.push(`${humor.humor_types?.join('/') || 'humor'}`)
  }
  const tone = toneIndicators.filter(t => t).join(', ') || 'neutral'
  
  // Build style from execution signals
  const styleIndicators: string[] = []
  if (execution?.production_investment_1_10) {
    styleIndicators.push(execution.production_investment_1_10 > 7 ? 'high production' : execution.production_investment_1_10 < 4 ? 'raw/casual' : 'moderate production')
  }
  if (execution?.has_repeatable_format && execution?.format_name_if_any) {
    styleIndicators.push(execution.format_name_if_any)
  }
  const style = styleIndicators.join(', ') || 'standard'
  
  // Build summary from statement
  const summary = statement?.primary_intent 
    ? `${statement.primary_intent} content` + (statement.apparent_audience ? ` for ${statement.apparent_audience}` : '')
    : 'Video analyzed'
  
  return {
    url,
    platform,
    videoId,
    fromCache,
    analysis: {
      summary,
      humorType: humor?.humor_types?.join(', '),
      whyFunny: humor?.target ? `humor targeting: ${humor.target}` : undefined,
      tone,
      style,
      targetAudience: targetAudience?.lifestyle_tags?.join(', ') || statement?.apparent_audience,
      conceptCore: execution?.format_name_if_any,
      brandRelevance: generateBrandRelevanceV1(signals, conversationContext)
    },
    // Include full Schema v1.1 signals for brand discovery
    schemaV1Signals: {
      replicability: replicability ? {
        actorCount: replicability.actor_count ?? undefined,
        setupComplexity: replicability.setup_complexity ?? undefined,
        skillRequired: replicability.skill_required ?? undefined,
        environmentDependency: replicability.environment_dependency ?? undefined,
        equipmentNeeded: replicability.equipment_needed,
        estimatedTime: replicability.estimated_time ?? undefined
      } : undefined,
      riskLevel: riskLevel ? {
        contentEdge: riskLevel.content_edge ?? undefined,
        humorRisk: riskLevel.humor_risk ?? undefined,
        trendReliance: riskLevel.trend_reliance ?? undefined,
        controversyPotential: riskLevel.controversy_potential ?? undefined
      } : undefined,
      environmentRequirements: envReqs ? {
        settingType: envReqs.setting_type ?? undefined,
        spaceRequirements: envReqs.space_requirements ?? undefined,
        lightingConditions: envReqs.lighting_conditions ?? undefined,
        noiseTolerance: envReqs.noise_tolerance ?? undefined,
        customerVisibility: envReqs.customer_visibility ?? undefined
      } : undefined,
      targetAudience: targetAudience ? {
        ageRange: targetAudience.age_range,
        incomeLevel: targetAudience.income_level ?? undefined,
        lifestyleTags: targetAudience.lifestyle_tags,
        primaryOccasion: targetAudience.primary_occasion ?? undefined,
        vibeAlignment: targetAudience.vibe_alignment ?? undefined
      } : undefined
    }
  }
}

/**
 * Generate brand relevance summary from Schema v1.1 signals
 */
function generateBrandRelevanceV1(signals: any, context?: string): string {
  const parts: string[] = []
  
  // Replicability assessment
  const rep = signals.replicability
  if (rep) {
    if (rep.skill_required === 'anyone' || rep.skill_required === 'basic_editing') {
      parts.push('easily replicable')
    } else if (rep.skill_required === 'professional') {
      parts.push('requires professional skills')
    }
    if (rep.actor_count) parts.push(`${rep.actor_count} performer(s)`)
    if (rep.setup_complexity) parts.push(`${rep.setup_complexity} setup`)
  }
  
  // Risk assessment
  const risk = signals.risk_level
  if (risk?.content_edge) {
    parts.push(`${risk.content_edge} content`)
  }
  
  // Target audience
  const audience = signals.target_audience
  if (audience?.lifestyle_tags?.length) {
    parts.push(`appeals to: ${audience.lifestyle_tags.slice(0, 3).join(', ')}`)
  }
  if (audience?.vibe_alignment) {
    parts.push(`${audience.vibe_alignment} vibe`)
  }
  
  // Environment requirements
  const env = signals.environment_requirements
  if (env?.setting_type) {
    parts.push(`requires ${env.setting_type} setting`)
  }
  
  return parts.length > 0 ? parts.join('; ') : 'General video reference'
}

/**
 * Extract tone descriptors from analysis
 */
function extractTone(raw: any, analysis: any): string {
  const toneIndicators: string[] = []
  
  // From raw response
  if (getDeep(raw, 'content', 'emotionalTone')) {
    toneIndicators.push(raw.content.emotionalTone)
  }
  if (getDeep(raw, 'audio', 'voiceoverTone')) {
    toneIndicators.push(raw.audio.voiceoverTone)
  }
  if (getDeep(raw, 'humor_analysis', 'primary_type')) {
    toneIndicators.push(`${raw.humor_analysis.primary_type} humor`)
  }
  if (getDeep(raw, 'audio', 'energyLevel')) {
    toneIndicators.push(`${raw.audio.energyLevel} energy`)
  }
  
  // From typed analysis
  if (analysis.content?.emotions?.length) {
    toneIndicators.push(...analysis.content.emotions.slice(0, 2))
  }
  if (analysis.audio?.voiceTone) {
    toneIndicators.push(analysis.audio.voiceTone)
  }
  
  return toneIndicators.length > 0 
    ? toneIndicators.join(', ') 
    : 'neutral'
}

/**
 * Generate a brand-relevance summary for Claude
 */
function generateBrandRelevance(raw: any, analysis: any, context?: string): string {
  const parts: string[] = []
  
  // Production style
  const quality = getDeep(raw, 'visual', 'overallQuality') || analysis.visual?.overallQuality
  if (quality) {
    if (quality >= 8 || quality >= 0.8) parts.push('high production value')
    else if (quality >= 5 || quality >= 0.5) parts.push('moderate production quality')
    else parts.push('raw/unpolished aesthetic')
  }
  
  // Content approach
  const concept = getDeep(raw, 'script', 'conceptCore') || getDeep(raw, 'script', 'concept_core')
  if (concept) {
    parts.push(`concept: ${concept}`)
  }
  
  // Humor/tone
  const whyFunny = getDeep(raw, 'humor_analysis', 'why_funny') || getDeep(raw, 'humor', 'whyFunny')
  if (whyFunny) {
    parts.push(`humor works because: ${whyFunny}`)
  }
  
  // Audience fit
  const audience = getDeep(raw, 'content', 'targetAudience') || getDeep(raw, 'content', 'target_audience')
  if (audience) {
    parts.push(`appeals to: ${audience}`)
  }
  
  // Themes
  if (analysis.content?.themes?.length) {
    parts.push(`themes: ${analysis.content.themes.slice(0, 3).join(', ')}`)
  }
  
  return parts.length > 0 
    ? parts.join('; ')
    : 'General video reference'
}

/**
 * Format video analysis for injection into Claude conversation
 * Enhanced to include Schema v1.1 operational signals when available
 */
export function formatVideoContextForPrompt(contexts: VideoAnalysisContext[]): string {
  if (contexts.length === 0) return ''
  
  const formatted = contexts.map((ctx, i) => {
    const lines = [
      `[VIDEO ${i + 1}: ${ctx.platform.toUpperCase()}]`,
      `URL: ${ctx.url}`,
      `Tone: ${ctx.analysis.tone}`,
      `Style: ${ctx.analysis.style}`,
    ]
    
    if (ctx.analysis.humorType) {
      lines.push(`Humor: ${ctx.analysis.humorType}`)
    }
    if (ctx.analysis.whyFunny) {
      lines.push(`Why it works: ${ctx.analysis.whyFunny}`)
    }
    if (ctx.analysis.conceptCore) {
      lines.push(`Replicable concept: ${ctx.analysis.conceptCore}`)
    }
    if (ctx.analysis.targetAudience) {
      lines.push(`Target audience: ${ctx.analysis.targetAudience}`)
    }
    lines.push(`Brand relevance: ${ctx.analysis.brandRelevance}`)
    
    // Include Schema v1.1 signals for brand discovery (key differentiator per Q7.5)
    if (ctx.schemaV1Signals) {
      lines.push('')
      lines.push('--- OPERATIONAL SIGNALS (Schema v1.1) ---')
      
      const rep = ctx.schemaV1Signals.replicability
      if (rep) {
        const repParts: string[] = []
        if (rep.actorCount) repParts.push(`${rep.actorCount}`)
        if (rep.setupComplexity) repParts.push(`${rep.setupComplexity}`)
        if (rep.skillRequired) repParts.push(`skill: ${rep.skillRequired}`)
        if (rep.estimatedTime) repParts.push(`time: ${rep.estimatedTime}`)
        if (repParts.length) lines.push(`Replicability: ${repParts.join(', ')}`)
        if (rep.equipmentNeeded?.length) {
          lines.push(`Equipment needed: ${rep.equipmentNeeded.join(', ')}`)
        }
      }
      
      const env = ctx.schemaV1Signals.environmentRequirements
      if (env) {
        const envParts: string[] = []
        if (env.settingType) envParts.push(env.settingType)
        if (env.spaceRequirements) envParts.push(`${env.spaceRequirements} space`)
        if (env.customerVisibility) envParts.push(`customers: ${env.customerVisibility}`)
        if (envParts.length) lines.push(`Environment: ${envParts.join(', ')}`)
      }
      
      const risk = ctx.schemaV1Signals.riskLevel
      if (risk) {
        const riskParts: string[] = []
        if (risk.contentEdge) riskParts.push(risk.contentEdge)
        if (risk.humorRisk) riskParts.push(`humor: ${risk.humorRisk}`)
        if (risk.trendReliance) riskParts.push(risk.trendReliance)
        if (riskParts.length) lines.push(`Risk level: ${riskParts.join(', ')}`)
      }
      
      const audience = ctx.schemaV1Signals.targetAudience
      if (audience) {
        if (audience.ageRange?.primary) {
          lines.push(`Age target: ${audience.ageRange.primary}${audience.ageRange.secondary ? ` + ${audience.ageRange.secondary}` : ''}`)
        }
        if (audience.lifestyleTags?.length) {
          lines.push(`Lifestyle: ${audience.lifestyleTags.join(', ')}`)
        }
        if (audience.vibeAlignment) {
          lines.push(`Vibe: ${audience.vibeAlignment}`)
        }
      }
    }
    
    return lines.join('\n')
  }).join('\n\n')
  
  return `
=== VIDEO REFERENCES SHARED BY USER ===
The user shared these videos as examples of content they like or relate to.
Use this to understand their brand preferences concretely.

${formatted}

Connect these examples to your understanding of their brand. 
Ask clarifying questions like "Is this the energy level you're going for?" or
"This video uses [technique] - is that something you'd want for your brand?"
For operational constraints, ask "Do you have the team/equipment to make content like this?"
===
`
}
