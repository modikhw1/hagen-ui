export type CustomerConceptAssignmentNoteSource = {
  cm_note?: string | null;
};

export function resolveCustomerConceptAssignmentNote(
  source: CustomerConceptAssignmentNoteSource
): string | null {
  return firstMeaningfulText(source.cm_note);
}

function firstMeaningfulText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value !== 'string') continue;

    const normalized = value.replace(/\r\n/g, '\n').trim();
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

// ── Assignment boundary write helpers ──────────────────────────────────────

export type AssignmentInsertInput = {
  /** Assignment row's customer scope */
  customerId: string;
  /** Source concept from the concept library */
  sourceConceptId: string;
  /** CM who created the assignment */
  cmId: string;
};

/**
 * Builds the insert payload for a new customer concept assignment row.
 *
 * Boundary: assignment identity + initial assignment state.
 * Content, placement, result, and markers start empty and are written
 * through separate boundary-specific updates.
 */
export function buildAssignmentInsertPayload(input: AssignmentInsertInput): {
  customer_profile_id: string;
  customer_id: string;
  concept_id: string;
  cm_id: string;
  status: 'draft';
  feed_order: null;
  tags: string[];
  content_overrides: Record<string, never>;
} {
  return {
    customer_profile_id: input.customerId,
    customer_id: input.customerId,
    concept_id: input.sourceConceptId,
    cm_id: input.cmId,
    status: 'draft',
    feed_order: null,
    tags: [],
    content_overrides: {},
  };
}
