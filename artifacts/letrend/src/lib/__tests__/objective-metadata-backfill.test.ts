import { describe, it, expect } from 'vitest';
import {
  computeObjectiveBackfillPatch,
  hasMissingObjectiveFields,
  patchToOverrideDelta,
} from '@/lib/objective-metadata-backfill';
import type { BackendClip, ClipOverride } from '@/lib/translator';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const emptyClip: BackendClip = {} as BackendClip;
const emptyOverrides: ClipOverride = {};

const clipWithSigma: BackendClip = {
  sigma_taste: {
    replicability_decomposed: {
      environment_requirements: {
        setup_complexity: 'basic_tripod',
        backdrop_interchangeability: 'any_venue',
      },
      actor_requirements: {
        skill_level: 'comfortable_on_camera',
      },
    },
    narrative_flow: {
      beat_progression: {
        type: 'dialogue_escalation',
      },
    },
    hook_analysis: undefined,
  },
} as unknown as BackendClip;

const clipWithHookStyle: BackendClip = {
  sigma_taste: {
    hook_analysis: {
      hook_style: 'text_overlay',
    },
    replicability_decomposed: {
      environment_requirements: {
        setup_complexity: 'multi_location',
        backdrop_interchangeability: 'specific_setting_needed',
      },
      actor_requirements: {
        skill_level: 'acting_required',
      },
    },
  },
} as unknown as BackendClip;

// Transcript must exceed 60 words to trigger long_dialogue classification (threshold in readScriptMode).
// This fixture has ~70 words to stay clearly above the threshold.
const clipWithTranscript: BackendClip = {
  script: {
    hasScript: true,
    transcript:
      'hej och välkommen till den här videon där vi ska prata om hur man bygger ett riktigt bra content-manus ' +
      'som är tillräckligt långt för att räknas som long_dialogue i systemet vi har byggt här på letrend ' +
      'och det är viktigt att vi har tillräckligt med ord för att testet ska fungera korrekt och ge rätt klassificering ' +
      'tack för att du tittar och lyssnar på det vi säger här idag',
  },
} as unknown as BackendClip;

const clipWithShortTranscript: BackendClip = {
  script: {
    hasScript: true,
    transcript: 'kort manus tre ord',
  },
} as unknown as BackendClip;

const clipWithHasScriptOnly: BackendClip = {
  script: {
    hasScript: true,
    transcript: '',
  },
} as unknown as BackendClip;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('computeObjectiveBackfillPatch — existing overrides are never overwritten', () => {
  it('does not include script_mode when already in overrides', () => {
    const overrides: ClipOverride = { script_mode: 'short_dialogue' };
    const patch = computeObjectiveBackfillPatch(clipWithSigma, overrides);
    expect(patch.script_mode).toBeUndefined();
  });

  it('does not include setup_complexity when already in overrides', () => {
    const overrides: ClipOverride = { setup_complexity: 'elaborate_staging' };
    const patch = computeObjectiveBackfillPatch(clipWithSigma, overrides);
    expect(patch.setup_complexity).toBeUndefined();
  });

  it('does not include skill_required when already in overrides', () => {
    const overrides: ClipOverride = { skill_required: 'professional' };
    const patch = computeObjectiveBackfillPatch(clipWithSigma, overrides);
    expect(patch.skill_required).toBeUndefined();
  });

  it('does not include setting when already in overrides', () => {
    const overrides: ClipOverride = { setting: 'specific_setting_needed' };
    const patch = computeObjectiveBackfillPatch(clipWithSigma, overrides);
    expect(patch.setting).toBeUndefined();
  });

  it('returns empty patch when all four fields are already in overrides', () => {
    const overrides: ClipOverride = {
      script_mode: 'visual_only',
      setup_complexity: 'point_and_shoot',
      skill_required: 'anyone',
      setting: 'any_venue',
    };
    const patch = computeObjectiveBackfillPatch(clipWithSigma, overrides);
    expect(patch).toEqual({});
    expect(hasMissingObjectiveFields(patch)).toBe(false);
  });

  it('proposes only the missing field when three out of four are already set', () => {
    const overrides: ClipOverride = {
      script_mode: 'text_overlay',
      setup_complexity: 'elaborate_staging',
      skill_required: 'anyone',
      // setting intentionally missing
    };
    const patch = computeObjectiveBackfillPatch(clipWithSigma, overrides);
    expect(patch.script_mode).toBeUndefined();
    expect(patch.setup_complexity).toBeUndefined();
    expect(patch.skill_required).toBeUndefined();
    expect(patch.setting).toBeDefined();
  });
});

