/**
 * Signal Extractor
 * 
 * Extracts structured signals from raw Gemini analysis output.
 * This is a PURE TRANSFORMATION - no side effects, no database calls.
 * 
 * ARCHITECTURE LAYER: Transforms Layer A (raw) → Layer B (structured)
 */

import {
  VideoSignals,
  ContentDensitySignals,
  ProductionQualitySignals,
  ReplicabilitySignals,
  AudienceSignals,
  SigmaTasteV1_1,
  ContentClassification,
  ReplicabilityDecomposed,
  NarrativeFlow,
  PerformerExecution,
  HookAnalysis,
  PayoffAnalysis,
  ProductionPolish,
  SceneBreakdown,
  ExtractionInput,
  ExtractionResult,
  SchemaVersion,
  CURRENT_SCHEMA_VERSION,
} from './types';

// =============================================================================
// MAIN EXTRACTOR CLASS
// =============================================================================

export class SignalExtractor {
  private version: SchemaVersion;
  private errors: string[] = [];
  private warnings: string[] = [];

  constructor(version: SchemaVersion = CURRENT_SCHEMA_VERSION) {
    this.version = version;
  }

  /**
   * Main extraction method
   */
  extract(input: ExtractionInput): ExtractionResult {
    this.errors = [];
    this.warnings = [];

    const analysis = input.visual_analysis;
    
    if (!analysis || typeof analysis !== 'object') {
      return {
        success: false,
        errors: ['No visual_analysis data provided'],
        warnings: [],
        coverage: 0,
      };
    }

    try {
      const signals = this.extractSignals(analysis);
      const coverage = this.calculateCoverage(signals);

      return {
        success: true,
        signals,
        errors: this.errors,
        warnings: this.warnings,
        coverage,
      };
    } catch (error) {
      return {
        success: false,
        errors: [`Extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: this.warnings,
        coverage: 0,
      };
    }
  }

  /**
   * Extract all signals from Gemini output
   */
  private extractSignals(analysis: Record<string, unknown>): VideoSignals {
    const signals: VideoSignals = {
      schema_version: this.version,
      extracted_at: new Date().toISOString(),
      extraction_source: 'gemini',
    };

    // Try multiple paths for each signal (Gemini output structure varies)
    
    // Core V1.0 signals
    signals.pacing = this.extractNumeric(analysis, ['pacing', 'pace', 'video_pace', 'pacing_score']);
    signals.humor = this.extractNumeric(analysis, ['humor', 'humor_level', 'humor_score', 'comedic_level']);
    signals.teaching_style = this.extractNumeric(analysis, ['teaching_style', 'teachingStyle', 'teaching_approach', 'structure_level']);
    signals.content_type = this.extractString(analysis, ['content_type', 'contentType', 'primary_content_type', 'video_type']);
    signals.target_age_group = this.extractString(analysis, ['target_age_group', 'targetAgeGroup', 'primary_age_group', 'target_demographic']);

    // V1.1 signals
    if (this.version === 'v1.1' || this.version === 'v1.1-sigma') {
      signals.content_density_signals = this.extractContentDensity(analysis);
      signals.production_quality_signals = this.extractProductionQuality(analysis);
      signals.replicability_signals = this.extractReplicability(analysis);
      signals.audience_signals = this.extractAudience(analysis);
    }

    // V1.1-sigma signals (σTaste schema)
    if (this.version === 'v1.1-sigma') {
      signals.sigma_taste = this.extractSigmaTaste(analysis);
    }

    // Clean undefined values
    return this.cleanSignals(signals);
  }

  // =============================================================================
  // NESTED SIGNAL EXTRACTORS
  // =============================================================================

  private extractContentDensity(analysis: Record<string, unknown>): ContentDensitySignals | undefined {
    const nested = this.findNested(analysis, ['content_density_signals', 'contentDensity', 'content_density', 'density']);
    
    const signals: ContentDensitySignals = {
      information_rate: this.extractNumeric(nested || analysis, ['information_rate', 'informationRate', 'info_density', 'information_density']),
      concept_complexity: this.extractNumeric(nested || analysis, ['concept_complexity', 'conceptComplexity', 'complexity', 'complexity_level']),
      visual_density: this.extractNumeric(nested || analysis, ['visual_density', 'visualDensity', 'visual_complexity']),
    };

    return this.hasAnyValue(signals as unknown as Record<string, unknown>) ? signals : undefined;
  }

  private extractProductionQuality(analysis: Record<string, unknown>): ProductionQualitySignals | undefined {
    const nested = this.findNested(analysis, ['production_quality_signals', 'productionQuality', 'production_quality', 'production']);
    
    const signals: ProductionQualitySignals = {
      production_value: this.extractNumeric(nested || analysis, ['production_value', 'productionValue', 'production_level', 'quality_level']),
      editing_style: this.extractNumeric(nested || analysis, ['editing_style', 'editingStyle', 'editing_level', 'edit_polish']),
      audio_quality: this.extractNumeric(nested || analysis, ['audio_quality', 'audioQuality', 'sound_quality']),
      visual_effects: this.extractNumeric(nested || analysis, ['visual_effects', 'visualEffects', 'effects_level', 'vfx_usage']),
    };

    return this.hasAnyValue(signals as unknown as Record<string, unknown>) ? signals : undefined;
  }

  private extractReplicability(analysis: Record<string, unknown>): ReplicabilitySignals | undefined {
    const nested = this.findNested(analysis, ['replicability_signals', 'replicability', 'replication', 'reproducibility']);
    
    const signals: ReplicabilitySignals = {
      equipment_requirements: this.extractNumeric(nested || analysis, ['equipment_requirements', 'equipmentRequirements', 'equipment_level', 'gear_requirements']),
      skill_requirements: this.extractNumeric(nested || analysis, ['skill_requirements', 'skillRequirements', 'skill_level', 'expertise_needed']),
      time_investment: this.extractNumeric(nested || analysis, ['time_investment', 'timeInvestment', 'time_required', 'production_time']),
      budget_requirements: this.extractNumeric(nested || analysis, ['budget_requirements', 'budgetRequirements', 'budget_level', 'cost_level']),
    };

    return this.hasAnyValue(signals as unknown as Record<string, unknown>) ? signals : undefined;
  }

  private extractAudience(analysis: Record<string, unknown>): AudienceSignals | undefined {
    const nested = this.findNested(analysis, ['audience_signals', 'audience', 'target_audience', 'audienceSignals']);
    
    const signals: AudienceSignals = {
      primary_ages: this.extractStringArray(nested || analysis, ['primary_ages', 'primaryAges', 'age_groups', 'target_ages']),
      vibe_alignments: this.extractStringArray(nested || analysis, ['vibe_alignments', 'vibeAlignments', 'vibes', 'content_vibes']),
      engagement_style: this.extractString(nested || analysis, ['engagement_style', 'engagementStyle', 'engagement_type']),
      niche_specificity: this.extractNumeric(nested || analysis, ['niche_specificity', 'nicheSpecificity', 'niche_level', 'specificity']),
    };

    return this.hasAnyValue(signals as unknown as Record<string, unknown>) ? signals : undefined;
  }

  // =============================================================================
  // σTASTE V1.1 EXTRACTORS
  // =============================================================================

  private extractSigmaTaste(analysis: Record<string, unknown>): SigmaTasteV1_1 | undefined {
    // Look for sigma_taste at top level or nested
    const sigmaTaste = this.findNested(analysis, ['sigma_taste', 'sigmaTaste', 'sigma_taste_v1_1']);
    const source = sigmaTaste || analysis;

    const result: SigmaTasteV1_1 = {
      schema_version: 'v1.1-sigma',
      content_classification: this.extractContentClassification(source),
      replicability_decomposed: this.extractReplicabilityDecomposed(source),
      narrative_flow: this.extractNarrativeFlow(source),
      performer_execution: this.extractPerformerExecution(source),
      hook_analysis: this.extractHookAnalysis(source),
      payoff_analysis: this.extractPayoffAnalysis(source),
      production_polish: this.extractProductionPolish(source),
    };

    // Extract scenes if present
    const scenes = this.extractSceneBreakdown(source);
    if (scenes) {
      result.scenes = scenes;
    }

    // Extract computed scores if present
    result.utility_score = this.extractNumericNormalized(source, ['utility_score', 'utilityScore']);
    result.quality_score = this.extractNumericNormalized(source, ['quality_score', 'qualityScore']);
    result.sigma_taste_final = this.extractNumericNormalized(source, ['sigma_taste_final', 'sigmaTasteFinal', 'sigma_taste_score']);

    return result;
  }

  private extractContentClassification(analysis: Record<string, unknown>): ContentClassification {
    const nested = this.findNested(analysis, ['content_classification', 'contentClassification', 'classification']);
    const source = nested || analysis;

    return {
      content_type: this.extractEnum(source, ['content_type', 'contentType', 'type'], [
        'sketch_comedy', 'reaction_content', 'informational', 'interview_format',
        'montage_visual', 'tutorial_how_to', 'testimonial', 'promotional_direct',
        'trend_recreation', 'hybrid'
      ]) as ContentClassification['content_type'] || 'hybrid',
      service_relevance: this.extractEnum(source, ['service_relevance', 'serviceRelevance', 'relevance'], [
        'in_scope', 'out_of_scope', 'edge_case'
      ]) as ContentClassification['service_relevance'] || 'edge_case',
      classification_reasoning: this.extractString(source, ['classification_reasoning', 'classificationReasoning', 'reasoning']),
      strata_id: this.extractEnum(source, ['strata_id', 'strataId', 'strata'], [
        'hospitality_sketch', 'workplace_relatable', 'customer_interaction', 'product_showcase', 'atmosphere_vibe'
      ]) as ContentClassification['strata_id'],
    };
  }

  private extractReplicabilityDecomposed(analysis: Record<string, unknown>): ReplicabilityDecomposed {
    const nested = this.findNested(analysis, ['replicability_decomposed', 'replicabilityDecomposed', 'replicability']);
    const source = nested || analysis;

    // One-to-one copy feasibility
    const copyNested = this.findNested(source, ['one_to_one_copy_feasibility', 'oneToOneCopyFeasibility', 'copy_feasibility']);
    const copySource = copyNested || source;

    // Actor requirements
    const actorNested = this.findNested(source, ['actor_requirements', 'actorRequirements', 'actors']);
    const actorSource = actorNested || source;

    // Environment requirements
    const envNested = this.findNested(source, ['environment_requirements', 'environmentRequirements', 'environment']);
    const envSource = envNested || source;

    // Production requirements
    const prodNested = this.findNested(source, ['production_requirements', 'productionRequirements', 'production']);
    const prodSource = prodNested || source;

    // Concept transferability
    const transferNested = this.findNested(source, ['concept_transferability', 'conceptTransferability', 'transferability']);
    const transferSource = transferNested || source;

    // Prop dependency
    const propNested = this.findNested(envSource, ['prop_dependency', 'propDependency', 'props']);
    const propSource = propNested || envSource;

    return {
      one_to_one_copy_feasibility: {
        score: (this.extractNumeric(copySource, ['score']) as 1 | 2 | 3) || 2,
        reasoning: this.extractString(copySource, ['reasoning', 'reason']) || '',
        required_adaptations: this.extractStringArray(copySource, ['required_adaptations', 'requiredAdaptations', 'adaptations']),
      },
      actor_requirements: {
        count: this.extractEnum(actorSource, ['count', 'actor_count'], ['solo', 'duo', 'small_group', 'crowd']) as ReplicabilityDecomposed['actor_requirements']['count'] || 'solo',
        skill_level: this.extractEnum(actorSource, ['skill_level', 'skillLevel', 'skill'], ['anyone', 'comfortable_on_camera', 'acting_required', 'professional']) as ReplicabilityDecomposed['actor_requirements']['skill_level'] || 'anyone',
        social_risk_required: this.extractEnum(actorSource, ['social_risk_required', 'socialRiskRequired', 'social_risk'], ['none', 'mild', 'significant', 'extreme']) as ReplicabilityDecomposed['actor_requirements']['social_risk_required'] || 'none',
        appearance_dependency: this.extractEnum(actorSource, ['appearance_dependency', 'appearanceDependency'], ['none', 'low', 'moderate', 'high']) as ReplicabilityDecomposed['actor_requirements']['appearance_dependency'],
      },
      environment_requirements: {
        backdrop_interchangeability: this.extractEnum(envSource, ['backdrop_interchangeability', 'backdropInterchangeability', 'backdrop'], ['any_venue', 'similar_venue_type', 'specific_setting_needed']) as ReplicabilityDecomposed['environment_requirements']['backdrop_interchangeability'] || 'any_venue',
        prop_dependency: {
          level: this.extractEnum(propSource, ['level', 'prop_level'], ['none', 'common_items', 'specific_props', 'custom_fabrication']) as ReplicabilityDecomposed['environment_requirements']['prop_dependency']['level'] || 'none',
          items: this.extractStringArray(propSource, ['items', 'prop_items']),
          substitutable: this.extractBoolean(propSource, ['substitutable', 'is_substitutable']),
        },
        setup_complexity: this.extractEnum(envSource, ['setup_complexity', 'setupComplexity', 'setup'], ['point_and_shoot', 'basic_tripod', 'multi_location', 'elaborate_staging']) as ReplicabilityDecomposed['environment_requirements']['setup_complexity'] || 'point_and_shoot',
      },
      production_requirements: {
        editing_skill: this.extractEnum(prodSource, ['editing_skill', 'editingSkill', 'editing'], ['basic_cuts', 'timed_edits', 'effects_required', 'professional_post']) as ReplicabilityDecomposed['production_requirements']['editing_skill'] || 'basic_cuts',
        editing_as_punchline: this.extractBoolean(prodSource, ['editing_as_punchline', 'editingAsPunchline']) || false,
        estimated_time: this.extractEnum(prodSource, ['estimated_time', 'estimatedTime', 'time'], ['under_15min', 'under_1hr', 'half_day', 'full_day_plus']) as ReplicabilityDecomposed['production_requirements']['estimated_time'] || 'under_1hr',
      },
      concept_transferability: {
        product_swappable: this.extractBoolean(transferSource, ['product_swappable', 'productSwappable']) || false,
        humor_travels: this.extractBoolean(transferSource, ['humor_travels', 'humorTravels']) || false,
        audience_narrowing_factors: this.extractStringArray(transferSource, ['audience_narrowing_factors', 'audienceNarrowingFactors', 'narrowing_factors']),
      },
    };
  }

  private extractNarrativeFlow(analysis: Record<string, unknown>): NarrativeFlow {
    const nested = this.findNested(analysis, ['narrative_flow', 'narrativeFlow', 'narrative']);
    const source = nested || analysis;

    const beatNested = this.findNested(source, ['beat_progression', 'beatProgression', 'beats']);
    const beatSource = beatNested || source;

    return {
      story_direction: this.extractEnum(source, ['story_direction', 'storyDirection', 'direction'], ['linear_build', 'escalating', 'revelation_based', 'circular', 'fragmented']) as NarrativeFlow['story_direction'] || 'linear_build',
      beat_progression: {
        type: this.extractEnum(beatSource, ['type', 'beat_type'], ['incremental_heightening', 'steady_examples', 'dialogue_escalation', 'visual_accumulation']) as NarrativeFlow['beat_progression']['type'] || 'steady_examples',
        additive_per_beat: this.extractBoolean(beatSource, ['additive_per_beat', 'additivePerBeat', 'additive']) || true,
        filler_detected: this.extractBoolean(beatSource, ['filler_detected', 'fillerDetected', 'has_filler']) || false,
      },
      momentum_type: this.extractEnum(source, ['momentum_type', 'momentumType', 'momentum'], ['building_to_climax', 'steady_stream', 'single_beat_payoff', 'no_clear_structure']) as NarrativeFlow['momentum_type'] || 'steady_stream',
      coherence_score: (this.extractNumeric(source, ['coherence_score', 'coherenceScore', 'coherence']) as 1 | 2 | 3 | 4 | 5) || 3,
      coherence_notes: this.extractString(source, ['coherence_notes', 'coherenceNotes', 'notes']),
    };
  }

  private extractPerformerExecution(analysis: Record<string, unknown>): PerformerExecution {
    const nested = this.findNested(analysis, ['performer_execution', 'performerExecution', 'performer']);
    const source = nested || analysis;

    const sellingNested = this.findNested(source, ['concept_selling', 'conceptSelling']);
    const sellingSource = sellingNested || source;

    const tonalNested = this.findNested(source, ['tonal_match', 'tonalMatch']);
    const tonalSource = tonalNested || source;

    const commitmentNested = this.findNested(source, ['commitment_signals', 'commitmentSignals', 'commitment']);
    const commitmentSource = commitmentNested || source;

    return {
      concept_selling: {
        score: (this.extractNumeric(sellingSource, ['score', 'concept_selling_score']) as 1 | 2 | 3 | 4 | 5) || 3,
        persona_clarity: this.extractEnum(sellingSource, ['persona_clarity', 'personaClarity', 'persona'], ['clear_character', 'ambiguous', 'just_themselves']) as PerformerExecution['concept_selling']['persona_clarity'] || 'just_themselves',
      },
      tonal_match: {
        matches_content: this.extractBoolean(tonalSource, ['matches_content', 'matchesContent', 'matches']) ?? true,
        mismatch_notes: this.extractString(tonalSource, ['mismatch_notes', 'mismatchNotes', 'notes']),
      },
      commitment_signals: {
        facial_expressiveness: this.extractEnum(commitmentSource, ['facial_expressiveness', 'facialExpressiveness', 'facial'], ['minimal', 'appropriate', 'highly_animated']) as PerformerExecution['commitment_signals']['facial_expressiveness'] || 'appropriate',
        physical_commitment: this.extractEnum(commitmentSource, ['physical_commitment', 'physicalCommitment', 'physical'], ['static', 'moderate_movement', 'full_physical_comedy']) as PerformerExecution['commitment_signals']['physical_commitment'] || 'moderate_movement',
        embarrassment_tolerance: this.extractEnum(commitmentSource, ['embarrassment_tolerance', 'embarrassmentTolerance', 'embarrassment'], ['safe_performance', 'mild_vulnerability', 'full_commitment']) as PerformerExecution['commitment_signals']['embarrassment_tolerance'] || 'safe_performance',
      },
      performance_dependency: this.extractEnum(source, ['performance_dependency', 'performanceDependency', 'dependency'], ['concept_carries_itself', 'good_delivery_helps', 'requires_strong_performer']) as PerformerExecution['performance_dependency'] || 'good_delivery_helps',
    };
  }

  private extractHookAnalysis(analysis: Record<string, unknown>): HookAnalysis {
    const nested = this.findNested(analysis, ['hook_analysis', 'hookAnalysis', 'hook']);
    const source = nested || analysis;

    const desperationNested = this.findNested(source, ['desperation_signals', 'desperationSignals', 'desperation']);
    const desperationSource = desperationNested || source;

    const promiseNested = this.findNested(source, ['promise_quality', 'promiseQuality', 'promise']);
    const promiseSource = promiseNested || source;

    return {
      hook_style: this.extractEnum(source, ['hook_style', 'hookStyle', 'style'], ['relatable_situation', 'question', 'action', 'visual_intrigue', 'text_overlay', 'sound_grab']) as HookAnalysis['hook_style'] || 'action',
      desperation_signals: {
        detected: this.extractBoolean(desperationSource, ['detected', 'desperation_detected', 'has_desperation']) || false,
        signals: this.extractStringArray(desperationSource, ['signals', 'desperation_types']) as HookAnalysis['desperation_signals']['signals'],
      },
      promise_quality: {
        curiosity_generated: (this.extractNumeric(promiseSource, ['curiosity_generated', 'curiosityGenerated', 'curiosity']) as 1 | 2 | 3 | 4 | 5) || 3,
        promise_fulfilled: this.extractBoolean(promiseSource, ['promise_fulfilled', 'promiseFulfilled', 'fulfilled']) ?? true,
        allows_slow_burn: this.extractBoolean(promiseSource, ['allows_slow_burn', 'allowsSlowBurn', 'slow_burn']) ?? true,
      },
      emotional_undertone: this.extractStringArray(source, ['emotional_undertone', 'emotionalUndertone', 'undertone']),
    };
  }

  private extractPayoffAnalysis(analysis: Record<string, unknown>): PayoffAnalysis {
    const nested = this.findNested(analysis, ['payoff_analysis', 'payoffAnalysis', 'payoff']);
    const source = nested || analysis;

    const closureNested = this.findNested(source, ['closure_quality', 'closureQuality', 'closure']);
    const closureSource = closureNested || source;

    const surpriseNested = this.findNested(source, ['surprise_fit', 'surpriseFit', 'surprise']);
    const surpriseSource = surpriseNested || source;

    const tropeNested = this.findNested(source, ['trope_handling', 'tropeHandling', 'trope']);
    const tropeSource = tropeNested || source;

    const substanceNested = this.findNested(source, ['substance_level', 'substanceLevel', 'substance']);
    const substanceSource = substanceNested || source;

    return {
      payoff_type: this.extractEnum(source, ['payoff_type', 'payoffType', 'type'], ['visual_reveal', 'edit_cut', 'dialogue_delivery', 'twist', 'callback', 'escalation_peak']) as PayoffAnalysis['payoff_type'] || 'dialogue_delivery',
      closure_quality: {
        meaningful_ending: this.extractBoolean(closureSource, ['meaningful_ending', 'meaningfulEnding', 'meaningful']) ?? true,
        feels_empty: this.extractBoolean(closureSource, ['feels_empty', 'feelsEmpty', 'empty']) || false,
        earned_vs_cheap: this.extractEnum(closureSource, ['earned_vs_cheap', 'earnedVsCheap', 'earned'], ['fully_earned', 'somewhat_earned', 'cheap_shortcut', 'no_real_payoff']) as PayoffAnalysis['closure_quality']['earned_vs_cheap'] || 'somewhat_earned',
      },
      surprise_fit: {
        predictability: this.extractEnum(surpriseSource, ['predictability'], ['completely_obvious', 'somewhat_expected', 'pleasant_surprise', 'total_twist']) as PayoffAnalysis['surprise_fit']['predictability'] || 'somewhat_expected',
        logical_in_hindsight: this.extractBoolean(surpriseSource, ['logical_in_hindsight', 'logicalInHindsight', 'logical']) ?? true,
      },
      trope_handling: {
        uses_known_trope: this.extractBoolean(tropeSource, ['uses_known_trope', 'usesKnownTrope', 'uses_trope']) || false,
        trope_name: this.extractString(tropeSource, ['trope_name', 'tropeName', 'name']),
        trope_treatment: this.extractEnum(tropeSource, ['trope_treatment', 'tropeTreatment', 'treatment'], ['subverted_cleverly', 'played_straight_well', 'lazy_execution']) as PayoffAnalysis['trope_handling']['trope_treatment'] || 'played_straight_well',
      },
      substance_level: {
        content_type: this.extractEnum(substanceSource, ['content_type', 'contentType', 'type'], ['empty_calories', 'moderate_substance', 'genuinely_clever']) as PayoffAnalysis['substance_level']['content_type'] || 'moderate_substance',
        memorability: (this.extractNumeric(substanceSource, ['memorability', 'memorable']) as 1 | 2 | 3 | 4 | 5) || 3,
      },
    };
  }

  private extractProductionPolish(analysis: Record<string, unknown>): ProductionPolish {
    const nested = this.findNested(analysis, ['production_polish', 'productionPolish', 'polish']);
    const source = nested || analysis;

    const audioNested = this.findNested(source, ['audio_intentionality', 'audioIntentionality', 'audio']);
    const audioSource = audioNested || source;

    const visualNested = this.findNested(source, ['visual_intentionality', 'visualIntentionality', 'visual']);
    const visualSource = visualNested || source;

    const polishNested = this.findNested(source, ['polish_composite', 'polishComposite']);
    const polishSource = polishNested || source;

    return {
      audio_intentionality: {
        purposeful: this.extractBoolean(audioSource, ['purposeful', 'audio_purposeful']) ?? true,
        elements_aligned: this.extractBoolean(audioSource, ['elements_aligned', 'elementsAligned', 'aligned']) ?? true,
        comedic_audio_timing: this.extractEnum(audioSource, ['comedic_audio_timing', 'comedicAudioTiming', 'timing'], ['perfect', 'good', 'off', 'none']) as ProductionPolish['audio_intentionality']['comedic_audio_timing'] || 'good',
      },
      visual_intentionality: {
        purposeful_framing: this.extractBoolean(visualSource, ['purposeful_framing', 'purposefulFraming', 'framing']) ?? true,
        quality_consistency: this.extractBoolean(visualSource, ['quality_consistency', 'qualityConsistency', 'consistent']) ?? true,
        lighting_appropriate: this.extractBoolean(visualSource, ['lighting_appropriate', 'lightingAppropriate', 'lighting']) ?? true,
      },
      polish_composite: {
        score: (this.extractNumeric(polishSource, ['score', 'polish_score']) as 1 | 2 | 3 | 4 | 5) || 3,
        elevating_factors: this.extractStringArray(polishSource, ['elevating_factors', 'elevatingFactors', 'elevating']),
        detracting_factors: this.extractStringArray(polishSource, ['detracting_factors', 'detractingFactors', 'detracting']),
      },
      cuts_per_minute: this.extractNumeric(source, ['cuts_per_minute', 'cutsPerMinute', 'cuts']),
      pacing_feel: this.extractEnum(source, ['pacing_feel', 'pacingFeel', 'pacing'], ['rushed', 'snappy', 'comfortable', 'slow', 'dragging']) as ProductionPolish['pacing_feel'] || 'comfortable',
    };
  }

  private extractSceneBreakdown(analysis: Record<string, unknown>): SceneBreakdown | undefined {
    const nested = this.findNested(analysis, ['scenes', 'scene_breakdown', 'sceneBreakdown']);
    const source = nested || analysis;

    const scenes = source?.sceneBreakdown || source?.scene_breakdown || source?.scenes;
    if (!Array.isArray(scenes) || scenes.length === 0) {
      return undefined;
    }

    return {
      sceneBreakdown: scenes.map((scene: Record<string, unknown>, index: number) => ({
        sceneNumber: (scene.sceneNumber as number) || (scene.scene_number as number) || index + 1,
        timestamp: (scene.timestamp as string) || '',
        duration: (scene.duration as string) || '',
        visualContent: (scene.visualContent as string) || (scene.visual_content as string) || '',
        audioContent: (scene.audioContent as string) || (scene.audio_content as string) || '',
        impliedMeaning: (scene.impliedMeaning as string) || (scene.implied_meaning as string),
        viewerAssumption: (scene.viewerAssumption as string) || (scene.viewer_assumption as string),
        narrativeFunction: this.extractEnum(scene, ['narrativeFunction', 'narrative_function', 'function'], ['hook', 'setup', 'development', 'misdirection', 'payoff', 'tag']) as SceneBreakdown['sceneBreakdown'][0]['narrativeFunction'] || 'development',
        editSignificance: (scene.editSignificance as string) || (scene.edit_significance as string),
      })),
      editAsPunchline: this.extractBoolean(source, ['editAsPunchline', 'edit_as_punchline']),
      editPunchlineExplanation: this.extractString(source, ['editPunchlineExplanation', 'edit_punchline_explanation']),
      misdirectionTechnique: this.extractString(source, ['misdirectionTechnique', 'misdirection_technique']),
    };
  }

  // =============================================================================
  // ADDITIONAL HELPER METHODS
  // =============================================================================

  private extractEnum<T extends string>(obj: Record<string, unknown> | undefined, paths: string[], validValues: T[]): T | undefined {
    const value = this.extractString(obj, paths);
    if (value && validValues.includes(value as T)) {
      return value as T;
    }
    return undefined;
  }

  private extractBoolean(obj: Record<string, unknown> | undefined, paths: string[]): boolean | undefined {
    if (!obj) return undefined;

    for (const path of paths) {
      const value = this.getNestedValue(obj, path);
      if (value !== undefined && value !== null) {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
          if (value.toLowerCase() === 'true' || value === '1') return true;
          if (value.toLowerCase() === 'false' || value === '0') return false;
        }
        if (typeof value === 'number') return value !== 0;
      }
    }
    return undefined;
  }

  private extractNumericNormalized(obj: Record<string, unknown> | undefined, paths: string[]): number | undefined {
    if (!obj) return undefined;

    for (const path of paths) {
      const value = this.getNestedValue(obj, path);
      if (value !== undefined && value !== null) {
        const num = typeof value === 'number' ? value : parseFloat(String(value));
        if (!isNaN(num) && num >= 0 && num <= 1) {
          return Math.round(num * 100) / 100; // Round to 2 decimals
        }
      }
    }
    return undefined;
  }

  // =============================================================================
  // VALUE EXTRACTION HELPERS
  // =============================================================================

  private extractNumeric(obj: Record<string, unknown> | undefined, paths: string[]): number | undefined {
    if (!obj) return undefined;

    for (const path of paths) {
      const value = this.getNestedValue(obj, path);
      if (value !== undefined && value !== null) {
        const num = typeof value === 'number' ? value : parseFloat(String(value));
        if (!isNaN(num) && num >= 1 && num <= 10) {
          return Math.round(num * 10) / 10; // Round to 1 decimal
        }
      }
    }
    return undefined;
  }

  private extractString(obj: Record<string, unknown> | undefined, paths: string[]): string | undefined {
    if (!obj) return undefined;

    for (const path of paths) {
      const value = this.getNestedValue(obj, path);
      if (value !== undefined && value !== null && typeof value === 'string' && value.trim()) {
        return value.trim().toLowerCase();
      }
    }
    return undefined;
  }

  private extractStringArray(obj: Record<string, unknown> | undefined, paths: string[]): string[] | undefined {
    if (!obj) return undefined;

    for (const path of paths) {
      const value = this.getNestedValue(obj, path);
      if (Array.isArray(value) && value.length > 0) {
        const strings = value
          .filter((v): v is string => typeof v === 'string')
          .map(s => s.trim().toLowerCase())
          .filter(s => s.length > 0);
        if (strings.length > 0) return strings;
      }
      // Handle comma-separated string
      if (typeof value === 'string' && value.includes(',')) {
        const strings = value.split(',')
          .map(s => s.trim().toLowerCase())
          .filter(s => s.length > 0);
        if (strings.length > 0) return strings;
      }
    }
    return undefined;
  }

  private findNested(obj: Record<string, unknown>, paths: string[]): Record<string, unknown> | undefined {
    for (const path of paths) {
      const value = this.getNestedValue(obj, path);
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
    }
    return undefined;
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    // Handle dot notation
    const parts = path.split('.');
    let current: unknown = obj;
    
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    
    return current;
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  private hasAnyValue(obj: Record<string, unknown>): boolean {
    return Object.values(obj).some(v => v !== undefined && v !== null);
  }

  private cleanSignals(signals: VideoSignals): VideoSignals {
    const cleaned: Partial<VideoSignals> = {};
    
    for (const [key, value] of Object.entries(signals)) {
      if (value !== undefined && value !== null) {
        if (typeof value === 'object' && !Array.isArray(value)) {
          const cleanedNested = this.cleanObject(value as Record<string, unknown>);
          if (Object.keys(cleanedNested).length > 0) {
            (cleaned as Record<string, unknown>)[key] = cleanedNested;
          }
        } else {
          (cleaned as Record<string, unknown>)[key] = value;
        }
      }
    }
    
    // Ensure schema_version is always present
    cleaned.schema_version = signals.schema_version || this.version;
    return cleaned as VideoSignals;
  }

  private cleanObject(obj: Record<string, unknown>): Record<string, unknown> {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined && value !== null) {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }

  private calculateCoverage(signals: VideoSignals): number {
    const v1_0_keys = ['pacing', 'humor', 'teaching_style', 'content_type', 'target_age_group'];
    const v1_1_keys = ['content_density_signals', 'production_quality_signals', 'replicability_signals', 'audience_signals'];
    const v1_1_sigma_keys = ['sigma_taste'];
    
    let allKeys: string[];
    if (this.version === 'v1.1-sigma') {
      allKeys = [...v1_0_keys, ...v1_1_keys, ...v1_1_sigma_keys];
    } else if (this.version === 'v1.1') {
      allKeys = [...v1_0_keys, ...v1_1_keys];
    } else {
      allKeys = v1_0_keys;
    }
    
    const signalsObj = signals as unknown as Record<string, unknown>;
    
    let found = 0;
    for (const key of allKeys) {
      if (signalsObj[key] !== undefined) {
        found++;
      }
    }
    
    return found / allKeys.length;
  }
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Extract signals from raw Gemini output
 */
export function extractSignals(visualAnalysis: Record<string, unknown>, version: SchemaVersion = CURRENT_SCHEMA_VERSION): ExtractionResult {
  const extractor = new SignalExtractor(version);
  return extractor.extract({ visual_analysis: visualAnalysis });
}

/**
 * Merge extracted signals with human overrides
 */
export function mergeSignals(extracted: VideoSignals, overrides?: Partial<VideoSignals>): VideoSignals {
  if (!overrides || Object.keys(overrides).length === 0) {
    return extracted;
  }
  
  // Deep merge with overrides taking precedence
  const merged: VideoSignals = { ...extracted };
  const mergedObj = merged as unknown as Record<string, unknown>;
  
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined && value !== null) {
      const existingValue = mergedObj[key];
      if (typeof value === 'object' && !Array.isArray(value) && existingValue) {
        // Merge nested objects
        mergedObj[key] = {
          ...(existingValue as Record<string, unknown>),
          ...(value as Record<string, unknown>),
        };
      } else {
        mergedObj[key] = value;
      }
    }
  }
  
  return merged;
}

/**
 * Validate signals against schema
 */
export function validateSignals(signals: VideoSignals): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check schema version
  if (!signals.schema_version) {
    errors.push('Missing schema_version');
  }
  
  // Validate numeric ranges
  const numericFields = ['pacing', 'humor', 'teaching_style'] as const;
  for (const field of numericFields) {
    const value = signals[field];
    if (value !== undefined && (value < 1 || value > 10)) {
      errors.push(`${field} must be between 1 and 10, got ${value}`);
    }
  }
  
  // Validate nested numeric fields
  if (signals.content_density_signals) {
    for (const [key, value] of Object.entries(signals.content_density_signals)) {
      if (typeof value === 'number' && (value < 1 || value > 10)) {
        errors.push(`content_density_signals.${key} must be between 1 and 10`);
      }
    }
  }
  
  if (signals.production_quality_signals) {
    for (const [key, value] of Object.entries(signals.production_quality_signals)) {
      if (typeof value === 'number' && (value < 1 || value > 10)) {
        errors.push(`production_quality_signals.${key} must be between 1 and 10`);
      }
    }
  }
  
  return { valid: errors.length === 0, errors };
}
