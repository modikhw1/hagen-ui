/**
 * Signal Types for Video Analysis
 * 
 * These types define the structure of signals extracted from Gemini analysis.
 * IMPORTANT: When adding new signals, update:
 * 1. This file (types)
 * 2. SignalExtractor (extraction logic)
 * 3. docs/ARCHITECTURE_REGISTRY.md (schema version history)
 */

// =============================================================================
// SCHEMA VERSIONS
// =============================================================================

export type SchemaVersion = 'v1.0' | 'v1.1' | 'v1.1-sigma';

export const CURRENT_SCHEMA_VERSION: SchemaVersion = 'v1.1-sigma';

// =============================================================================
// V1.0 SIGNALS (Original)
// =============================================================================

export interface V1_0_Signals {
  // Core style signals
  pacing?: number;              // 1-10, slow to fast
  humor?: number;               // 1-10, serious to comedic
  teaching_style?: number;      // 1-10, casual to structured
  
  // Content type
  content_type?: string;        // 'educational', 'entertainment', 'promotional', etc.
  
  // Basic audience
  target_age_group?: string;    // 'gen-z', 'millennial', 'gen-x', etc.
}

// =============================================================================
// V1.1 SIGNALS (Extended)
// =============================================================================

export interface ContentDensitySignals {
  information_rate?: number;    // 1-10, sparse to dense
  concept_complexity?: number;  // 1-10, simple to complex
  visual_density?: number;      // 1-10, minimal to packed
}

export interface ProductionQualitySignals {
  production_value?: number;    // 1-10, lo-fi to high production
  editing_style?: number;       // 1-10, raw to polished
  audio_quality?: number;       // 1-10, amateur to professional
  visual_effects?: number;      // 1-10, none to heavy
}

export interface ReplicabilitySignals {
  equipment_requirements?: number;  // 1-10, phone only to studio
  skill_requirements?: number;      // 1-10, beginner to expert
  time_investment?: number;         // 1-10, quick to extensive
  budget_requirements?: number;     // 1-10, free to expensive
}

export interface AudienceSignals {
  primary_ages?: string[];      // ['18-24', '25-34', etc.]
  vibe_alignments?: string[];   // ['educational', 'entertaining', etc.]
  engagement_style?: string;    // 'passive', 'interactive', 'community'
  niche_specificity?: number;   // 1-10, broad to niche
}

export interface V1_1_Signals extends V1_0_Signals {
  content_density_signals?: ContentDensitySignals;
  production_quality_signals?: ProductionQualitySignals;
  replicability_signals?: ReplicabilitySignals;
  audience_signals?: AudienceSignals;
}

// =============================================================================
// V1.1-SIGMA SIGNALS (σTaste Schema from hagen_ta)
// =============================================================================

// STAGE 1: Content Classification
export interface ContentClassification {
  content_type: 
    | 'sketch_comedy' 
    | 'reaction_content'
    | 'informational'
    | 'interview_format'
    | 'montage_visual'
    | 'tutorial_how_to'
    | 'testimonial'
    | 'promotional_direct'
    | 'trend_recreation'
    | 'hybrid';
  service_relevance: 'in_scope' | 'out_of_scope' | 'edge_case';
  classification_reasoning?: string;
  strata_id?: 
    | 'hospitality_sketch'
    | 'workplace_relatable'
    | 'customer_interaction'
    | 'product_showcase'
    | 'atmosphere_vibe';
}

