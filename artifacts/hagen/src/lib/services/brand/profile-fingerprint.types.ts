/**
 * Profile Fingerprint Types
 *
 * A profile fingerprint is a multi-layer representation of a brand's content identity.
 * Layer weights prioritize: Quality > Personality > Production
 * 
 * v2.0 - Dec 2025: Split L1 into Service Fit + Execution Quality, expanded L2 sub-dimensions
 */

/** Layer 1: Quality - Split into Service Fit and Execution Quality */
export interface L1QualityLayer {
  // L1a: Service Fit - How useful is this style for our service?
  avg_service_fit: number;           // 0-1, from /analyze-rate overall_score
  
  // L1b: Execution Quality - How well-executed, regardless of style?
  avg_execution_quality: number;     // 0-1, computed from execution signals
  avg_execution_coherence: number;   // 0-1, from Schema v1
  avg_distinctiveness: number;       // 0-1, from Schema v1
  avg_confidence: number;            // 0-1, normalized from personality.confidence_1_10
  avg_message_alignment: number;     // 0-1, from coherence.personality_message_alignment
  
  // Legacy field for backwards compatibility
  avg_quality_score: number;         // 0-1, alias for avg_service_fit
}

/** Layer 2: Personality - Expanded with sub-dimensions */
export interface L2LikenessLayer {
  // 2a: Tone (numeric averages, 1-10)
  avg_energy: number;
  avg_warmth: number;
  avg_formality: number;
  avg_self_seriousness: number;      // NEW: playful vs serious
  avg_confidence: number;            // NEW: delivery confidence
  
  // 2b: Humor Profile
  dominant_humor_types: string[];
  dominant_age_code: 'younger' | 'older' | 'balanced' | 'mixed';
  dominant_humor_target: string | null;    // NEW: self/customer/situation/etc
  dominant_meanness_risk: 'low' | 'medium' | 'high' | 'unknown' | null;  // NEW
  
  // 2c: Positioning
  dominant_accessibility: 'everyman' | 'aspirational' | 'exclusive' | 'elite' | 'mixed' | null;  // NEW
  dominant_price_tier: 'budget' | 'mid' | 'premium' | 'luxury' | 'mixed';
  dominant_edginess: 'safe' | 'mild' | 'moderate' | 'edgy' | 'provocative' | 'mixed' | null;  // NEW
  dominant_vibe: string[];
  dominant_occasion: string[];       // NEW: date night, casual, etc
  
  // 2d: Intent & Messaging
  dominant_intent: string | null;
  dominant_cta_types: string[];      // NEW: follow_for_series, visit_in_store, etc
  collected_subtext: string[];       // NEW: underlying themes
  collected_audiences: string[];     // NEW: apparent_audience values
  
  // 2e: Character Traits
  dominant_traits: string[];         // NEW: from traits_observed
  dominant_service_ethos: string[];  // NEW: hospitality service philosophy
}

/** Layer 3: Production DNA - Expanded */
export interface L3VisualLayer {
  avg_production_investment: number; // 1-10
  avg_effortlessness: number;        // 1-10
  avg_intentionality: number;        // 1-10
  avg_social_permission: number;     // NEW: 1-10, shareability
  
  // Format consistency
  has_repeatable_format_pct: number; // NEW: 0-1, % of videos with repeatable format
  collected_format_names: string[];  // NEW: format identifiers found
}

/** Complete profile fingerprint */
export interface ProfileFingerprint {
  profile_id: string;
  profile_name?: string;
  video_ids: string[];
  video_count: number;
  computed_at: string;

  /** Weighted centroid embedding (1536-dim OpenAI) */
  embedding: number[];

  /** Per-video weights used in centroid computation */
  video_weights: Record<string, number>;

  /** Layer breakdowns for interpretability */
  layers: {
    l1_quality: L1QualityLayer;
    l2_likeness: L2LikenessLayer;
    l3_visual: L3VisualLayer;
  };

  /** Confidence based on data completeness */
  confidence: number; // 0-1
  missing_data_notes: string[];

  /** URLs that were requested but not found in the database */
  urls_not_found: string[];

  /** URLs that were found */
  urls_found: string[];

  /** Generated text summary of the profile personality (optional) */
  personality_summary?: string;
}

/** Input for fingerprint computation */
export interface FingerprintInput {
  profile_id?: string;
  profile_name?: string;
  video_urls: string[];
}

/** Match result when comparing a video to a profile fingerprint */
export interface MatchResult {
  candidate_video_id: string;
  profile_id: string;

  /** Overall match score (target ≥ 0.85) */
  overall_match: number; // 0-1

