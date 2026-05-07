/**
 * Pure helpers for building reanalyze suggestions on the review page.
 *
 * Safety contract:
 * - Only reads from `suggested_overrides` returned by the backend.
 * - Never reads from `backend_data` as a fallback for confirmed/suppressed fields.
 * - If the backend filtered a key (because it was already confirmed in `overrides`),
 *   the corresponding field will be null here and must NOT be shown as a suggestion.
 *
 * This is the frontend mirror of `buildSuggestedOverrides` in studio-helpers.ts.
 */

export interface SuggestableFields {
  script_mode: string | null;
  setup_complexity: string | null;
  skill_required: string | null;
  setting: string | null;
  peopleNeeded: string | null;
  difficulty: string | null;
  filmTime: string | null;
  businessTypes: string[] | null;
}

/**
 * Build applicable suggestions from the server's `suggested_overrides` object.
 *
 * A field is non-null only when it is present in `suggested_overrides`. If the
 * backend filtered a key (because the CM already confirmed that field), the field
 * will be null and must not appear as a "Tillämpa" suggestion in the UI.
 */
export function buildSuggestionsFromOverrides(sug: Record<string, unknown>): SuggestableFields {
  return {
    script_mode: typeof sug['script_mode'] === 'string' ? sug['script_mode'] : null,
    setup_complexity: typeof sug['setup_complexity'] === 'string' ? sug['setup_complexity'] : null,
    skill_required: typeof sug['skill_required'] === 'string' ? sug['skill_required'] : null,
    setting: typeof sug['setting'] === 'string' ? sug['setting'] : null,
    peopleNeeded: typeof sug['peopleNeeded'] === 'string' ? sug['peopleNeeded'] : null,
    difficulty: typeof sug['difficulty'] === 'string' ? sug['difficulty'] : null,
    filmTime: typeof sug['filmTime'] === 'string' ? sug['filmTime'] : null,
    businessTypes: Array.isArray(sug['businessTypes'])
      ? (sug['businessTypes'] as unknown[]).filter((v): v is string => typeof v === 'string')
      : null,
  };
}

/**
 * Returns true if at least one field carries a non-null suggestion.
 * Used to distinguish "no applicable suggestions (all confirmed)" from
 * "suggestions present but already match current form values".
 */
export function hasApplicableSuggestions(fields: SuggestableFields): boolean {
  return (
    fields.script_mode !== null ||
    fields.setup_complexity !== null ||
    fields.skill_required !== null ||
    fields.setting !== null ||
    fields.peopleNeeded !== null ||
    fields.difficulty !== null ||
    fields.filmTime !== null ||
    (fields.businessTypes !== null && fields.businessTypes.length > 0)
  );
}
