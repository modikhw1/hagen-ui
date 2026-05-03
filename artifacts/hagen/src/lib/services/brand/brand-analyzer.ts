/**
 * Brand Analysis with Gemini Vertex
 * 
 * PLACEHOLDER - Currently returns empty analysis
 * 
 * This service will eventually:
 * 1. Analyze videos for brand signals using Gemini
 * 2. Extract personality traits, statement context, etc.
 * 3. Be trained with human feedback to improve accuracy
 * 
 * Development phases:
 * 1. [Current] Empty placeholder - humans provide all interpretation
 * 2. Extract basic signals (energy, formality, etc.)
 * 3. Full brand signal extraction with training data
 * 4. Integration with existing humor analysis for cross-reference
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import type { VideoBrandAnalysis, VideoBrandSignals } from './brand-analysis.types'
import { createVertexTuningService } from '../vertex'
import { parseVideoBrandObservationV1, type VideoBrandObservationV1 } from './schema-v1'

const SCHEMA_VERSION = 1

/**
 * Placeholder brand analyzer
 * Currently returns empty analysis - ready for Gemini integration
 */
export class BrandAnalyzer {
  private model: string
  private apiKey: string | null
  private vertexProjectId: string | null
  
  constructor() {
    this.model = 'gemini-2.0-flash-vertex'
    this.apiKey = process.env.GEMINI_API_KEY || null
    this.vertexProjectId = process.env.GOOGLE_CLOUD_PROJECT_ID || null
  }
  
  /**
   * Check if analyzer is configured
   */
  isConfigured(): boolean {
    // Brand analysis can use either Vertex (GCS URI) or Gemini API (File API URI)
    return !!this.vertexProjectId || !!this.apiKey
  }
  
  /**
   * Analyze a video for brand signals
   * 
   * Supports two modes:
   * 1. Vertex AI with GCS URI (gs://...) - preferred for training
   * 2. Gemini API with File API URI (https://...) - fallback for analysis
   */
  async analyze(input: {
    videoUrl?: string
    videoId?: string
    gcsUri?: string
    geminiFileUri?: string
  }): Promise<VideoBrandAnalysis> {
    const analyzedAt = new Date().toISOString()

    // Determine which API to use based on available URIs
    const hasGcsUri = !!input.gcsUri
    const hasGeminiFileUri = !!input.geminiFileUri
    const canUseVertex = !!this.vertexProjectId && hasGcsUri
    const canUseGeminiApi = !!this.apiKey && hasGeminiFileUri

    console.log('🔍 BrandAnalyzer.analyze() called:', {
      hasGcsUri,
      hasGeminiFileUri,
      canUseVertex,
      canUseGeminiApi,
      hasApiKey: !!this.apiKey,
      hasVertexProjectId: !!this.vertexProjectId
    })

    // If we can't run any API, return a strict placeholder
    if (!canUseVertex && !canUseGeminiApi) {
      console.log('⚠️ BrandAnalyzer: No valid URI available, returning placeholder')
      const placeholderObservation = this.createPlaceholderObservation(input)
      return {
        model: this.model,
        analyzed_at: analyzedAt,
        schema_version: SCHEMA_VERSION,
        raw_output: placeholderObservation,
        signals: this.mapObservationToSignals(placeholderObservation),
        confidence: {
          overall: 0,
          personality: 0,
          statement: 0
        }
      }
    }

    const prompt = this.buildPrompt()
    let raw: any

    if (canUseVertex) {
      // Prefer Vertex AI with GCS URI
      console.log('🔷 BrandAnalyzer: Using Vertex AI with GCS URI')
      const vertex = createVertexTuningService()
      raw = await vertex.analyzeVideoWithGemini(input.gcsUri!, prompt)
    } else {
      // Fall back to Gemini API with File API URI
      console.log('🔶 BrandAnalyzer: Using Gemini API with File API URI')
      raw = await this.analyzeWithGeminiApi(input.geminiFileUri!, prompt)
    }

    // The helper returns {overall, dimensions, reasoning} when it can't parse JSON.
    // Prefer its JSON parse when available; otherwise attempt to parse reasoning.
    const candidate = this.coerceVertexOutput(raw)
    console.log('🔍 BrandAnalyzer raw output coerced:', {
      rawType: typeof raw,
      candidateType: typeof candidate,
      hasSchemaVersion: !!(candidate as any)?.schema_version,
      hasSignals: !!(candidate as any)?.signals,
      signalKeys: (candidate as any)?.signals ? Object.keys((candidate as any).signals) : []
    })
    
    const observation = parseVideoBrandObservationV1(candidate)
    console.log('🔍 BrandAnalyzer parsed observation:', {
      hasSignals: !!observation.signals,
      hasReplicability: !!observation.signals?.replicability,
      hasEnvironment: !!observation.signals?.environment_requirements,
      hasRisk: !!observation.signals?.risk_level,
      hasAudience: !!observation.signals?.target_audience
    })

    return {
      model: this.model,
      analyzed_at: analyzedAt,
      schema_version: SCHEMA_VERSION,
      raw_output: observation,
      signals: this.mapObservationToSignals(observation),
      confidence: {
        overall: observation.confidence?.overall_0_1 ?? 0.6,
        personality: observation.confidence?.overall_0_1 ?? 0.6,
        statement: observation.confidence?.overall_0_1 ?? 0.6
      }
    }
  }