  /** Per-layer breakdown */
  layer_scores: {
    l1_quality_compatible: number;  // 0-1, is quality level appropriate?
    l2_likeness_match: number;      // 0-1, personality/tone alignment
    l3_visual_proximity: number;    // 0-1, production value similarity
    embedding_similarity: number;   // 0-1, raw cosine similarity
  };

  /** Closest video in profile to this candidate */
  closest_video_id: string | null;
  closest_similarity: number;

  /** Furthest video in profile (sanity check) */
  furthest_video_id: string | null;
  furthest_similarity: number;

  /** Human-readable explanation */
  explanation: string;
}

/** Stored profile with fingerprint */
export interface StoredProfile {
  id: string;
  name: string;
  fingerprint: ProfileFingerprint;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// NEW v1.1: Separated Fingerprint Types + Supporting Schemas
// =============================================================================

/** Replicability Score - How easily can this content be recreated? */
export interface ReplicabilityScore {
  actor_count: 'solo' | 'duo' | 'small_team' | 'large_team' | null;
  setup_complexity: 'phone_only' | 'basic_tripod' | 'lighting_setup' | 'full_studio' | null;
  skill_required: 'anyone' | 'basic_editing' | 'intermediate' | 'professional' | null;
  environment_dependency: 'anywhere' | 'specific_indoor' | 'specific_outdoor' | 'venue_required' | null;
  equipment_needed: string[];
  estimated_time: 'under_1hr' | '1_4hrs' | 'half_day' | 'full_day' | null;
  /** Computed 0-1 feasibility score */
  feasibility_score: number;
}

/** Risk Level - How brand-safe or edgy is the content? */
export interface RiskLevel {
  content_edge: 'brand_safe' | 'mildly_edgy' | 'edgy' | 'provocative' | null;
  humor_risk: 'safe_humor' | 'playful' | 'sarcastic' | 'dark_humor' | null;
  trend_reliance: 'evergreen' | 'light_trends' | 'trend_dependent' | null;
  controversy_potential: 'none' | 'low' | 'moderate' | 'high' | null;
  /** Computed 0-1 overall risk score (higher = riskier) */
  overall_risk_score: number;
}

/** Environment Requirements - What physical setting is needed? */
export interface EnvironmentRequirements {
  setting_type: 'indoor' | 'outdoor' | 'kitchen' | 'bar' | 'storefront' | 'dining_room' | 'mixed' | null;
  space_requirements: 'minimal' | 'moderate' | 'spacious' | null;
  lighting_conditions: 'natural' | 'artificial' | 'low_light' | 'flexible' | null;
  noise_tolerance: 'quiet_needed' | 'moderate_ok' | 'noisy_ok' | null;
  customer_visibility: 'no_customers' | 'background' | 'featured' | null;
}

/** Expanded Target Audience Signals from video analysis */
export interface AudienceSignals {
  age_primary: 'gen_z' | 'millennial' | 'gen_x' | 'boomer' | 'broad' | null;
  age_secondary: 'gen_z' | 'millennial' | 'gen_x' | 'boomer' | 'none' | null;
  income_level: 'budget' | 'mid_range' | 'upscale' | 'luxury' | 'broad' | null;
  lifestyle_tags: string[];
  primary_occasion: string | null;
  vibe_alignment: string | null;
}

/** Tone Profile extracted from video */
export interface ToneProfile {
  energy: number | null;           // 1-10
  warmth: number | null;           // 1-10
  formality: number | null;        // 1-10
  self_seriousness: number | null; // 1-10
  humor_present: boolean;
  humor_types: string[];
  humor_target: string | null;
  meanness_risk: string | null;
}

/** Content format classification */
export interface ContentFormat {
  primary_intent: string | null;
  has_repeatable_format: boolean;
  format_name: string | null;
  cta_types: string[];
}

// =============================================================================
// VIDEO FINGERPRINT - What the video IS (objective characteristics)
// =============================================================================

/** 
 * VideoFingerprint: Objective representation of a single video
 * Used for marketplace cataloging - what patterns does this video exhibit?
 */
export interface VideoFingerprint {
  video_id: string;
  video_url?: string;
  computed_at: string;

  /** Content format classification */
  format: ContentFormat;

  /** Replicability assessment */
  replicability: ReplicabilityScore;

  /** Target audience signals (who this appeals to) */
  audience_signals: AudienceSignals;

  /** Tone and personality profile */
  tone_profile: ToneProfile;

  /** Physical environment requirements */
  environment_requirements: EnvironmentRequirements;

  /** Risk level assessment */
  risk_level: RiskLevel;

  /** Quality baseline (for aspiration matching) */
  quality_baseline: {
    execution_quality: number;    // 0-1
    production_investment: number; // 1-10
    distinctiveness: number;       // 0-1
  };

