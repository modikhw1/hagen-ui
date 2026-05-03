/**
 * Hard Filter Pipeline for Video-Brand Matching
 * 
 * These are binary pass/fail checks that must ALL pass before soft scoring.
 * A video that fails any hard filter cannot be a match, regardless of soft scores.
 */

import type {
  VideoFingerprint,
  BrandFingerprint,
  HardFilterResult,
  ReplicabilityScore,
  OperationalConstraints,
  EnvironmentRequirements,
  EnvironmentAvailability,
  RiskLevel,
  RiskTolerance
} from './profile-fingerprint.types'

// =============================================================================
// ENVIRONMENT COMPATIBILITY FILTER
// =============================================================================

/**
 * Check if the video's required environment is available to the brand
 */
export function checkEnvironmentCompatibility(
  videoEnv: EnvironmentRequirements,
  brandEnv: EnvironmentAvailability
): HardFilterResult {
  const filterName = 'environment_compatibility'
  
  // If video has no environment requirements, it passes
  if (!videoEnv.setting_type) {
    return { passed: true, filter_name: filterName, reason: 'No specific environment required' }
  }
  
  // Map video setting types to brand availability
  const settingMap: Record<string, string[]> = {
    'kitchen': ['kitchen'],
    'bar': ['bar'],
    'storefront': ['storefront'],
    'dining_room': ['dining_room'],
    'outdoor': ['outdoor'],
    'indoor': ['kitchen', 'dining_room', 'bar', 'storefront'],
    'mixed': ['kitchen', 'dining_room', 'bar', 'storefront', 'outdoor']
  }
  
  const requiredSettings = settingMap[videoEnv.setting_type] || [videoEnv.setting_type]
  const hasRequired = requiredSettings.some(s => brandEnv.available_settings.includes(s as any))
  
  if (!hasRequired) {
    return {
      passed: false,
      filter_name: filterName,
      reason: `Video requires ${videoEnv.setting_type} setting, but brand only has: ${brandEnv.available_settings.join(', ')}`
    }
  }
  
  // Check space requirements
  const spaceOrder = ['minimal', 'moderate', 'spacious']
  if (videoEnv.space_requirements && brandEnv.space_available) {
    const required = spaceOrder.indexOf(videoEnv.space_requirements)
    const available = spaceOrder.indexOf(brandEnv.space_available)
    if (required > available) {
      return {
        passed: false,
        filter_name: filterName,
        reason: `Video requires ${videoEnv.space_requirements} space, but brand only has ${brandEnv.space_available}`
      }
    }
  }
  
  // Check customer visibility requirements
  if (videoEnv.customer_visibility === 'featured' && !brandEnv.can_feature_customers) {
    return {
      passed: false,
      filter_name: filterName,
      reason: 'Video features customers but brand cannot show customers'
    }
  }
  
  return { passed: true, filter_name: filterName, reason: 'Environment requirements met' }
}

// =============================================================================
// REPLICABILITY FEASIBILITY FILTER
// =============================================================================

/**
 * Check if the brand can feasibly recreate this type of content
 */
export function checkReplicabilityFeasibility(
  videoRep: ReplicabilityScore,
  brandConstraints: OperationalConstraints
): HardFilterResult {
  const filterName = 'replicability_feasibility'
  
  // Check actor count
  const actorOrder = ['solo', 'duo', 'small_team', 'large_team']
  if (videoRep.actor_count && brandConstraints.team_size_available) {
    const required = actorOrder.indexOf(videoRep.actor_count)
    const available = actorOrder.indexOf(brandConstraints.team_size_available)
    if (required > available) {
      return {
        passed: false,
        filter_name: filterName,
        reason: `Video requires ${videoRep.actor_count} (${required + 1}+ people), but brand has ${brandConstraints.team_size_available}`
      }
    }
  }
  
  // Check skill requirements
  const skillOrder = ['anyone', 'basic_editing', 'intermediate', 'professional']
  if (videoRep.skill_required && brandConstraints.skill_level) {
    const required = skillOrder.indexOf(videoRep.skill_required)
    const available = skillOrder.indexOf(brandConstraints.skill_level)
    if (required > available) {
      return {
        passed: false,
        filter_name: filterName,
        reason: `Video requires ${videoRep.skill_required} skill, but brand has ${brandConstraints.skill_level}`
      }
    }
  }
  
  // Check time requirements
  const timeOrder = ['under_1hr', '1_4hrs', 'half_day', 'full_day']
  if (videoRep.estimated_time && brandConstraints.time_per_video) {
    const required = timeOrder.indexOf(videoRep.estimated_time)
    const available = timeOrder.indexOf(brandConstraints.time_per_video)
    if (required > available) {
      return {
        passed: false,
        filter_name: filterName,
        reason: `Video requires ${videoRep.estimated_time} to produce, but brand can only spend ${brandConstraints.time_per_video}`
      }
    }
  }
  
  // Check equipment (partial match OK - just need some overlap or no requirements)
  if (videoRep.equipment_needed && videoRep.equipment_needed.length > 0) {
    const hasBasicEquipment = videoRep.equipment_needed.some(e => 
      e === 'smartphone' || brandConstraints.equipment_available.includes(e)
    )
    if (!hasBasicEquipment) {
      return {
        passed: false,
        filter_name: filterName,
        reason: `Video requires equipment: ${videoRep.equipment_needed.join(', ')}`
      }
    }
  }
  
  return { passed: true, filter_name: filterName, reason: 'Content is replicable within constraints' }
}

