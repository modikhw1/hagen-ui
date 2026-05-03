import { z } from 'zod'

// =============================================================================
// Schema v1: Hospitality Character + Brand Completeness
// =============================================================================

const Score0to1 = z.number().min(0).max(1)
const OneToTen = z.number().min(1).max(10)

// =============================================================================
// New v1.1 Sub-Schemas: Replicability, Risk, Environment, Audience
// =============================================================================

/** Replicability: How easily can a brand recreate this content? */
export const ReplicabilitySchema = z
  .object({
    actor_count: z.enum(['solo', 'duo', 'small_team', 'large_team']).nullable().optional(),
    setup_complexity: z.enum(['phone_only', 'basic_tripod', 'lighting_setup', 'full_studio']).nullable().optional(),
    skill_required: z.enum(['anyone', 'basic_editing', 'intermediate', 'professional']).nullable().optional(),
    environment_dependency: z.enum(['anywhere', 'specific_indoor', 'specific_outdoor', 'venue_required']).nullable().optional(),
    equipment_needed: z.array(z.string()).optional(),
    estimated_time: z.enum(['under_1hr', '1_4hrs', 'half_day', 'full_day']).nullable().optional()
  })
  .strict()

/** Risk Level: How brand-safe or edgy is the content? */
export const RiskLevelSchema = z
  .object({
    content_edge: z.enum(['brand_safe', 'mildly_edgy', 'edgy', 'provocative']).nullable().optional(),
    humor_risk: z.enum(['safe_humor', 'playful', 'sarcastic', 'dark_humor']).nullable().optional(),
    trend_reliance: z.enum(['evergreen', 'light_trends', 'trend_dependent']).nullable().optional(),
    controversy_potential: z.enum(['none', 'low', 'moderate', 'high']).nullable().optional()
  })
  .strict()

/** Environment Requirements: What physical setting is needed? */
export const EnvironmentRequirementsSchema = z
  .object({
    setting_type: z.enum(['indoor', 'outdoor', 'kitchen', 'bar', 'storefront', 'dining_room', 'mixed']).nullable().optional(),
    space_requirements: z.enum(['minimal', 'moderate', 'spacious']).nullable().optional(),
    lighting_conditions: z.enum(['natural', 'artificial', 'low_light', 'flexible']).nullable().optional(),
    noise_tolerance: z.enum(['quiet_needed', 'moderate_ok', 'noisy_ok']).nullable().optional(),
    customer_visibility: z.enum(['no_customers', 'background', 'featured']).nullable().optional()
  })
  .strict()

/** Expanded Target Audience: Who is this content for? */
export const TargetAudienceSchema = z
  .object({
    // Demographics
    age_range: z
      .object({
        primary: z.enum(['gen_z', 'millennial', 'gen_x', 'boomer', 'broad']).nullable().optional(),
        secondary: z.enum(['gen_z', 'millennial', 'gen_x', 'boomer', 'none']).nullable().optional()
      })
      .strict()
      .optional(),
    income_level: z.enum(['budget', 'mid_range', 'upscale', 'luxury', 'broad']).nullable().optional(),
    
    // Psychographics
    lifestyle_tags: z.array(z.enum([
      'foodies', 'families', 'date_night', 'business', 'tourists',
      'locals', 'health_conscious', 'indulgent', 'social_media_active',
      'adventurous', 'comfort_seeking', 'trend_followers'
    ])).optional(),
    
    // Occasion targeting
    primary_occasion: z.enum([
      'quick_meal', 'casual_dining', 'special_occasion',
      'takeout', 'delivery', 'bar_drinks', 'coffee_cafe', 'brunch'
    ]).nullable().optional(),
    
    // Cultural positioning
    vibe_alignment: z.enum([
      'trendy', 'classic', 'family_friendly', 'upscale_casual',
      'dive_authentic', 'instagram_worthy', 'neighborhood_gem', 'hidden_gem'
    ]).nullable().optional()
  })
  .strict()

export const VideoBrandEvidenceV1Schema = z
  .object({
    type: z.enum(['quote', 'ocr', 'visual', 'audio', 'caption', 'thumbnail', 'bio', 'other']),
    start_s: z.number().min(0).nullable().optional(),
    end_s: z.number().min(0).nullable().optional(),
    text: z.string(),
    supports: z.array(z.string()).default([])
  })
  .strict()

