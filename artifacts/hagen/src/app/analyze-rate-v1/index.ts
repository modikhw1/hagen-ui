/**
 * Analyze Rate V1.1 - Modular Exports
 * 
 * This module provides a modular structure for the analyze-rate-v1 page:
 * 
 * - types.ts: All TypeScript types and interfaces
 * - components.tsx: Reusable UI components for each signal section
 * - hooks.ts: State management and data transformation utilities
 * - page.tsx: Main page component that composes everything
 * 
 * Signal Domains:
 * 1. QualityRating - Overall quality tier and notes
 * 2. HumorAnalysis - Gemini's humor analysis (display only)
 * 3. Replicability - Actor count, setup complexity, skill required
 * 4. Environment - Setting type, space requirements, lighting
 * 5. RiskLevel - Content edge, humor risk, trend reliance
 * 6. TargetAudience - Age range, income level, lifestyle tags, vibe
 */

// Types
export * from './types';

// Components
export {
  ButtonGroup,
  MultiSelectGroup,
  SectionHeader,
  ScoreBar,
  QualityRatingSection,
  ReplicabilitySection,
  EnvironmentSection,
  RiskLevelSection,
  TargetAudienceSection,
  SignalCompletionIndicator
} from './components';

// Hooks and utilities
export {
  useSignalState,
  populateFromGeminiAnalysis,
  buildApiPayload,
  createInitialQualityRating,
  createInitialReplicability,
  createInitialEnvironment,
  createInitialRiskLevel,
  createInitialTargetAudience
} from './hooks';