  /** Embedding for similarity search */
  embedding: number[];

  /** Confidence in this fingerprint */
  confidence: number;
}

// =============================================================================
// BRAND FINGERPRINT - What the brand WANTS (preferences & constraints)
// =============================================================================

/** Operational Constraints - What can the brand realistically produce? */
export interface OperationalConstraints {
  team_size_available: 'solo' | 'duo' | 'small_team' | 'large_team';
  equipment_available: string[];
  time_per_video: 'under_1hr' | '1_4hrs' | 'half_day' | 'full_day';
  skill_level: 'anyone' | 'basic_editing' | 'intermediate' | 'professional';
}

/** Environment Availability - What settings does the brand have access to? */
export interface EnvironmentAvailability {
  available_settings: ('kitchen' | 'dining_room' | 'bar' | 'storefront' | 'outdoor' | 'offsite')[];
  space_available: 'minimal' | 'moderate' | 'spacious';
  lighting_situation: 'natural' | 'artificial' | 'mixed';
  noise_level: 'quiet' | 'moderate' | 'noisy';
  can_feature_customers: boolean;
}

/** Target Audience Definition - Who does the brand want to reach? */
export interface TargetAudienceDefinition {
  age_primary: 'gen_z' | 'millennial' | 'gen_x' | 'boomer' | 'broad';
  age_secondary?: 'gen_z' | 'millennial' | 'gen_x' | 'boomer' | 'none';
  income_level: 'budget' | 'mid_range' | 'upscale' | 'luxury' | 'broad';
  lifestyle_tags: string[];
  primary_occasion: string;
  vibe: string;
}

/** Tone Preferences - What voice does the brand want? */
export interface TonePreferences {
  humor_level: 'none' | 'light' | 'moderate' | 'heavy';
  energy_preference: 'calm' | 'moderate' | 'high';
  formality_preference: 'casual' | 'balanced' | 'professional';
  warmth_preference: 'cool' | 'neutral' | 'warm';
}

/** Risk Tolerance - How edgy will the brand go? */
export interface RiskTolerance {
  max_content_edge: 'brand_safe' | 'mildly_edgy' | 'edgy' | 'provocative';
  humor_risk_ok: 'safe_humor' | 'playful' | 'sarcastic' | 'dark_humor';
  trend_following: 'evergreen_only' | 'light_trends' | 'trend_forward';
}

/** Ambition Level - What quality does the brand aspire to? */
export interface AmbitionLevel {
  current_quality: 'low' | 'medium' | 'high';
  aspiration: 'match_current' | 'level_up' | 'aspirational';
  production_target: 'phone_only' | 'basic' | 'polished' | 'professional';
}

/** 
 * BrandFingerprint: What the brand wants from content
 * Used for customer matching - what are their preferences and constraints?
 */
export interface BrandFingerprint {
  brand_id: string;
  brand_name: string;
  computed_at: string;

  /** Who the brand wants to reach */
  target_audience: TargetAudienceDefinition;

  /** What the brand can realistically produce */
  operational_constraints: OperationalConstraints;

  /** What settings the brand has access to */
  environment_availability: EnvironmentAvailability;

  /** What voice/tone the brand wants */
  tone_preferences: TonePreferences;

  /** How edgy the brand is willing to go */
  risk_tolerance: RiskTolerance;

  /** Quality aspirations */
  ambition_level: AmbitionLevel;

  /** Aggregated embedding from brand's existing content (if any) */
  content_embedding?: number[];

  /** Narrative summary from brand profiling */
  narrative_summary?: string;

  /** Confidence in this fingerprint */
  confidence: number;
}

// =============================================================================
// MATCHING TYPES
// =============================================================================

/** Hard filter result - binary pass/fail with reason */
export interface HardFilterResult {
  passed: boolean;
  filter_name: string;
  reason: string;
}

/** Soft score component with explanation */
export interface SoftScoreComponent {
  name: string;
  score: number;       // 0-1
  weight: number;      // Weight used in final calculation
  explanation: string;
}

/** Enhanced match result with filters and explanations */
export interface EnhancedMatchResult {
  video_id: string;
  brand_id: string;

  /** Did video pass all hard filters? */
  passes_filters: boolean;
  filter_results: HardFilterResult[];

  /** Soft score components (only meaningful if passes_filters) */
  soft_scores: SoftScoreComponent[];

  /** Overall match score (0-1, only meaningful if passes_filters) */
  overall_score: number;

  /** Human-readable explanation */
  explanation: string;

  /** Quick summary for UI */
  match_summary: {
    audience_fit: number;
    tone_match: number;
    format_fit: number;
    aspiration_alignment: number;
  };
}
