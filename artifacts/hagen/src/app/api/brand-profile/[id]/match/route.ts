/**
 * Brand Profile Match API
 * 
 * POST /api/brand-profile/[id]/match
 * 
 * Find videos that match a brand profile based on fingerprint matching
 * v1.1: Uses hard filters + soft scoring pipeline
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateEmbedding } from '@/lib/services/embeddings/openai'
import { computeBatchMatches } from '@/lib/services/brand/matching-explainer'
import { computeBrandFingerprint } from '@/lib/services/brand/profile-fingerprint'
import type { BrandFingerprint, VideoFingerprint } from '@/lib/services/brand/profile-fingerprint.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { 
      limit = 20, 
      threshold = 0.6,
      regenerateEmbedding = false,
      fingerprint: fingerprintOverrides  // NEW v1.1: UI-provided constraints
    } = body

    console.log(`🎯 Finding video matches for brand profile: ${id}`)

    // Get brand profile
    const { data: profile, error: profileError } = await supabase
      .from('brand_profiles')
      .select('*')
      .eq('id', id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Brand profile not found' },
        { status: 404 }
      )
    }

    // v1.1: Build brand fingerprint from profile + UI overrides
    const brandFingerprint = buildBrandFingerprint(profile, fingerprintOverrides)
    console.log('📊 Brand fingerprint computed:', {
      teamSize: brandFingerprint.operational_constraints.team_size_available,
      ambition: brandFingerprint.ambition_level.aspiration
    })

    // Check if we need to generate/regenerate embedding (for hybrid mode)
    let embedding = profile.embedding

    if (!embedding || regenerateEmbedding) {
      console.log('📊 Generating brand profile embedding...')
      const embeddingText = buildEmbeddingText(profile)
      embedding = await generateEmbedding(embeddingText)

      await supabase
        .from('brand_profiles')
        .update({ embedding })
        .eq('id', id)

      console.log('✅ Embedding generated and stored')
    }

    // Fetch videos with their analysis data for fingerprint matching
    const { data: videos, error: videoError } = await supabase
      .from('analyzed_videos')
      .select(`
        id,
        video_url,
        platform,
        metadata,
        analysis,
        embedding
      `)
      .not('analysis', 'is', null)
      .limit(200) // Get more to filter down

    if (videoError || !videos) {
      throw new Error('Failed to fetch videos for matching')
    }

    // v1.1: Use new fingerprint matching system
    const videoFingerprints = videos
      .map(video => extractVideoFingerprint(video))
      .filter((vf): vf is { video: any; fingerprint: VideoFingerprint } => vf !== null)

    console.log(`📹 Processing ${videoFingerprints.length} videos through fingerprint matching`)

    // Run fingerprint matching (hard filters + soft scoring)
    // Note: computeBatchMatches expects (videos, brand) order
    const matchResults = computeBatchMatches(
      videoFingerprints.map(vf => vf.fingerprint),
      brandFingerprint
    )

    // Combine with original video data and filter
    const matches = matchResults
      .map((result, index) => ({
        id: videoFingerprints[index].video.id,
        video_url: videoFingerprints[index].video.video_url,
        platform: videoFingerprints[index].video.platform,
        title: videoFingerprints[index].video.metadata?.title || null,
        quality_tier: videoFingerprints[index].video.analysis?.quality_rating?.tier || null,
        similarity: result.overall_score,
        // v1.1 new fields
        passed_filters: result.passes_filters,
        filter_results: {
          passed: result.passes_filters,
          failed_filters: result.filter_results.filter(f => !f.passed).map(f => f.filter_name),
          warnings: [] // Warnings can be added later if HardFilterResult is extended
        },
        score_breakdown: {
          audience_alignment: result.match_summary.audience_fit,
          tone_match: result.match_summary.tone_match,
          format_appropriateness: result.match_summary.format_fit,
          aspiration_alignment: result.match_summary.aspiration_alignment
        },
        explanation: result.explanation
      }))
      .filter(m => m.passed_filters && m.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)

    // Count filtered-out videos for reporting
    const filteredOut = matchResults.filter(r => !r.passes_filters).length

    console.log(`✅ Found ${matches.length} matching videos (${filteredOut} filtered out by hard constraints)`)

    return NextResponse.json({
      profileId: id,
      profileName: profile.name,
      matches,
      matchCount: matches.length,
      filteredOutCount: filteredOut,
      embeddingGenerated: !profile.embedding || regenerateEmbedding,
      fingerprintVersion: '1.1'
    })
  } catch (error) {
    console.error('Brand match error:', error)
    return NextResponse.json(
      { error: 'Failed to find matching videos' },
      { status: 500 }
    )
  }
}

/**
 * Build BrandFingerprint from profile data + UI overrides
 */