// STAGE 2: Replicability Decomposed
export interface ReplicabilityDecomposed {
  one_to_one_copy_feasibility: {
    score: 1 | 2 | 3;
    reasoning: string;
    required_adaptations?: string[];
  };
  actor_requirements: {
    count: 'solo' | 'duo' | 'small_group' | 'crowd';
    skill_level: 'anyone' | 'comfortable_on_camera' | 'acting_required' | 'professional';
    social_risk_required: 'none' | 'mild' | 'significant' | 'extreme';
    appearance_dependency?: 'none' | 'low' | 'moderate' | 'high';
  };
  environment_requirements: {
    backdrop_interchangeability: 'any_venue' | 'similar_venue_type' | 'specific_setting_needed';
    prop_dependency: {
      level: 'none' | 'common_items' | 'specific_props' | 'custom_fabrication';
      items?: string[];
      substitutable?: boolean;
    };
    setup_complexity: 'point_and_shoot' | 'basic_tripod' | 'multi_location' | 'elaborate_staging';
  };
  production_requirements: {
    editing_skill: 'basic_cuts' | 'timed_edits' | 'effects_required' | 'professional_post';
    editing_as_punchline: boolean;
    estimated_time: 'under_15min' | 'under_1hr' | 'half_day' | 'full_day_plus';
  };
  concept_transferability: {
    product_swappable: boolean;
    humor_travels: boolean;
    audience_narrowing_factors?: string[];
  };
}

// STAGE 3: Narrative Flow
export interface NarrativeFlow {
  story_direction: 'linear_build' | 'escalating' | 'revelation_based' | 'circular' | 'fragmented';
  beat_progression: {
    type: 'incremental_heightening' | 'steady_examples' | 'dialogue_escalation' | 'visual_accumulation';
    additive_per_beat: boolean;
    filler_detected: boolean;
  };
  momentum_type: 'building_to_climax' | 'steady_stream' | 'single_beat_payoff' | 'no_clear_structure';
  coherence_score: 1 | 2 | 3 | 4 | 5;
  coherence_notes?: string;
}

// STAGE 3: Performer Execution
export interface PerformerExecution {
  concept_selling: {
    score: 1 | 2 | 3 | 4 | 5;
    persona_clarity: 'clear_character' | 'ambiguous' | 'just_themselves';
  };
  tonal_match: {
    matches_content: boolean;
    mismatch_notes?: string;
  };
  commitment_signals: {
    facial_expressiveness: 'minimal' | 'appropriate' | 'highly_animated';
    physical_commitment: 'static' | 'moderate_movement' | 'full_physical_comedy';
    embarrassment_tolerance: 'safe_performance' | 'mild_vulnerability' | 'full_commitment';
  };
  performance_dependency: 'concept_carries_itself' | 'good_delivery_helps' | 'requires_strong_performer';
}

// STAGE 3: Hook Analysis (Replaces simple hookStrength)
export interface HookAnalysis {
  hook_style: 'relatable_situation' | 'question' | 'action' | 'visual_intrigue' | 'text_overlay' | 'sound_grab';
  desperation_signals: {
    detected: boolean;
    signals?: Array<
      | 'excessive_text_first_second'
      | 'entire_premise_in_hook'
      | 'clickbait_promise'
      | 'overexplained_setup'
      | 'loud_attention_grab'
    >;
  };
  promise_quality: {
    curiosity_generated: 1 | 2 | 3 | 4 | 5;
    promise_fulfilled: boolean;
    allows_slow_burn: boolean;
  };
  emotional_undertone?: string[];
}

// STAGE 3: Payoff Analysis
export interface PayoffAnalysis {
  payoff_type: 'visual_reveal' | 'edit_cut' | 'dialogue_delivery' | 'twist' | 'callback' | 'escalation_peak';
  closure_quality: {
    meaningful_ending: boolean;
    feels_empty: boolean;
    earned_vs_cheap: 'fully_earned' | 'somewhat_earned' | 'cheap_shortcut' | 'no_real_payoff';
  };
  surprise_fit: {
    predictability: 'completely_obvious' | 'somewhat_expected' | 'pleasant_surprise' | 'total_twist';
    logical_in_hindsight: boolean;
  };
  trope_handling: {
    uses_known_trope: boolean;
    trope_name?: string;
    trope_treatment: 'subverted_cleverly' | 'played_straight_well' | 'lazy_execution';
  };
  substance_level: {
    content_type: 'empty_calories' | 'moderate_substance' | 'genuinely_clever';
    memorability: 1 | 2 | 3 | 4 | 5;
  };
}

