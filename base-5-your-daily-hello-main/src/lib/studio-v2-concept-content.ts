/**
 * Studio V2 Concept Content Resolution
 *
 * Resolves concept content by merging base concept data with customer-specific
 * content overrides.
 */

import type { CustomerConcept, ConceptContentOverrides } from '@/types/studio-v2';
import type { TranslatedConcept } from '@/lib/conceptLoader';

/**
 * Keys for concept content sections that can be resolved
 */
export type ConceptSectionKey =
  | 'headline'
  | 'script'
  | 'target_audience'
  | 'call_to_action'
  | 'why_it_fits'
  | 'filming_instructions'
  | 'fit'
  | 'instructions';

/**
 * Resolved concept content structure
 */
export interface ResolvedConceptContent {
  headline: {
    headline_sv: string;
    headline_en?: string;
  };
  script: {
    headline_sv: string;
    script_sv?: string;
  };
  fit: {
    whyItWorks_sv: string;
    targetAudience_sv?: string;
  };
  instructions: {
    filming_instructions: string;
  };
  callToAction?: {
    cta_sv?: string;
  };
}

/**
 * Get content overrides from a customer concept
 */
export function getContentOverrides(concept: CustomerConcept): ConceptContentOverrides | null {
  return concept.content.content_overrides || null;
}

/**
 * Check if a concept has any content overrides
 */
export function hasContentOverrides(concept: CustomerConcept): boolean {
  const overrides = getContentOverrides(concept);
  if (!overrides) return false;

  return Object.keys(overrides).some(key => {
    const value = overrides[key as keyof ConceptContentOverrides];
    return value !== undefined && value !== null && value !== '';
  });
}

/**
 * Resolve concept content by merging base concept with customer overrides.
 *
 * @param customerConcept - The customer concept with potential overrides
 * @param baseConcept - The base concept details (from TranslatedConcept)
 * @returns Resolved content with overrides applied
 */
export function resolveConceptContent(
  customerConcept: CustomerConcept,
  baseConcept: TranslatedConcept | null
): ResolvedConceptContent {
  const overrides = getContentOverrides(customerConcept);

  // Default content from base concept (TranslatedConcept structure)
  const defaultHeadline = baseConcept?.headline || '';
  const defaultScriptSv = baseConcept?.script_sv || '';
  const defaultWhyItWorksSv = baseConcept?.whyItWorks_sv ||
    (baseConcept?.whyItFits_sv?.length ? baseConcept.whyItFits_sv[0] : '') ||
    (baseConcept?.whyItFits?.length ? baseConcept.whyItFits[0] : '') || '';

  return {
    headline: {
      headline_sv: overrides?.headline as string || baseConcept?.headline_sv || defaultHeadline,
    },
    script: {
      headline_sv: overrides?.script as string || defaultScriptSv || defaultHeadline,
      script_sv: overrides?.script as string || defaultScriptSv,
    },
    fit: {
      whyItWorks_sv: overrides?.why_it_fits as string || defaultWhyItWorksSv,
      targetAudience_sv: overrides?.target_audience as string,
    },
    instructions: {
      filming_instructions: overrides?.filming_instructions as string || '',
    },
    callToAction: overrides?.call_to_action ? {
      cta_sv: overrides.call_to_action as string,
    } : undefined,
  };
}

/**
 * Get a specific resolved content section
 */
export function getResolvedSection(
  customerConcept: CustomerConcept,
  baseConcept: TranslatedConcept | null,
  section: ConceptSectionKey
): string {
  const resolved = resolveConceptContent(customerConcept, baseConcept);

  switch (section) {
    case 'headline':
      return resolved.headline.headline_sv;
    case 'script':
      return resolved.script.script_sv || '';
    case 'fit':
    case 'why_it_fits':
      return resolved.fit.whyItWorks_sv;
    case 'instructions':
    case 'filming_instructions':
      return resolved.instructions.filming_instructions;
    case 'target_audience':
      return resolved.fit.targetAudience_sv || '';
    case 'call_to_action':
      return resolved.callToAction?.cta_sv || '';
    default:
      return '';
  }
}
