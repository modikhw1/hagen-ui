import { useState, useCallback } from 'react';
import {
  QualityRatingData,
  ReplicabilityData,
  EnvironmentData,
  RiskLevelData,
  TargetAudienceData,
  CombinedSignals,
  GeminiAnalysis,
  AgeRange,
  ActorCount,
  SetupComplexity,
  SkillRequired,
  SettingType,
  SpaceRequirements,
  LightingConditions,
  ContentEdge,
  HumorRisk,
  IncomeLevel,
  LifestyleTag,
  VibeAlignment
} from './types';

// =============================================================================
// INITIAL STATE FACTORIES
// =============================================================================

export const createInitialQualityRating = (): QualityRatingData => ({
  qualityTier: null,
  notes: ''
});

export const createInitialReplicability = (): ReplicabilityData => ({
  actorCount: null,
  setupComplexity: null,
  skillRequired: null,
  equipmentNeeded: [],
  notes: ''
});

export const createInitialEnvironment = (): EnvironmentData => ({
  settingType: null,
  spaceRequirements: null,
  lightingConditions: null,
  customerVisibility: null
});

export const createInitialRiskLevel = (): RiskLevelData => ({
  contentEdge: null,
  humorRisk: null,
  trendReliance: null
});

export const createInitialTargetAudience = (): TargetAudienceData => ({
  primaryAges: [],
  incomeLevel: null,
  lifestyleTags: [],
  vibeAlignments: []
});

// =============================================================================
// SIGNAL STATE HOOK
// =============================================================================

export function useSignalState() {
  // Quality rating
  const [qualityRating, setQualityRating] = useState<QualityRatingData>(createInitialQualityRating());
  
  // Replicability
  const [replicability, setReplicability] = useState<ReplicabilityData>(createInitialReplicability());
  
  // Environment
  const [environment, setEnvironment] = useState<EnvironmentData>(createInitialEnvironment());
  
  // Risk level
  const [riskLevel, setRiskLevel] = useState<RiskLevelData>(createInitialRiskLevel());
  
  // Target audience
  const [targetAudience, setTargetAudience] = useState<TargetAudienceData>(createInitialTargetAudience());
  
  // Analysis notes/corrections
  const [analysisNotes, setAnalysisNotes] = useState('');

  // Reset all signals to initial state
  const resetAllSignals = useCallback(() => {
    setQualityRating(createInitialQualityRating());
    setReplicability(createInitialReplicability());
    setEnvironment(createInitialEnvironment());
    setRiskLevel(createInitialRiskLevel());
    setTargetAudience(createInitialTargetAudience());
    setAnalysisNotes('');
  }, []);

  // Get combined signals for API submission
  const getCombinedSignals = useCallback((): CombinedSignals => ({
    quality: qualityRating,
    replicability,
    environment,
    riskLevel,
    targetAudience,
    analysisNotes
  }), [qualityRating, replicability, environment, riskLevel, targetAudience, analysisNotes]);

  return {
    // State
    qualityRating,
    replicability,
    environment,
    riskLevel,
    targetAudience,
    analysisNotes,
    
    // Setters
    setQualityRating,
    setReplicability,
    setEnvironment,
    setRiskLevel,
    setTargetAudience,
    setAnalysisNotes,
    
    // Utilities
    resetAllSignals,
    getCombinedSignals
  };
}

// =============================================================================
// PRE-POPULATION FROM GEMINI ANALYSIS
// =============================================================================