// STAGE 3: Production Polish
export interface ProductionPolish {
  audio_intentionality: {
    purposeful: boolean;
    elements_aligned: boolean;
    comedic_audio_timing: 'perfect' | 'good' | 'off' | 'none';
  };
  visual_intentionality: {
    purposeful_framing: boolean;
    quality_consistency: boolean;
    lighting_appropriate: boolean;
  };
  polish_composite: {
    score: 1 | 2 | 3 | 4 | 5;
    elevating_factors?: string[];
    detracting_factors?: string[];
  };
  cuts_per_minute?: number;
  pacing_feel: 'rushed' | 'snappy' | 'comfortable' | 'slow' | 'dragging';
}

// Scene Breakdown (preserved from v1.0)
export interface SceneBreakdown {
  sceneBreakdown: Array<{
    sceneNumber: number;
    timestamp: string;
    duration: string;
    visualContent: string;
    audioContent: string;
    impliedMeaning?: string;
    viewerAssumption?: string;
    narrativeFunction: 'hook' | 'setup' | 'development' | 'misdirection' | 'payoff' | 'tag';
    editSignificance?: string;
  }>;
  editAsPunchline?: boolean;
  editPunchlineExplanation?: string;
  misdirectionTechnique?: string;
}

// Top-level σTaste v1.1 Schema
export interface SigmaTasteV1_1 {
  schema_version: 'v1.1-sigma';
  
  // STAGE 1: Classification (Soft filter per user request)
  content_classification: ContentClassification;
  
  // STAGE 2: Utility
  replicability_decomposed: ReplicabilityDecomposed;
  
  // STAGE 3: Quality
  narrative_flow: NarrativeFlow;
  performer_execution: PerformerExecution;
  hook_analysis: HookAnalysis;
  payoff_analysis: PayoffAnalysis;
  production_polish: ProductionPolish;
  
  // Preserved from v1.0
  scenes?: SceneBreakdown;
  
  // Computed composites (calculated from signals)
  utility_score?: number;  // 0-1, from Stage 2
  quality_score?: number;  // 0-1, from Stage 3  
  sigma_taste_final?: number;  // Weighted combination
}

// V1.1-Sigma Signals extends V1.1 with σTaste schema
export interface V1_1_Sigma_Signals extends V1_1_Signals {
  sigma_taste?: SigmaTasteV1_1;
}

// =============================================================================
// UNIFIED SIGNAL TYPE
// =============================================================================

export interface VideoSignals extends V1_1_Sigma_Signals {
  // Schema tracking
  schema_version: SchemaVersion;
  
  // Extraction metadata
  extracted_at?: string;        // ISO timestamp
  extraction_source?: 'gemini' | 'manual' | 'migration';
  extraction_confidence?: number;  // 0-1
}

// =============================================================================
// DATABASE RECORD TYPES
// =============================================================================

export interface VideoSignalRecord {
  id: string;
  video_id: string;
  brand_id?: string | null;
  schema_version: SchemaVersion;
  extracted: VideoSignals;
  human_overrides?: Partial<VideoSignals>;
  rating?: number;
  rating_confidence?: 'low' | 'medium' | 'high';
  notes?: string;
  embedding?: number[];
  fingerprint?: VideoFingerprint;
  source: 'manual' | 'ai' | 'migration';
  created_at: string;
  updated_at: string;
}

export interface VideoInsightRecord {
  id: string;
  video_id: string;
  gemini_insights?: Record<string, unknown>;
  youtube_metadata?: YouTubeMetadata;
  transcript?: string;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// FINGERPRINT TYPES
// =============================================================================

export interface VideoFingerprint {
  // Normalized scores (0-1)
  pacing_normalized: number;
  humor_normalized: number;
  teaching_style_normalized: number;
  production_value_normalized: number;
  information_density_normalized: number;
  
  // Categorical
  content_type: string;
  primary_audience: string[];
  vibe_tags: string[];
  
  // Metadata
  computed_at: string;
  signal_coverage: number;  // 0-1, how many signals were available
}

export interface BrandFingerprint {
  id: string;
  brand_id: string;
  
