import type { ConceptContentOverrides } from '@/types/studio-v2';

export type CustomerConceptOverrideSource = {
  content_overrides?: Record<string, unknown> | null;
  custom_headline?: string | null;
  custom_description?: string | null;
  custom_script?: string | null;
  custom_why_it_works?: string | null;
  custom_instructions?: string | null;
  custom_target_audience?: string | null;
  why_it_fits?: string | null;
  filming_instructions?: string | null;
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
      firstText(
        rawOverrides.headline,
        rawOverrides.headline_sv,
        source.custom_headline
      ) ?? undefined,
    summary:
      firstText(
        rawOverrides.summary,
        rawOverrides.description,
        rawOverrides.description_sv,
        source.custom_description
      ) ?? undefined,
    script:
      firstText(
        rawOverrides.script,
        rawOverrides.script_sv,
        source.custom_script
      ) ?? undefined,
    why_it_fits:
      firstText(
        rawOverrides.why_it_fits,
        rawOverrides.whyItWorks_sv,
        source.why_it_fits,
        source.custom_why_it_works
      ) ?? undefined,
    filming_instructions:
      firstText(
        rawOverrides.filming_instructions,
        rawOverrides.filming_guidance,
        rawOverrides.instructions,
        source.filming_instructions,
        source.custom_instructions
      ) ?? undefined,
    target_audience:
      firstText(rawOverrides.target_audience, source.custom_target_audience) ?? undefined,
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

  applyTextPatch(merged, 'headline', patch, rawPatchOverrides, ['headline', 'headline_sv'], ['custom_headline']);
  applyTextPatch(merged, 'summary', patch, rawPatchOverrides, ['summary', 'description', 'description_sv'], ['custom_description']);
  applyTextPatch(merged, 'script', patch, rawPatchOverrides, ['script', 'script_sv'], ['custom_script']);
  applyTextPatch(
    merged,
    'why_it_fits',
    patch,
    rawPatchOverrides,
    ['why_it_fits', 'whyItWorks_sv'],
    ['why_it_fits', 'custom_why_it_works']
  );
  applyTextPatch(
    merged,
    'filming_instructions',
    patch,
    rawPatchOverrides,
    ['filming_instructions', 'filming_guidance', 'instructions'],
    ['filming_instructions', 'custom_instructions']
  );
  applyTextPatch(
    merged,
    'target_audience',
    patch,
    rawPatchOverrides,
    ['target_audience'],
    ['custom_target_audience']
  );
  applyTextPatch(
    merged,
    'call_to_action',
    patch,
    rawPatchOverrides,
    ['call_to_action', 'cta'],
    []
  );

  return compactOverrides(merged);
}

export function projectLegacyOverrideColumns(overrides: ConceptContentOverrides) {
  return {
    custom_headline: overrides.headline ?? null,
    custom_description: overrides.summary ?? null,
    custom_script: overrides.script ?? null,
    custom_why_it_works: overrides.why_it_fits ?? null,
    custom_instructions: overrides.filming_instructions ?? null,
    custom_target_audience: overrides.target_audience ?? null,
    why_it_fits: overrides.why_it_fits ?? null,
    filming_instructions: overrides.filming_instructions ?? null,
  };
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
