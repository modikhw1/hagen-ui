/**
 * Single source of truth for length/tone constraints on concept fields.
 *
 * Derived from running `translateClipToConcept()` against all clips in
 * `clips-priority.json` (Task #15 Step 1). The numbers below are picked so
 * the corpus fits comfortably and the prompt has a small amount of headroom
 * for hand-edited pieces. See `.local/audits/task-15-step1-corpus-measurements.md`.
 *
 * Used by:
 *   - The Vertex/Gemini prompt (api-server → hagen proxy)
 *   - The review UI character counters
 *   - The server-side validator that retries Gemini once if its output is
 *     outside the [min, max] range.
 */

export interface FieldConstraint {
  /** Hard lower bound — output below this is rejected and retried. */
  minChars: number;
  /** Soft target lower bound — used in prompts ("aim for 30–55 chars"). */
  targetMinChars: number;
  /** Soft target upper bound. */
  targetMaxChars: number;
  /** Hard upper bound — output above this is truncated or rejected. */
  maxChars: number;
  /** Short Swedish description for the prompt and the UI hint. */
  hint: string;
}

export const conceptFieldConstraints = {
  headline_sv: {
    minChars: 20,
    targetMinChars: 30,
    targetMaxChars: 55,
    maxChars: 70,
    hint: 'En kort svensk hook-rad. Namnge greppet, inte plattformen eller kreatören.',
  },
  description_sv: {
    minChars: 70,
    targetMinChars: 90,
    targetMaxChars: 130,
    maxChars: 160,
    hint: '1–2 meningar som beskriver vad konceptet är, ur kundens perspektiv.',
  },
  whyItWorks_sv: {
    minChars: 90,
    targetMinChars: 150,
    targetMaxChars: 210,
    maxChars: 260,
    hint: 'Varför formatet fungerar mekaniskt. Hooken, twisten, payoffen — inte bara "det är roligt".',
  },
  script_sv: {
    minChars: 0,
    targetMinChars: 250,
    targetMaxChars: 500,
    maxChars: 700,
    hint: 'Eventuellt manus. Tomt OK om formatet inte har talad text.',
  },
} as const satisfies Record<string, FieldConstraint>;

export type ConstrainedField = keyof typeof conceptFieldConstraints;

export const conceptListConstraints = {
  productionNotes_sv: {
    exactCount: 5,
    perItem: { minChars: 30, targetMinChars: 50, targetMaxChars: 90, maxChars: 120 },
    hint: 'Exakt 5 punkter. Konkreta, handlingsbara produktionssteg.',
  },
  whyItFits_sv: {
    exactCount: 3,
    perItem: { minChars: 30, targetMinChars: 55, targetMaxChars: 90, maxChars: 110 },
    hint: 'Exakt 3 punkter. Argument CM kan använda för att motivera konceptet till kund.',
  },
} as const;

/**
 * Locked tone rules — included verbatim in the Vertex/Gemini system prompt so
 * the model has the same guidance as the UI hints.
 */
export const conceptToneRules = [
  'Direkt svenska, inga emojis i headline/description/whyItWorks.',
  'Undvik marknadsfluff ("revolutionerande", "fantastiskt"). Skriv konkret och observerbart.',
  'Headline namnger konceptet/greppet, inte plattformen eller kreatören.',
  'Beskriv mekaniken (hook, subversion, payoff) — inte bara att "det är roligt".',
] as const;

/**
 * Validates a string against a field constraint.
 * Returns null if valid, otherwise an error message.
 */
export function validateConceptField(
  field: ConstrainedField,
  value: string,
): string | null {
  const c = conceptFieldConstraints[field];
  const len = value.trim().length;
  if (len < c.minChars) {
    return `${field}: ${len} tecken är för kort (min ${c.minChars}).`;
  }
  if (len > c.maxChars) {
    return `${field}: ${len} tecken är för långt (max ${c.maxChars}).`;
  }
  return null;
}