// =============================================================================
// RISK TOLERANCE FILTER
// =============================================================================

/**
 * Check if the video's risk level is within the brand's tolerance
 */
export function checkRiskTolerance(
  videoRisk: RiskLevel,
  brandTolerance: RiskTolerance
): HardFilterResult {
  const filterName = 'risk_tolerance'
  
  // Check content edge
  const edgeOrder = ['brand_safe', 'mildly_edgy', 'edgy', 'provocative']
  if (videoRisk.content_edge && brandTolerance.max_content_edge) {
    const videoEdge = edgeOrder.indexOf(videoRisk.content_edge)
    const maxEdge = edgeOrder.indexOf(brandTolerance.max_content_edge)
    if (videoEdge > maxEdge) {
      return {
        passed: false,
        filter_name: filterName,
        reason: `Video is ${videoRisk.content_edge}, but brand max is ${brandTolerance.max_content_edge}`
      }
    }
  }
  
  // Check humor risk
  const humorRiskOrder = ['safe_humor', 'playful', 'sarcastic', 'dark_humor']
  if (videoRisk.humor_risk && brandTolerance.humor_risk_ok) {
    const videoHumorRisk = humorRiskOrder.indexOf(videoRisk.humor_risk)
    const maxHumorRisk = humorRiskOrder.indexOf(brandTolerance.humor_risk_ok)
    if (videoHumorRisk > maxHumorRisk) {
      return {
        passed: false,
        filter_name: filterName,
        reason: `Video has ${videoRisk.humor_risk}, but brand max is ${brandTolerance.humor_risk_ok}`
      }
    }
  }
  
  // Check controversy potential (high = reject for all but the most tolerant)
  if (videoRisk.controversy_potential === 'high' && brandTolerance.max_content_edge !== 'provocative') {
    return {
      passed: false,
      filter_name: filterName,
      reason: 'Video has high controversy potential'
    }
  }
  
  return { passed: true, filter_name: filterName, reason: 'Risk level within tolerance' }
}

// =============================================================================
// MAIN FILTER PIPELINE
// =============================================================================

/**
 * Run all hard filters and return results
 * Returns early if any filter fails (for efficiency)
 */
export function runHardFilterPipeline(
  video: VideoFingerprint,
  brand: BrandFingerprint
): { passed: boolean; results: HardFilterResult[] } {
  const results: HardFilterResult[] = []
  
  // 1. Environment compatibility
  const envResult = checkEnvironmentCompatibility(
    video.environment_requirements,
    brand.environment_availability
  )
  results.push(envResult)
  if (!envResult.passed) {
    return { passed: false, results }
  }
  
  // 2. Replicability feasibility
  const repResult = checkReplicabilityFeasibility(
    video.replicability,
    brand.operational_constraints
  )
  results.push(repResult)
  if (!repResult.passed) {
    return { passed: false, results }
  }
  
  // 3. Risk tolerance
  const riskResult = checkRiskTolerance(
    video.risk_level,
    brand.risk_tolerance
  )
  results.push(riskResult)
  if (!riskResult.passed) {
    return { passed: false, results }
  }
  
  return { passed: true, results }
}

/**
 * Get a summary of why a video was filtered out
 */
export function getFilterFailureSummary(results: HardFilterResult[]): string {
  const failed = results.find(r => !r.passed)
  if (!failed) return 'All filters passed'
  return `Filtered: ${failed.reason}`
}