  // Aggregated fingerprint
  aggregated: {
    pacing: { mean: number; std: number };
    humor: { mean: number; std: number };
    teaching_style: { mean: number; std: number };
    production_value: { mean: number; std: number };
    information_density: { mean: number; std: number };
  };
  
  // Categorical distributions
  content_types: Record<string, number>;  // { 'educational': 0.6, 'entertainment': 0.4 }
  audience_ages: Record<string, number>;
  vibes: Record<string, number>;
  
  // Metadata
  video_count: number;
  computed_at: string;
  confidence: number;  // Based on video_count and signal coverage
}

// =============================================================================
// YOUTUBE METADATA
// =============================================================================

export interface YouTubeMetadata {
  title?: string;
  description?: string;
  channel_name?: string;
  channel_id?: string;
  published_at?: string;
  duration_seconds?: number;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  tags?: string[];
  category_id?: string;
}

// =============================================================================
// EXTRACTION INPUT/OUTPUT
// =============================================================================

export interface ExtractionInput {
  visual_analysis: Record<string, unknown>;  // Raw Gemini output
  youtube_metadata?: YouTubeMetadata;
  schema_version?: SchemaVersion;
}

export interface ExtractionResult {
  success: boolean;
  signals?: VideoSignals;
  errors?: string[];
  warnings?: string[];
  coverage: number;  // 0-1, how many signals were successfully extracted
}

// =============================================================================
// HELPER TYPES
// =============================================================================

export type SignalKey = keyof VideoSignals;

export type NumericSignalKey = {
  [K in keyof VideoSignals]: VideoSignals[K] extends number | undefined ? K : never;
}[keyof VideoSignals];

export interface SignalDefinition {
  key: SignalKey;
  label: string;
  description: string;
  type: 'number' | 'string' | 'array' | 'object';
  range?: { min: number; max: number };
  options?: string[];
  required: boolean;
  version_added: SchemaVersion;
}

// =============================================================================
// SIGNAL DEFINITIONS REGISTRY
// =============================================================================

export const SIGNAL_DEFINITIONS: SignalDefinition[] = [
  // V1.0 signals
  { key: 'pacing', label: 'Pacing', description: 'Video pace from slow to fast', type: 'number', range: { min: 1, max: 10 }, required: false, version_added: 'v1.0' },
  { key: 'humor', label: 'Humor', description: 'Humor level from serious to comedic', type: 'number', range: { min: 1, max: 10 }, required: false, version_added: 'v1.0' },
  { key: 'teaching_style', label: 'Teaching Style', description: 'Style from casual to structured', type: 'number', range: { min: 1, max: 10 }, required: false, version_added: 'v1.0' },
  { key: 'content_type', label: 'Content Type', description: 'Primary content category', type: 'string', options: ['educational', 'entertainment', 'promotional', 'inspirational', 'news', 'tutorial', 'review', 'vlog', 'other'], required: false, version_added: 'v1.0' },
  { key: 'target_age_group', label: 'Target Age', description: 'Primary target age group', type: 'string', options: ['gen-z', 'millennial', 'gen-x', 'boomer', 'all'], required: false, version_added: 'v1.0' },
  
  // V1.1 signals (nested - registered as parent objects)
  { key: 'content_density_signals', label: 'Content Density', description: 'Signals about information density', type: 'object', required: false, version_added: 'v1.1' },
  { key: 'production_quality_signals', label: 'Production Quality', description: 'Signals about production value', type: 'object', required: false, version_added: 'v1.1' },
  { key: 'replicability_signals', label: 'Replicability', description: 'Signals about how easy to replicate', type: 'object', required: false, version_added: 'v1.1' },
  { key: 'audience_signals', label: 'Audience', description: 'Signals about target audience', type: 'object', required: false, version_added: 'v1.1' },
  
  // V1.1-sigma signals (σTaste schema from hagen_ta)
  { key: 'sigma_taste', label: 'σTaste Analysis', description: 'Complete σTaste v1.1 analysis from hagen_ta schema', type: 'object', required: false, version_added: 'v1.1' },
];
