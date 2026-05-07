/**
 * Provenance-safe script_mode filter helper.
 *
 * Provenance rules:
 * - `all`: always matches.
 * - `with_script` / `without_script`: group filters that use the explicit CM-confirmed
 *   script_mode when available, falling back to the legacy `hasScript` boolean for
 *   old concepts that were never ingested through the objective-field flow.
 * - Specific modes (`text_overlay`, `short_dialogue`, `long_dialogue`, `visual_only`,
 *   `none`): ONLY match when `explicitScriptMode` is set (i.e. the field exists in
 *   raw_overrides, meaning a CM confirmed it). Never match sigma-inferred values to
 *   prevent false positives for old or partially-ingested concepts.
 *
 * @param hasScript           Legacy boolean — still used as fallback for old concepts.
 * @param explicitScriptMode  Value from `raw_overrides['script_mode']` — only set when
 *                            the CM explicitly confirmed the field at ingest. Pass
 *                            `undefined` for sigma-inferred or old concepts.
 * @param filter              The filter value to apply.
 */
export function matchScriptMode(
  hasScript: boolean | undefined,
  explicitScriptMode: string | undefined,
  filter: string,
): boolean {
  if (filter === 'all') return true;

  if (filter === 'with_script') {
    if (explicitScriptMode !== undefined) {
      return (
        explicitScriptMode === 'text_overlay' ||
        explicitScriptMode === 'short_dialogue' ||
        explicitScriptMode === 'long_dialogue'
      );
    }
    return Boolean(hasScript);
  }

  if (filter === 'without_script') {
    if (explicitScriptMode !== undefined) {
      return explicitScriptMode === 'visual_only' || explicitScriptMode === 'none';
    }
    return !hasScript;
  }

  // Specific mode filters (text_overlay, short_dialogue, long_dialogue, visual_only, none):
  // Only match when the field is explicitly CM-confirmed.
  // Returns false for sigma-inferred or old hasScript-only concepts.
  if (explicitScriptMode !== undefined) return explicitScriptMode === filter;
  return false;
}