  /**
   * Analyze video using Gemini API (for Gemini File API URIs)
   */
  private async analyzeWithGeminiApi(fileUri: string, prompt: string): Promise<any> {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY not configured')
    }

    console.log('🔶 BrandAnalyzer calling Gemini API with fileUri:', fileUri.substring(0, 80))
    
    const genAI = new GoogleGenerativeAI(this.apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-001' })

    try {
      const result = await model.generateContent([
        {
          fileData: {
            mimeType: 'video/mp4',
            fileUri: fileUri
          }
        },
        { text: prompt }
      ])

      const response = result.response
      const text = response.text()
      console.log('🔶 Gemini API response length:', text.length, 'chars')
      console.log('🔶 Response preview:', text.substring(0, 500))

      // Try to parse as JSON
      try {
        // Remove markdown code fences if present
        const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
        const parsed = JSON.parse(cleaned)
        console.log('✅ Successfully parsed Gemini response as JSON')
        return parsed
      } catch (parseError) {
        console.warn('⚠️ Could not parse as JSON, returning as reasoning:', parseError)
        // Return as reasoning for coerceVertexOutput to handle
        return { reasoning: text }
      }
    } catch (error) {
      console.error('❌ Gemini API analysis failed:', error)
      throw error
    }
  }
  
  /**
   * Create empty placeholder analysis
   */
  private createPlaceholderAnalysis(): VideoBrandAnalysis {
    return {
      model: this.model,
      analyzed_at: new Date().toISOString(),
      schema_version: SCHEMA_VERSION,
      raw_output: {
        status: 'placeholder',
        message: 'Brand analysis not yet implemented - provide human interpretation'
      },
      signals: undefined,
      confidence: {
        overall: 0,
        personality: 0,
        statement: 0
      }
    }
  }

  /**
   * Strict Schema v1 placeholder (always schema-valid) used when analysis can't run.
   */
  private createPlaceholderObservation(input: {
    videoUrl?: string
    videoId?: string
    gcsUri?: string
  }): VideoBrandObservationV1 {
    return parseVideoBrandObservationV1({
      schema_version: 1,
      video: {
        video_id: input.videoId || input.videoUrl || 'unknown',
        platform: 'unknown',
        video_url: input.videoUrl,
        gcs_uri: input.gcsUri,
        detected_language: undefined
      },
      signals: {
        personality: undefined,
        statement: undefined,
        execution: undefined,
        hospitality: undefined,
        humor: undefined,
        conversion: undefined,
        coherence: undefined
      },
      scores: {
        brand_intent_signal_0_1: null,
        execution_coherence_0_1: null,
        distinctiveness_0_1: null,
        trust_signals_0_1: null
      },
      evidence: [],
      confidence: {
        overall_0_1: 0,
        notes: this.isConfigured()
          ? 'Vertex configured, but missing gcs_uri for this video.'
          : 'Vertex not configured; returning schema placeholder.'
      },
      uncertainties: [
        'No model output available; placeholder only.',
        ...(input.gcsUri ? [] : ['Missing gcs_uri (gs://...) required for Vertex video input.'])
      ]
    })
  }
  