function buildBrandFingerprint(profile: any, overrides?: any): BrandFingerprint {
  // Start with computed fingerprint from profile
  const base = computeBrandFingerprint({
    brand_id: profile.id,
    brand_name: profile.name || 'Unknown',
    narrative_summary: profile.conversation_synthesis || '',
    characteristics: profile.characteristics || {},
    tone: profile.tone || {},
    target_audience: profile.target_audience || {},
    goals: profile.goals || {},
    current_state: profile.current_state || {},
    content_recommendations: profile.content_recommendations || {}
  })

  // Apply UI overrides if provided
  if (overrides) {
    if (overrides.operational_constraints) {
      base.operational_constraints = {
        ...base.operational_constraints,
        team_size_available: overrides.operational_constraints.team_size || base.operational_constraints.team_size_available,
        time_per_video: overrides.operational_constraints.time_per_video || base.operational_constraints.time_per_video,
        equipment_available: overrides.operational_constraints.equipment || base.operational_constraints.equipment_available
      }
    }
    if (overrides.environment_availability) {
      base.environment_availability = {
        ...base.environment_availability,
        available_settings: overrides.environment_availability.settings || base.environment_availability.available_settings,
        can_feature_customers: overrides.environment_availability.can_feature_customers ?? base.environment_availability.can_feature_customers,
        space_available: overrides.environment_availability.space || base.environment_availability.space_available
      }
    }
    if (overrides.ambition_level) {
      base.ambition_level = {
        ...base.ambition_level,
        aspiration: overrides.ambition_level
      }
    }
  }

  return base
}

/**
 * Extract VideoFingerprint from analyzed video
 */
function extractVideoFingerprint(video: any): { video: any; fingerprint: VideoFingerprint } | null {
  const analysis = video.analysis
  if (!analysis) return null

  try {
    // Build fingerprint from analysis data using the correct interface types
    const fingerprint: VideoFingerprint = {
      video_id: video.id,
      video_url: video.video_url,
      computed_at: new Date().toISOString(),

      // ContentFormat
      format: {
        primary_intent: analysis.brand_tone_analysis?.primary_intent || null,
        has_repeatable_format: analysis.brand_tone_analysis?.has_repeatable_format || false,
        format_name: analysis.brand_tone_analysis?.format_name || null,
        cta_types: analysis.brand_tone_analysis?.cta_types || []
      },

      // ReplicabilityScore
      replicability: {
        actor_count: analysis.replicability?.actor_count || null,
        setup_complexity: analysis.replicability?.setup_complexity || null,
        skill_required: analysis.replicability?.skill_required || null,
        environment_dependency: analysis.replicability?.environment_dependency || null,
        equipment_needed: analysis.replicability?.equipment_needed || [],
        estimated_time: analysis.replicability?.estimated_time || null,
        feasibility_score: analysis.replicability?.feasibility_score || 0.5
      },

      // AudienceSignals
      audience_signals: {
        age_primary: analysis.target_audience?.age_primary || null,
        age_secondary: analysis.target_audience?.age_secondary || null,
        income_level: analysis.target_audience?.income_level || null,
        lifestyle_tags: analysis.target_audience?.lifestyle_tags || [],
        primary_occasion: analysis.target_audience?.primary_occasion || null,
        vibe_alignment: analysis.target_audience?.vibe_alignment || null
      },

      // ToneProfile
      tone_profile: {
        energy: analysis.brand_tone_analysis?.energy_level || null,
        warmth: analysis.brand_tone_analysis?.warmth_level || null,
        formality: analysis.brand_tone_analysis?.formality_level || null,
        self_seriousness: analysis.brand_tone_analysis?.self_seriousness || null,
        humor_present: analysis.brand_tone_analysis?.humor_present || false,
        humor_types: analysis.brand_tone_analysis?.humor_types || [],
        humor_target: analysis.brand_tone_analysis?.humor_target || null,
        meanness_risk: analysis.brand_tone_analysis?.meanness_risk || null
      },

      // EnvironmentRequirements
      environment_requirements: {
        setting_type: analysis.environment_requirements?.setting_type || null,
        space_requirements: analysis.environment_requirements?.space_requirements || null,
        lighting_conditions: analysis.environment_requirements?.lighting_conditions || null,
        noise_tolerance: analysis.environment_requirements?.noise_tolerance || null,
        customer_visibility: analysis.environment_requirements?.customer_visibility || null
      },

      // RiskLevel
      risk_level: {
        content_edge: analysis.risk_level?.content_edge || null,
        humor_risk: analysis.risk_level?.humor_risk || null,
        trend_reliance: analysis.risk_level?.trend_reliance || null,
        controversy_potential: analysis.risk_level?.controversy_potential || null,
        overall_risk_score: analysis.risk_level?.overall_risk_score || 0.2
      },

      // Quality baseline
      quality_baseline: {
        execution_quality: analysis.quality_rating?.overall_score || 0.5,
        production_investment: analysis.quality_rating?.production_investment || 5,
        distinctiveness: analysis.quality_rating?.distinctiveness || 0.5
      },

      // Embedding (from video if available)
      embedding: video.embedding || [],

      // Confidence
      confidence: analysis.confidence || 0.7
    }

    return { video, fingerprint }
  } catch (error) {
    console.warn('Failed to extract fingerprint for video:', video.id, error)
    return null
  }
}