describe('computeObjectiveBackfillPatch — sigma values proposed when overrides missing', () => {
  it('proposes sigma script_mode from dialogue_escalation beat type', () => {
    const patch = computeObjectiveBackfillPatch(clipWithSigma, emptyOverrides);
    expect(patch.script_mode).toEqual({ value: 'long_dialogue', provenance: 'sigma' });
  });

  it('proposes sigma script_mode from hook_style text_overlay', () => {
    const patch = computeObjectiveBackfillPatch(clipWithHookStyle, emptyOverrides);
    expect(patch.script_mode).toEqual({ value: 'text_overlay', provenance: 'sigma' });
  });

  it('proposes sigma setup_complexity', () => {
    const patch = computeObjectiveBackfillPatch(clipWithSigma, emptyOverrides);
    expect(patch.setup_complexity).toEqual({ value: 'basic_tripod', provenance: 'sigma' });
  });

  it('proposes sigma skill_required', () => {
    const patch = computeObjectiveBackfillPatch(clipWithSigma, emptyOverrides);
    expect(patch.skill_required).toEqual({ value: 'comfortable_on_camera', provenance: 'sigma' });
  });

  it('proposes sigma setting (backdrop)', () => {
    const patch = computeObjectiveBackfillPatch(clipWithSigma, emptyOverrides);
    expect(patch.setting).toEqual({ value: 'any_venue', provenance: 'sigma' });
  });

  it('sigma beat type wins over hook_style (dialogue_escalation first)', () => {
    const clipBoth: BackendClip = {
      sigma_taste: {
        narrative_flow: { beat_progression: { type: 'dialogue_escalation' } },
        hook_analysis: { hook_style: 'text_overlay' },
      },
    } as unknown as BackendClip;
    const patch = computeObjectiveBackfillPatch(clipBoth, emptyOverrides);
    expect(patch.script_mode?.value).toBe('long_dialogue');
    expect(patch.script_mode?.provenance).toBe('sigma');
  });
});

describe('computeObjectiveBackfillPatch — script_mode from transcript (inferred)', () => {
  it('proposes long_dialogue from long transcript with inferred provenance', () => {
    const patch = computeObjectiveBackfillPatch(clipWithTranscript, emptyOverrides);
    expect(patch.script_mode?.value).toBe('long_dialogue');
    expect(patch.script_mode?.provenance).toBe('inferred');
  });

  it('proposes short_dialogue from short transcript with inferred provenance', () => {
    const patch = computeObjectiveBackfillPatch(clipWithShortTranscript, emptyOverrides);
    expect(patch.script_mode?.value).toBe('short_dialogue');
    expect(patch.script_mode?.provenance).toBe('inferred');
  });

  it('does NOT propose script_mode when hasScript=true but no transcript or sigma', () => {
    // hasScript=true is too ambiguous — text_overlay, dialogue, none are all plausible.
    // The helper must not guess.
    const patch = computeObjectiveBackfillPatch(clipWithHasScriptOnly, emptyOverrides);
    expect(patch.script_mode).toBeUndefined();
  });

  it('does NOT propose script_mode for a clip with only scene_breakdown (no sigma, no transcript)', () => {
    const clipSceneOnly: BackendClip = {
      scene_breakdown: [
        { scene_index: 1, audio: 'background music', description: 'product shot' },
      ],
    } as unknown as BackendClip;
    const patch = computeObjectiveBackfillPatch(clipSceneOnly, emptyOverrides);
    expect(patch.script_mode).toBeUndefined();
  });

  it('does NOT propose script_mode for a noisy clip with hasScript=false and no other signals', () => {
    const noisy: BackendClip = {
      script: { hasScript: false, transcript: '' },
    } as unknown as BackendClip;
    const patch = computeObjectiveBackfillPatch(noisy, emptyOverrides);
    expect(patch.script_mode).toBeUndefined();
  });
});

describe('computeObjectiveBackfillPatch — empty clip', () => {
  it('does not propose setup_complexity when no sigma', () => {
    const patch = computeObjectiveBackfillPatch(emptyClip, emptyOverrides);
    expect(patch.setup_complexity).toBeUndefined();
  });

  it('does not propose skill_required when no sigma', () => {
    const patch = computeObjectiveBackfillPatch(emptyClip, emptyOverrides);
    expect(patch.skill_required).toBeUndefined();
  });

  it('does not propose setting when no sigma', () => {
    const patch = computeObjectiveBackfillPatch(emptyClip, emptyOverrides);
    expect(patch.setting).toBeUndefined();
  });

  it('does not propose script_mode when clip has no signals at all', () => {
    const patch = computeObjectiveBackfillPatch(emptyClip, emptyOverrides);
    expect(patch.script_mode).toBeUndefined();
  });

  it('hasMissingObjectiveFields returns false for empty clip', () => {
    const patch = computeObjectiveBackfillPatch(emptyClip, emptyOverrides);
    expect(hasMissingObjectiveFields(patch)).toBe(false);
  });
});

describe('patchToOverrideDelta', () => {
  it('returns only proposed fields as flat override delta', () => {
    const patch = computeObjectiveBackfillPatch(clipWithSigma, emptyOverrides);
    const delta = patchToOverrideDelta(patch);
    expect(delta.script_mode).toBe('long_dialogue');
    expect(delta.setup_complexity).toBe('basic_tripod');
    expect(delta.skill_required).toBe('comfortable_on_camera');
    expect(delta.setting).toBe('any_venue');
  });

  it('returns empty delta for empty patch', () => {
    const patch = computeObjectiveBackfillPatch(emptyClip, emptyOverrides);
    expect(patchToOverrideDelta(patch)).toEqual({});
  });

  it('does not include fields already in overrides', () => {
    const overrides: ClipOverride = {
      setup_complexity: 'elaborate_staging',
      skill_required: 'professional',
      setting: 'specific_setting_needed',
    };
    const patch = computeObjectiveBackfillPatch(clipWithSigma, overrides);
    const delta = patchToOverrideDelta(patch);
    expect(delta.setup_complexity).toBeUndefined();
    expect(delta.skill_required).toBeUndefined();
    expect(delta.setting).toBeUndefined();
    // script_mode was not in overrides — should be proposed
    expect(delta.script_mode).toBe('long_dialogue');
  });
});
