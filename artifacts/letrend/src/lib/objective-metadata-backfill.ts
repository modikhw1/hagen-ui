/**
 * Objective Metadata Backfill Helper
 *
 * Computes a "patch candidate" for objective concept fields that are missing from
 * a concept's overrides. The patch is derived from sigma signals and legacy fallbacks
 * — it NEVER proposes a field that already exists in overrides (safe for backfill).
 *
 * Provenance levels (in order of reliability):
 *   sigma           — value read directly from sigma_taste.replicability_decomposed or
 *                     sigma narrative/hook signals; most reliable AI source
 *   inferred        — value derived from transcript word-count analysis; medium reliability
 *   legacy_hasScript — value derived from the legacy hasScript boolean; weak signal
 *   unavailable     — not enough signal to propose a value; field is omitted from patch
 *
 * Usage:
 *   const patch = computeObjectiveBackfillPatch(clip, overrides);
 *   // patch.script_mode?.value → proposed value, or undefined if already set / unavailable
 *   // patch.script_mode?.provenance → 'sigma' | 'inferred' | 'legacy_hasScript'
 *
 * Safety contract:
 *   - A field present in `overrides` (even with a falsy-looking value) is NEVER included
 *     in the patch. Use `overrides.field == null` check for each field.
 *   - Fields without a reliable source are omitted entirely (not set to null/undefined).
 *   - The caller is responsible for deciding which provenance levels to trust for a given
 *     backfill run (e.g. only apply `sigma`, skip `legacy_hasScript`).
 */

import {
  getSigma,
  readSetupComplexity,
  readSkillRequired,
  readSetting,
  type BackendClip,
  type ClipOverride,
  type ScriptMode,
  type SigmaSetupComplexity,
  type SigmaSkillLevel,
  type SigmaBackdrop,
} from './translator';

/** How a backfill candidate value was derived. */
export type BackfillProvenance = 'sigma' | 'legacy_hasScript' | 'inferred' | 'unavailable';

/** A single proposed field value with its provenance. */
export type BackfillField<T> = {
  value: T;
  provenance: Exclude<BackfillProvenance, 'unavailable'>;
};

/**
 * A partial patch containing only objective fields that are missing from overrides
 * and can be reasonably derived from available signals.
 */
export type ObjectiveBackfillPatch = {
  script_mode?: BackfillField<ScriptMode>;
  setup_complexity?: BackfillField<SigmaSetupComplexity>;
  skill_required?: BackfillField<SigmaSkillLevel>;
  setting?: BackfillField<SigmaBackdrop>;
};

/**
 * Compute a safe backfill patch for the four objective metadata fields.
 *
 * @param clip      The BackendClip from `concepts.backend_data`.
 * @param overrides The ClipOverride from `concepts.overrides`. Existing fields are
 *                  never touched — only null/undefined fields are candidates.
 * @returns         Patch containing only fields that are (a) missing from overrides
 *                  and (b) have a derivable value from sigma or legacy signals.
 */
export function computeObjectiveBackfillPatch(
  clip: BackendClip,
  overrides: ClipOverride,
): ObjectiveBackfillPatch {
  const patch: ObjectiveBackfillPatch = {};

  // ── script_mode ──────────────────────────────────────────────────────────────
  // Only propose if not already in overrides.
  if (overrides.script_mode == null) {
    const sigma = getSigma(clip);
    const beatType = sigma.narrative_flow?.beat_progression?.type;
    const hookStyle = sigma.hook_analysis?.hook_style;

    if (beatType === 'dialogue_escalation') {
      // Reliable sigma narrative signal → long_dialogue
      patch.script_mode = { value: 'long_dialogue', provenance: 'sigma' };
    } else if (hookStyle === 'text_overlay') {
      // Reliable sigma hook signal → text_overlay
      patch.script_mode = { value: 'text_overlay', provenance: 'sigma' };
    } else {
      const hasTranscript = Boolean(
        clip.script?.transcript?.trim() || clip.script?.conceptCore?.trim(),
      );
      if (hasTranscript) {
        // Transcript present → word-count classification (medium reliability)
        const transcript = (clip.script?.transcript ?? clip.script?.conceptCore ?? '').toLowerCase();
        const wordCount = transcript.split(/\s+/).filter(Boolean).length;
        const value: ScriptMode = wordCount > 60 ? 'long_dialogue' : 'short_dialogue';
        patch.script_mode = { value, provenance: 'inferred' };
      }
      // hasScript=true without transcript: NOT proposed.
      // hasScript=true means "this clip had spoken words" but tells us nothing reliable
      // about which script_mode applies (text_overlay vs dialogue vs none are all plausible).
      // Proposing 'none' here would be incorrect for most actual scripted clips.
      // scene_breakdown-only fallback is also omitted — too weak for unsupervised backfill.
      // Live inventory (May 2026): 22 hagen concepts have scene_breakdown but 0 sigma_taste →
      // neither sigma nor transcript is available for them. No bulk backfill is possible.
    }
  }

  // ── setup_complexity ─────────────────────────────────────────────────────────
  // Only from sigma — no reliable legacy fallback exists.
  if (overrides.setup_complexity == null) {
    // Call without overrides arg so we get sigma-only signal (no CM override bleed-through)
    const value = readSetupComplexity(clip);
    if (value !== null) {
      patch.setup_complexity = { value, provenance: 'sigma' };
    }
  }

  // ── skill_required ───────────────────────────────────────────────────────────
  if (overrides.skill_required == null) {
    const value = readSkillRequired(clip);
    if (value !== null) {
      patch.skill_required = { value, provenance: 'sigma' };
    }
  }

  // ── setting ──────────────────────────────────────────────────────────────────
  if (overrides.setting == null) {
    const value = readSetting(clip);
    if (value !== null) {
      patch.setting = { value, provenance: 'sigma' };
    }
  }

  return patch;
}

/**
 * Returns true if the patch has at least one proposed field.
 * Useful for filtering concepts that are already fully covered.
 */
export function hasMissingObjectiveFields(patch: ObjectiveBackfillPatch): boolean {
  return (
    patch.script_mode !== undefined ||
    patch.setup_complexity !== undefined ||
    patch.skill_required !== undefined ||
    patch.setting !== undefined
  );
}

/**
 * Returns a flat record of field → value for the proposed patch fields only.
 * This is what you'd merge into `overrides` after human/CM review.
 * Fields not in the patch are excluded — never pass this directly to a DB update
 * without diffing against existing overrides first.
 */
export function patchToOverrideDelta(patch: ObjectiveBackfillPatch): Partial<ClipOverride> {
  const delta: Partial<ClipOverride> = {};
  if (patch.script_mode !== undefined) delta.script_mode = patch.script_mode.value;
  if (patch.setup_complexity !== undefined) delta.setup_complexity = patch.setup_complexity.value;
  if (patch.skill_required !== undefined) delta.skill_required = patch.skill_required.value;
  if (patch.setting !== undefined) delta.setting = patch.setting.value;
  return delta;
}