/**
 * Build text for embedding from brand profile
 * Uses vocabulary aligned with video brand_tone_notes for better matching
 */
function buildEmbeddingText(profile: any): string {
  const parts: string[] = []

  // Business context
  if (profile.business_type) {
    parts.push(`Business type: ${profile.business_type}`)
  }

  // Characteristics
  if (profile.characteristics) {
    const chars = profile.characteristics
    if (chars.team_size) parts.push(`Team size: ${chars.team_size}`)
    if (chars.business_age) parts.push(`Business maturity: ${chars.business_age}`)
    if (chars.brand_personality_inferred?.length) {
      parts.push(`Brand personality: ${chars.brand_personality_inferred.join(', ')}`)
    }
  }

  // Tone - this is crucial for matching
  if (profile.tone) {
    const tone = profile.tone
    if (tone.primary) parts.push(`Primary tone: ${tone.primary}`)
    if (tone.secondary?.length) parts.push(`Secondary tones: ${tone.secondary.join(', ')}`)
    if (tone.energy_level) parts.push(`Energy level: ${tone.energy_level}/10`)
    if (tone.humor_tolerance) parts.push(`Humor tolerance: ${tone.humor_tolerance}/10`)
    if (tone.formality) parts.push(`Formality: ${tone.formality}/10`)
    if (tone.avoid?.length) parts.push(`Avoid: ${tone.avoid.join(', ')}`)
  }

  // Goals - content aspirations are important for matching
  if (profile.goals) {
    const goals = profile.goals
    if (goals.content_aspirations?.length) {
      parts.push(`Content style aspirations: ${goals.content_aspirations.join(', ')}`)
    }
    if (goals.social_media_goals?.length) {
      parts.push(`Goals: ${goals.social_media_goals.join(', ')}`)
    }
  }

  // Target audience
  if (profile.target_audience) {
    const audience = profile.target_audience
    if (audience.description) parts.push(`Target audience: ${audience.description}`)
    if (audience.psychographics?.length) {
      parts.push(`Audience characteristics: ${audience.psychographics.join(', ')}`)
    }
  }

  // Key insights
  if (profile.key_insights?.length) {
    parts.push(`Key brand insights: ${profile.key_insights.join('. ')}`)
  }

  // Synthesis text is ideal if available
  if (profile.conversation_synthesis) {
    parts.push(`Brand summary: ${profile.conversation_synthesis}`)
  }

  return parts.join('\n')
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  if (normA === 0 || normB === 0) return 0

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}