  /**
   * Future: Build the analysis prompt
   * This will be developed through iteration with training data
   */
  private buildPrompt(): string {
    // Schema-locked prompt contract for mass-reliability.
    // IMPORTANT: The API route validates this output strictly with Zod.
    return [
      'You are analyzing a short-form social video for hospitality brand signals (restaurants/cafés/bars/hotels).',
      '',
      'CRITICAL OUTPUT RULES:',
      '1) Return JSON ONLY. No markdown, no commentary.',
      '2) Output must match Schema v1.1 exactly (unknown keys forbidden).',
      '3) Evidence is mandatory: include at least 2 evidence items with timestamps when possible.',
      '4) Separate observed vs inferred. If uncertain, use null and list why in uncertainties.',
      '',
      'NEW IN v1.1: Pay special attention to:',
      '- REPLICABILITY: How many people, what equipment, how hard to recreate?',
      '- ENVIRONMENT: What physical setting is required?',
      '- TARGET AUDIENCE: Who is this content actually for?',
      '- RISK LEVEL: How brand-safe or edgy is this content?',
      '',
      'SCHEMA v1.1 (return exactly this structure):',
      '{',
      '  "schema_version": 1,',
      '  "video": {',
      '    "video_id": "...",',
      '    "platform": "tiktok",',
      '    "video_url": "https://...",',
      '    "gcs_uri": "gs://...",',
      '    "detected_language": "en"',
      '  },',
      '  "signals": {',
      '    "personality": {',
      '      "energy_1_10": 1-10 or null,',
      '      "formality_1_10": 1-10 or null,',
      '      "warmth_1_10": 1-10 or null,',
      '      "confidence_1_10": 1-10 or null,',
      '      "traits_observed": ["..."],',
      '      "social_positioning": { "accessibility": "everyman|aspirational|exclusive|elite" or null, "authority_claims": true/false or null, "peer_relationship": true/false or null }',
      '    },',
      '    "statement": {',
      '      "primary_intent": "inspire|entertain|inform|challenge|comfort|provoke|connect|sell" or null,',
      '      "subtext": ["..."],',
      '      "apparent_audience": "..." or null,',
      '      "self_seriousness_1_10": 1-10 or null,',
      '      "opinion_stance": { "makes_opinions": true/false or null, "edginess": "safe|mild|moderate|edgy|provocative" or null, "defended": true/false or null }',
      '    },',
      '    "execution": {',
      '      "intentionality_1_10": 1-10 or null,',
      '      "production_investment_1_10": 1-10 or null,',
      '      "effortlessness_1_10": 1-10 or null,',
      '      "social_permission_1_10": 1-10 or null,',
      '      "has_repeatable_format": true/false or null,',
      '      "format_name_if_any": "..." or null',
      '    },',
      '    "replicability": {',
      '      "actor_count": "solo|duo|small_team|large_team" or null,',
      '      "setup_complexity": "phone_only|basic_tripod|lighting_setup|full_studio" or null,',
      '      "skill_required": "anyone|basic_editing|intermediate|professional" or null,',
      '      "environment_dependency": "anywhere|specific_indoor|specific_outdoor|venue_required" or null,',
      '      "equipment_needed": ["smartphone", "tripod", ...],',
      '      "estimated_time": "under_1hr|1_4hrs|half_day|full_day" or null',
      '    },',
      '    "risk_level": {',
      '      "content_edge": "brand_safe|mildly_edgy|edgy|provocative" or null,',
      '      "humor_risk": "safe_humor|playful|sarcastic|dark_humor" or null,',
      '      "trend_reliance": "evergreen|light_trends|trend_dependent" or null,',
      '      "controversy_potential": "none|low|moderate|high" or null',
      '    },',
      '    "hospitality": {',
      '      "business_type": "restaurant|cafe|bar|hotel|other" or null,',
      '      "vibe": ["..."],',
      '      "occasion": ["..."],',
      '      "price_tier": "budget|mid|premium|luxury|unknown" or null,',
      '      "service_ethos": ["..."],',
      '      "signature_items_or_offers": ["..."],',
      '      "locality_markers": ["..."],',
      '      "tourist_orientation": "locals|tourists|mixed|unknown" or null',
      '    },',
      '    "environment_requirements": {',
      '      "setting_type": "indoor|outdoor|kitchen|bar|storefront|dining_room|mixed" or null,',
      '      "space_requirements": "minimal|moderate|spacious" or null,',
      '      "lighting_conditions": "natural|artificial|low_light|flexible" or null,',
      '      "noise_tolerance": "quiet_needed|moderate_ok|noisy_ok" or null,',
      '      "customer_visibility": "no_customers|background|featured" or null',
      '    },',
      '    "target_audience": {',
      '      "age_range": { "primary": "gen_z|millennial|gen_x|boomer|broad" or null, "secondary": "gen_z|millennial|gen_x|boomer|none" or null },',
      '      "income_level": "budget|mid_range|upscale|luxury|broad" or null,',
      '      "lifestyle_tags": ["foodies", "families", "date_night", "tourists", "locals", ...],',
      '      "primary_occasion": "quick_meal|casual_dining|special_occasion|takeout|delivery|bar_drinks|coffee_cafe|brunch" or null,',
      '      "vibe_alignment": "trendy|classic|family_friendly|upscale_casual|dive_authentic|instagram_worthy|neighborhood_gem|hidden_gem" or null',
      '    },',
      '    "humor": {',
      '      "present": true/false or null,',
      '      "humor_types": ["..."],',
      '      "target": "self|customer|employee|industry|competitor|situation|product|none" or null,',
      '      "age_code": "younger|older|balanced|unknown" or null,',
      '      "meanness_risk": "low|medium|high|unknown" or null',
      '    },',
      '    "conversion": {',
      '      "cta_types": ["follow_for_series|comment_prompt|visit_in_store|book_now|order_online|link_in_bio|dm_us|other"],',
      '      "visit_intent_strength_0_1": 0-1 or null',
      '    },',
      '    "coherence": {',
      '      "personality_message_alignment_0_1": 0-1 or null,',
      '      "contradictions": ["..."]',
      '    }',
      '  },',
      '  "scores": {',
      '    "brand_intent_signal_0_1": 0-1 or null,',
      '    "execution_coherence_0_1": 0-1 or null,',
      '    "distinctiveness_0_1": 0-1 or null,',
      '    "trust_signals_0_1": 0-1 or null',
      '  },',
      '  "evidence": [',
      '    {"type":"quote|ocr|visual|audio|caption|thumbnail|bio|other","start_s":0,"end_s":1,"text":"...","supports":["signals.humor.present"]}',
      '  ],',
      '  "confidence": { "overall_0_1": 0-1 or null, "notes": "..." },',
      '  "uncertainties": ["..."]',
      '}',
      '',
      'Remember: JSON only. At least 2 evidence items.'
    ].join('\n')
  }