export function populateFromGeminiAnalysis(
  analysis: GeminiAnalysis,
  setReplicability: (data: ReplicabilityData) => void,
  setEnvironment: (data: EnvironmentData) => void,
  setRiskLevel: (data: RiskLevelData) => void,
  setTargetAudience: (data: TargetAudienceData) => void
) {
  // Check for Schema v1.1 signals in multiple possible locations
  const signals = analysis.schema_v1_signals 
    || analysis.raw_output?.signals 
    || analysis.signals;
  
  console.log('🔍 Pre-population check:', {
    hasSchemaV1Signals: !!analysis.schema_v1_signals,
    hasRawOutputSignals: !!analysis.raw_output?.signals,
    hasSignals: !!analysis.signals,
    hasLegacyReplicability: !!analysis.script?.replicability,
    analysisKeys: Object.keys(analysis)
  });

  if (signals) {
    console.log('📊 Found Schema v1.1 signals:', {
      replicability: signals.replicability,
      risk_level: signals.risk_level,
      environment_requirements: signals.environment_requirements,
      target_audience: signals.target_audience
    });
  }

  // Initialize with defaults
  let replicabilityData = createInitialReplicability();
  let environmentData = createInitialEnvironment();
  let riskLevelData = createInitialRiskLevel();
  let targetAudienceData = createInitialTargetAudience();

  // Pre-populate from Schema v1.1 signals
  if (signals?.replicability) {
    const rep = signals.replicability;
    if (rep.actor_count) replicabilityData.actorCount = rep.actor_count as ActorCount;
    if (rep.setup_complexity) replicabilityData.setupComplexity = rep.setup_complexity as SetupComplexity;
    if (rep.skill_required) replicabilityData.skillRequired = rep.skill_required as SkillRequired;
    if (rep.equipment_needed?.length) replicabilityData.equipmentNeeded = rep.equipment_needed;
  }

  if (signals?.environment_requirements) {
    const env = signals.environment_requirements;
    if (env.setting_type) environmentData.settingType = env.setting_type as SettingType;
    if (env.space_requirements) environmentData.spaceRequirements = env.space_requirements as SpaceRequirements;
    if (env.lighting_conditions) environmentData.lightingConditions = env.lighting_conditions as LightingConditions;
  }

  if (signals?.risk_level) {
    const risk = signals.risk_level;
    if (risk.content_edge) riskLevelData.contentEdge = risk.content_edge as ContentEdge;
    if (risk.humor_risk) riskLevelData.humorRisk = risk.humor_risk as HumorRisk;
  }

  if (signals?.target_audience) {
    const audience = signals.target_audience;
    // Support both single value (from AI) and arrays (from human)
    if (audience.age_range?.primary) {
      const primary = audience.age_range.primary as AgeRange;
      const secondary = audience.age_range?.secondary;
      const ages: AgeRange[] = [primary];
      if (secondary && secondary !== 'none' && ['gen_z', 'millennial', 'gen_x', 'boomer', 'broad'].includes(secondary)) {
        ages.push(secondary as AgeRange);
      }
      targetAudienceData.primaryAges = ages;
    }
    if (audience.income_level) targetAudienceData.incomeLevel = audience.income_level as IncomeLevel;
    if (audience.lifestyle_tags?.length) {
      const validTags = audience.lifestyle_tags.filter((t: string) => 
        ['foodies', 'families', 'date_night', 'business', 'tourists', 'locals', 
         'health_conscious', 'indulgent', 'social_media_active', 'adventurous', 
         'comfort_seeking', 'trend_followers'].includes(t)
      ) as LifestyleTag[];
      if (validTags.length) targetAudienceData.lifestyleTags = validTags;
    }
    if (audience.vibe_alignment) {
      // Support both single value and array
      const vibes = Array.isArray(audience.vibe_alignment) 
        ? audience.vibe_alignment as VibeAlignment[]
        : [audience.vibe_alignment as VibeAlignment];
      targetAudienceData.vibeAlignments = vibes;
    }
  }

  // Fallback: Pre-populate from legacy Gemini script.replicability if present
  const legacyRep = analysis.script?.replicability;
  if (legacyRep) {
    console.log('📜 Found legacy replicability:', legacyRep);
    
    // Infer actor count from template text (only if not already set)
    if (!signals?.replicability?.actor_count) {
      if (legacyRep.requiredElements?.some((e: string) => e.toLowerCase().includes('solo')) 
          || legacyRep.template?.toLowerCase().includes('solo')
          || legacyRep.template?.toLowerCase().includes('one person')) {
        replicabilityData.actorCount = 'solo';
      } else if (legacyRep.template?.toLowerCase().includes('team') 
          || legacyRep.template?.toLowerCase().includes('group')) {
        replicabilityData.actorCount = 'small_team';
      }
    }
    
    // Infer complexity from replicability score (only if not already set)
    if (!signals?.replicability?.setup_complexity && legacyRep.score) {
      if (legacyRep.score >= 8) {
        replicabilityData.skillRequired = replicabilityData.skillRequired || 'anyone';
        replicabilityData.setupComplexity = replicabilityData.setupComplexity || 'phone_only';
      } else if (legacyRep.score >= 6) {
        replicabilityData.skillRequired = replicabilityData.skillRequired || 'basic_editing';
        replicabilityData.setupComplexity = replicabilityData.setupComplexity || 'basic_tripod';
      } else if (legacyRep.score >= 4) {
        replicabilityData.skillRequired = replicabilityData.skillRequired || 'intermediate';
        replicabilityData.setupComplexity = replicabilityData.setupComplexity || 'lighting_setup';
      } else {
        replicabilityData.skillRequired = replicabilityData.skillRequired || 'professional';
        replicabilityData.setupComplexity = replicabilityData.setupComplexity || 'full_studio';
      }
    }
  }

  // Apply the populated data
  setReplicability(replicabilityData);
  setEnvironment(environmentData);
  setRiskLevel(riskLevelData);
  setTargetAudience(targetAudienceData);
}

// =============================================================================
// BUILD API PAYLOAD
// =============================================================================

export function buildApiPayload(
  videoUrl: string,
  signals: CombinedSignals,
  geminiAnalysis: GeminiAnalysis,
  similarVideos: unknown[]
) {
  return {
    video_url: videoUrl,
    quality_tier: signals.quality.qualityTier,
    notes: signals.quality.notes,
    replicability_notes: signals.replicability.notes,
    analysis_notes: signals.analysisNotes,
    gemini_analysis: geminiAnalysis,
    similar_videos: similarVideos,
    
    // v1.1: Complete structured signals
    structured_replicability: {
      actor_count: signals.replicability.actorCount,
      setup_complexity: signals.replicability.setupComplexity,
      skill_required: signals.replicability.skillRequired,
      equipment_needed: signals.replicability.equipmentNeeded,
      estimated_time: null
    },
    risk_level_signals: {
      content_edge: signals.riskLevel.contentEdge,
      humor_risk: signals.riskLevel.humorRisk,
      trend_reliance: signals.riskLevel.trendReliance,
      controversy_potential: null
    },
    environment_signals: {
      setting_type: signals.environment.settingType,
      space_requirements: signals.environment.spaceRequirements,
      lighting_conditions: signals.environment.lightingConditions,
      customer_visibility: signals.environment.customerVisibility,
      noise_tolerance: null
    },
    target_audience_signals: {
      age_range: signals.targetAudience.primaryAges.length > 0 ? { 
        primary: signals.targetAudience.primaryAges[0], 
        secondary: signals.targetAudience.primaryAges[1] || null 
      } : null,
      income_level: signals.targetAudience.incomeLevel,
      lifestyle_tags: signals.targetAudience.lifestyleTags,
      primary_occasion: null,
      vibe_alignment: signals.targetAudience.vibeAlignments.length > 0 
        ? signals.targetAudience.vibeAlignments 
        : null
    }
  };
}
