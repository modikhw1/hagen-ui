/**
 * Types for Analyze Rate V1.1
 * 
 * Centralized type definitions for all signal categories
 */

// =============================================================================
// QUALITY RATING
// =============================================================================

export type QualityTier = 'excellent' | 'good' | 'mediocre' | 'bad';

export interface QualityRatingData {
  qualityTier: QualityTier | null;
  notes: string;
}

// =============================================================================
// HUMOR ANALYSIS (from Gemini)
// =============================================================================

export interface HumorAnalysisData {
  humorType: string | null;
  humorMechanism: string | null;
  comedyTiming: number;
  isHumorous: boolean;
}

// =============================================================================
// REPLICABILITY SIGNALS
// =============================================================================

export type ActorCount = 'solo' | 'duo' | 'small_team' | 'large_team';
export type SetupComplexity = 'phone_only' | 'basic_tripod' | 'lighting_setup' | 'full_studio';
export type SkillRequired = 'anyone' | 'basic_editing' | 'intermediate' | 'professional';

export interface ReplicabilityData {
  actorCount: ActorCount | null;
  setupComplexity: SetupComplexity | null;
  skillRequired: SkillRequired | null;
  equipmentNeeded: string[];
  notes: string;
}

// =============================================================================
// ENVIRONMENT SIGNALS
// =============================================================================

export type SettingType = 'indoor' | 'outdoor' | 'kitchen' | 'bar' | 'storefront' | 'dining_room' | 'mixed';
export type SpaceRequirements = 'minimal' | 'moderate' | 'spacious';
export type LightingConditions = 'natural' | 'artificial' | 'low_light' | 'flexible';

export interface EnvironmentData {
  settingType: SettingType | null;
  spaceRequirements: SpaceRequirements | null;
  lightingConditions: LightingConditions | null;
  customerVisibility: string | null;
}

// =============================================================================
// RISK LEVEL SIGNALS
// =============================================================================

export type ContentEdge = 'brand_safe' | 'mildly_edgy' | 'edgy' | 'provocative';
export type HumorRisk = 'safe_humor' | 'playful' | 'sarcastic' | 'dark_humor';

export interface RiskLevelData {
  contentEdge: ContentEdge | null;
  humorRisk: HumorRisk | null;
  trendReliance: string | null;
}

// =============================================================================
// TARGET AUDIENCE SIGNALS
// =============================================================================

export type AgeRange = 'gen_z' | 'millennial' | 'gen_x' | 'boomer' | 'broad';
export type IncomeLevel = 'budget' | 'mid_range' | 'upscale' | 'luxury' | 'broad';
export type LifestyleTag = 
  | 'foodies' 
  | 'families' 
  | 'date_night' 
  | 'business' 
  | 'tourists' 
  | 'locals' 
  | 'health_conscious' 
  | 'indulgent' 
  | 'social_media_active' 
  | 'adventurous' 
  | 'comfort_seeking' 
  | 'trend_followers';
export type VibeAlignment = 
  | 'trendy' 
  | 'classic' 
  | 'family_friendly' 
  | 'upscale_casual' 
  | 'dive_authentic' 
  | 'instagram_worthy' 
  | 'neighborhood_gem' 
  | 'hidden_gem';

export interface TargetAudienceData {
  primaryAges: AgeRange[];
  incomeLevel: IncomeLevel | null;
  lifestyleTags: LifestyleTag[];
  vibeAlignments: VibeAlignment[];
}

// =============================================================================
// COMBINED SIGNALS (for API submission)
// =============================================================================

export interface CombinedSignals {
  quality: QualityRatingData;
  replicability: ReplicabilityData;
  environment: EnvironmentData;
  riskLevel: RiskLevelData;
  targetAudience: TargetAudienceData;
  analysisNotes: string;
}

// =============================================================================
// GEMINI ANALYSIS STRUCTURE
// =============================================================================

export interface GeminiAnalysis {
  script?: {
    structure?: {
      hook?: string;
      setup?: string;
      payoff?: string;
      payoffType?: string;
      payoffStrength?: number;
    };
    humor?: {
      humorType?: string;
      humorMechanism?: string;
      isHumorous?: boolean;
      comedyTiming?: number;
    };
    originality?: {
      score?: number;
      novelElements?: string[];
    };
    replicability?: {
      score?: number;
      template?: string;
      requiredElements?: string[];
    };
  };
  visual?: {
    hookStrength?: number;
    overallQuality?: number;
    summary?: string;
  };
  technical?: {
    pacing?: number;
  };
  engagement?: {
    replayValue?: number;
    shareability?: number;
    attentionRetention?: number;
  };
  content?: {
    keyMessage?: string;
    emotionalTone?: string;
  };
  schema_v1_signals?: SchemaV1Signals;
  raw_output?: {
    signals?: SchemaV1Signals;
  };
  signals?: SchemaV1Signals;
  [key: string]: unknown;
}

export interface SchemaV1Signals {
  replicability?: {
    actor_count?: string;
    setup_complexity?: string;
    skill_required?: string;
    equipment_needed?: string[];
  };
  environment_requirements?: {
    setting_type?: string;
    space_requirements?: string;
    lighting_conditions?: string;
  };
  risk_level?: {
    content_edge?: string;
    humor_risk?: string;
  };
  target_audience?: {
    age_range?: {
      primary?: string;
      secondary?: string;
    };
    income_level?: string;
    lifestyle_tags?: string[];
    vibe_alignment?: string | string[];
  };
}

export interface RAGReference {
  title: string;
  score: number;
  similarity: number;
}

export interface ApiResponse {
  success: boolean;
  url: string;
  analysis: GeminiAnalysis;
  rag_context: {
    similar_count: number;
    references: RAGReference[];
  };
}