  private coerceVertexOutput(raw: any): unknown {
    if (raw && typeof raw === 'object' && 'schema_version' in raw) {
      return raw
    }

    // The Vertex helper may return { reasoning: "..." } when it couldn't parse JSON.
    const reasoningText = raw?.reasoning
    if (typeof reasoningText === 'string') {
      const match = reasoningText.match(/\{[\s\S]*\}/)
      if (match) {
        try {
          return JSON.parse(match[0])
        } catch {
          // fall through
        }
      }
    }

    return raw
  }

  private mapObservationToSignals(observation: VideoBrandObservationV1): VideoBrandSignals {
    const personality = observation.signals.personality
    const statement = observation.signals.statement
    const execution = observation.signals.execution
    const hospitality = observation.signals.hospitality
    const humor = observation.signals.humor
    const conversion = observation.signals.conversion
    const coherence = observation.signals.coherence

    return {
      personality_signals: personality
        ? {
            energy: personality.energy_1_10 ?? undefined,
            formality: personality.formality_1_10 ?? undefined,
            warmth: personality.warmth_1_10 ?? undefined,
            confidence: personality.confidence_1_10 ?? undefined,
            traits_observed: personality.traits_observed,
            social_signals: personality.social_positioning
              ? {
                  accessibility: (personality.social_positioning.accessibility ?? undefined) as any,
                  authority_claims: personality.social_positioning.authority_claims ?? undefined,
                  peer_relationship: personality.social_positioning.peer_relationship ?? undefined
                }
              : undefined
          }
        : undefined,

      statement_signals: statement
        ? {
            subtext: statement.subtext,
            content_intent: (statement.primary_intent ?? undefined) as any,
            apparent_audience: statement.apparent_audience ?? undefined,
            self_seriousness: statement.self_seriousness_1_10 ?? undefined,
            opinion_stance: statement.opinion_stance
              ? {
                  makes_opinions: statement.opinion_stance.makes_opinions ?? undefined,
                  edginess: (statement.opinion_stance.edginess ?? undefined) as any,
                  defended: statement.opinion_stance.defended ?? undefined
                }
              : undefined
          }
        : undefined,

      execution_signals: execution
        ? {
            intentionality: execution.intentionality_1_10 ?? undefined,
            production_investment: execution.production_investment_1_10 ?? undefined,
            effortlessness: execution.effortlessness_1_10 ?? undefined,
            social_permission: execution.social_permission_1_10 ?? undefined,
            has_repeatable_format: execution.has_repeatable_format ?? undefined,
            format_name: execution.format_name_if_any ?? undefined
          }
        : undefined,

      hospitality_signals: hospitality
        ? {
            business_type: (hospitality.business_type ?? undefined) as any,
            vibe: hospitality.vibe,
            occasion: hospitality.occasion,
            price_tier: (hospitality.price_tier ?? undefined) as any,
            service_ethos: hospitality.service_ethos,
            signature_items_or_offers: hospitality.signature_items_or_offers,
            locality_markers: hospitality.locality_markers,
            tourist_orientation: (hospitality.tourist_orientation ?? undefined) as any
          }
        : undefined,

      humor_mix: humor
        ? {
            present: humor.present ?? undefined,
            humor_types: humor.humor_types,
            target: (humor.target ?? undefined) as any,
            age_code: (humor.age_code ?? undefined) as any,
            meanness_risk: (humor.meanness_risk ?? undefined) as any
          }
        : undefined,

      conversion_signals: conversion
        ? {
            cta_types: (conversion.cta_types as any) ?? undefined,
            visit_intent_strength: conversion.visit_intent_strength_0_1 ?? undefined
          }
        : undefined,

      coherence_signals: coherence
        ? {
            personality_message_alignment: coherence.personality_message_alignment_0_1 ?? undefined,
            tensions: coherence.contradictions
          }
        : undefined
    }
  }
}

/**
 * Singleton instance
 */
let analyzerInstance: BrandAnalyzer | null = null

export function getBrandAnalyzer(): BrandAnalyzer {
  if (!analyzerInstance) {
    analyzerInstance = new BrandAnalyzer()
  }
  return analyzerInstance
}

/**
 * Future: Compare brand analysis with humor analysis
 * This will allow us to see how brand signals correlate with humor choices
 */
export function compareBrandWithHumorAnalysis(
  brandSignals: VideoBrandSignals,
  humorAnalysis: Record<string, unknown>
): Record<string, unknown> {
  // Placeholder for future cross-reference
  return {
    status: 'not-implemented',
    brand_signals: brandSignals,
    humor_analysis: humorAnalysis,
    correlations: []
  }
}

/**
 * Future: Aggregate brand signals from multiple videos
 * Build a creator profile from their content
 */
export function aggregateBrandSignals(
  videos: { videoId: string; signals: VideoBrandSignals }[]
): VideoBrandSignals {
  // Placeholder for future implementation
  if (videos.length === 0) {
    return {}
  }
  
  // For now, just return the first video's signals
  // Will be replaced with actual aggregation logic
  return videos[0].signals
}