export const VideoBrandObservationV1Schema = z
  .object({
    schema_version: z.literal(1),
    video: z
      .object({
        video_id: z.string(),
        platform: z.string(),
        video_url: z.string().optional(),
        gcs_uri: z.string().optional(),
        detected_language: z.string().optional()
      })
      .strict(),

    signals: z
      .object({
        personality: z
          .object({
            energy_1_10: OneToTen.nullable().optional(),
            formality_1_10: OneToTen.nullable().optional(),
            warmth_1_10: OneToTen.nullable().optional(),
            confidence_1_10: OneToTen.nullable().optional(),
            traits_observed: z.array(z.string()).optional(),
            social_positioning: z
              .object({
                accessibility: z.enum(['everyman', 'aspirational', 'exclusive', 'elite']).nullable().optional(),
                authority_claims: z.boolean().nullable().optional(),
                peer_relationship: z.boolean().nullable().optional()
              })
              .strict()
              .optional()
          })
          .strict()
          .optional(),

        statement: z
          .object({
            primary_intent: z
              .enum(['inspire', 'entertain', 'inform', 'challenge', 'comfort', 'provoke', 'connect', 'sell'])
              .nullable()
              .optional(),
            subtext: z.array(z.string()).optional(),
            apparent_audience: z.string().nullable().optional(),
            self_seriousness_1_10: OneToTen.nullable().optional(),
            opinion_stance: z
              .object({
                makes_opinions: z.boolean().nullable().optional(),
                edginess: z.enum(['safe', 'mild', 'moderate', 'edgy', 'provocative']).nullable().optional(),
                defended: z.boolean().nullable().optional()
              })
              .strict()
              .optional()
          })
          .strict()
          .optional(),

        execution: z
          .object({
            intentionality_1_10: OneToTen.nullable().optional(),
            production_investment_1_10: OneToTen.nullable().optional(),
            effortlessness_1_10: OneToTen.nullable().optional(),
            social_permission_1_10: OneToTen.nullable().optional(),
            has_repeatable_format: z.boolean().nullable().optional(),
            format_name_if_any: z.string().nullable().optional()
          })
          .strict()
          .optional(),

        /** NEW v1.1: Replicability assessment */
        replicability: ReplicabilitySchema.optional(),

        /** NEW v1.1: Risk level assessment */
        risk_level: RiskLevelSchema.optional(),

        hospitality: z
          .object({
            business_type: z.enum(['restaurant', 'cafe', 'bar', 'hotel', 'other']).nullable().optional(),
            vibe: z.array(z.string()).optional(),
            occasion: z.array(z.string()).optional(),
            price_tier: z.enum(['budget', 'mid', 'premium', 'luxury', 'unknown']).nullable().optional(),
            service_ethos: z.array(z.string()).optional(),
            signature_items_or_offers: z.array(z.string()).optional(),
            locality_markers: z.array(z.string()).optional(),
            tourist_orientation: z.enum(['locals', 'tourists', 'mixed', 'unknown']).nullable().optional()
          })
          .strict()
          .optional(),

        /** NEW v1.1: Environment requirements for content recreation */
        environment_requirements: EnvironmentRequirementsSchema.optional(),

        /** NEW v1.1: Expanded target audience signals */
        target_audience: TargetAudienceSchema.optional(),

        humor: z
          .object({
            present: z.boolean().nullable().optional(),
            humor_types: z.array(z.string()).optional(),
            target: z
              .enum([
                'self',
                'customer',
                'employee',
                'industry',
                'competitor',
                'situation',
                'product',
                'none'
              ])
              .nullable()
              .optional(),
            age_code: z.enum(['younger', 'older', 'balanced', 'unknown']).nullable().optional(),
            meanness_risk: z.enum(['low', 'medium', 'high', 'unknown']).nullable().optional()
          })
          .strict()
          .optional(),

        conversion: z
          .object({
            cta_types: z
              .array(
                z.enum([
                  'follow_for_series',
                  'comment_prompt',
                  'visit_in_store',
                  'book_now',
                  'order_online',
                  'link_in_bio',
                  'dm_us',
                  'other'
                ])
              )
              .optional(),
            visit_intent_strength_0_1: Score0to1.nullable().optional()
          })
          .strict()
          .optional(),

        coherence: z
          .object({
            personality_message_alignment_0_1: Score0to1.nullable().optional(),
            contradictions: z.array(z.string()).optional()
          })
          .strict()
          .optional()
      })
      .strict(),

    scores: z
      .object({
        brand_intent_signal_0_1: Score0to1.nullable().optional(),
        execution_coherence_0_1: Score0to1.nullable().optional(),
        distinctiveness_0_1: Score0to1.nullable().optional(),
        trust_signals_0_1: Score0to1.nullable().optional()
      })
      .strict()
      .optional(),

    evidence: z.array(VideoBrandEvidenceV1Schema).default([]),

    confidence: z
      .object({
        overall_0_1: Score0to1.nullable().optional(),
        notes: z.string().optional()
      })
      .strict()
      .optional(),

    uncertainties: z.array(z.string()).default([])
  })
  .strict()

export type VideoBrandObservationV1 = z.infer<typeof VideoBrandObservationV1Schema>

export function parseVideoBrandObservationV1(input: unknown): VideoBrandObservationV1 {
  try {
    return VideoBrandObservationV1Schema.parse(input)
  } catch (error) {
    // Schema is strict - if Gemini returns extra fields, parsing fails
    // Log the error and try a more lenient parse
    console.warn('⚠️ Strict schema parse failed, attempting lenient parse:', error)
    console.log('🔍 Input was:', JSON.stringify(input, null, 2).substring(0, 1000))
    
    // Try to extract just what we need without strict validation
    const obj = input as any
    if (obj && typeof obj === 'object' && obj.signals) {
      // Return a minimal valid structure with whatever signals we can get
      return {
        schema_version: 1,
        video: {
          video_id: obj.video?.video_id || 'unknown',
          platform: obj.video?.platform || 'unknown'
        },
        signals: {
          replicability: obj.signals?.replicability,
          risk_level: obj.signals?.risk_level,
          environment_requirements: obj.signals?.environment_requirements,
          target_audience: obj.signals?.target_audience,
          personality: obj.signals?.personality,
          statement: obj.signals?.statement,
          execution: obj.signals?.execution,
          hospitality: obj.signals?.hospitality,
          humor: obj.signals?.humor,
          conversion: obj.signals?.conversion,
          coherence: obj.signals?.coherence
        },
        evidence: obj.evidence || [],
        uncertainties: obj.uncertainties || []
      } as VideoBrandObservationV1
    }
    
    // If we can't salvage anything, re-throw
    throw error
  }
}
