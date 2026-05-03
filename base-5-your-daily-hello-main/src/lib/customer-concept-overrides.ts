import type { Json } from '@/types/database';
import type { ConceptContentOverrides } from '@/types/studio-v2';

export type CustomerConceptOverrideSource = {
  content_overrides?: Json | null;
};

type OverrideTextField =
  | 'headline'
  | 'summary'
  | 'script'
  | 'why_it_fits'
  | 'filming_instructions'
  | 'target_audience'
  | 'call_to_action';

const OVERRIDE_TEXT_FIELDS: OverrideTextField[] = [
  'headline',
  'summary',
  'script',
  'why_it_fits',
  'filming_instructions',
  'target_audience',
  'call_to_action',
];

export function resolveCustomerConceptContentOverrides(
  source: CustomerConceptOverrideSource
): ConceptContentOverrides {
  const rawOverrides = asRecord(source.content_overrides);

  return compactOverrides({
    headline:
      firstText(rawOverrides.headline, rawOverrides.headline_sv) ?? undefined,
    summary:
      firstText(
        rawOverrides.summary,
        rawOverrides.description,
        rawOverrides.description_sv
      ) ?? undefined,
    script:
      firstText(rawOverrides.script, rawOverrides.script_sv) ?? undefined,
    why_it_fits:
      firstText(rawOverrides.why_it_fits, rawOverrides.whyItWorks_sv) ?? undefined,
    filming_instructions:
      firstText(
        rawOverrides.filming_instructions,
        rawOverrides.filming_guidance,
        rawOverrides.instructions
      ) ?? undefined,
    target_audience:
      firstText(rawOverrides.target_audience) ?? undefined,
    call_to_action:
      firstText(rawOverrides.call_to_action, rawOverrides.cta) ?? undefined,
  });
}

export function mergeCustomerConceptContentOverrides(
  existing: CustomerConceptOverrideSource,
  patch: Record<string, unknown>
): ConceptContentOverrides {
  const merged: ConceptContentOverrides = {
    ...resolveCustomerConceptContentOverrides(existing),
  };

  const rawPatchOverrides = asRecord(patch.content_overrides);

  applyTextPatch(merged, 'headline', patch, rawPatchOverrides, ['headline', 'headline_sv'], []);
  applyTextPatch(merged, 'summary', patch, rawPatchOverrides, ['summary', 'description', 'description_sv'], []);
  applyTextPatch(merged, 'script', patch, rawPatchOverrides, ['script', 'script_sv'], []);
  applyTextPatch(merged, 'why_it_fits', patch, rawPatchOverrides, ['why_it_fits', 'whyItWorks_sv'], []);
  applyTextPatch(merged, 'filming_instructions', patch, rawPatchOverrides, ['filming_instructions', 'filming_guidance', 'instructions'], []);
  applyTextPatch(merged, 'target_audience', patch, rawPatchOverrides, ['target_audience'], []);
  applyTextPatch(merged, 'call_to_action', patch, rawPatchOverrides, ['call_to_action', 'cta'], []);

  return compactOverrides(merged);
}

function applyTextPatch(
  target: ConceptContentOverrides,
  field: OverrideTextField,
  patch: Record<string, unknown>,
  rawPatchOverrides: Record<string, unknown>,
  overrideKeys: string[],
  directKeys: string[]
) {
  const hasOverrideKey = overrideKeys.some((key) => hasOwn(rawPatchOverrides, key));
  const hasDirectKey = directKeys.some((key) => hasOwn(patch, key));

  if (!hasOverrideKey && !hasDirectKey) {
    return;
  }

  const nextValue =
    firstDefinedText(
      ...overrideKeys.map((key) => rawPatchOverrides[key]),
      ...directKeys.map((key) => patch[key])
    ) ?? null;

  if (nextValue === null) {
    delete target[field];
    return;
  }

  target[field] = nextValue;
}

function compactOverrides(overrides: ConceptContentOverrides): ConceptContentOverrides {
  const next: ConceptContentOverrides = {};

  for (const field of OVERRIDE_TEXT_FIELDS) {
    const value = overrides[field];
    if (typeof value === 'string' && value.trim().length > 0) {
      next[field] = value.trim();
    }
  }

  return next;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\r\n/g, '\n').trim();
  return normalized.length > 0 ? normalized : null;
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized !== null) return normalized;
  }

  return null;
}

function firstDefinedText(...values: unknown[]): string | null | undefined {
  for (const value of values) {
    if (value === undefined) continue;
    return normalizeText(value);
  }

  return undefined;
}
