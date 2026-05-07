import { describe, expect, it } from 'vitest'
import {
  readScriptMode,
  readSetupComplexity,
  readSkillRequired,
  readSetting,
  type BackendClip,
  type ClipOverride,
} from '../translator'

const emptyClip: BackendClip = { id: 'test', url: '' }

const clipWithSigma: BackendClip = {
  id: 'sigma',
  url: '',
  sigma_taste: {
    replicability_decomposed: {
      actor_requirements: { skill_level: 'acting_required' },
      environment_requirements: {
        setup_complexity: 'multi_location',
        backdrop_interchangeability: 'specific_setting_needed',
      },
    },
    narrative_flow: {
      beat_progression: { type: 'dialogue_escalation' },
    },
  },
}

const clipWithHasScript: BackendClip = {
  id: 'legacy',
  url: '',
  script: { hasScript: true, transcript: 'Hello world this is a short transcript for test' },
}

// ─── readScriptMode ────────────────────────────────────────────────────────────

describe('readScriptMode', () => {
  it('returns override.script_mode when set', () => {
    const override: ClipOverride = { script_mode: 'text_overlay' }
    expect(readScriptMode(emptyClip, override)).toBe('text_overlay')
  })

  it('infers long_dialogue from dialogue_escalation beat type', () => {
    expect(readScriptMode(clipWithSigma)).toBe('long_dialogue')
  })

  it('falls back to short_dialogue for short transcript', () => {
    expect(readScriptMode(clipWithHasScript)).toBe('short_dialogue')
  })

  it('returns visual_only for clip with no audio in scene_breakdown', () => {
    const clip: BackendClip = {
      id: 'visual',
      url: '',
      scene_breakdown: [{ timestamp: '0', audio: '', visual: 'panning shot', narrative_function: 'intro' }],
    }
    expect(readScriptMode(clip)).toBe('visual_only')
  })

  it('override wins over sigma signal', () => {
    const override: ClipOverride = { script_mode: 'visual_only' }
    expect(readScriptMode(clipWithSigma, override)).toBe('visual_only')
  })
})

// ─── readSetupComplexity ───────────────────────────────────────────────────────

describe('readSetupComplexity', () => {
  it('returns null when no sigma and no override', () => {
    expect(readSetupComplexity(emptyClip)).toBeNull()
  })

  it('reads from sigma replicability_decomposed.environment_requirements.setup_complexity', () => {
    expect(readSetupComplexity(clipWithSigma)).toBe('multi_location')
  })

  it('returns override when set', () => {
    const override: ClipOverride = { setup_complexity: 'elaborate_staging' }
    expect(readSetupComplexity(emptyClip, override)).toBe('elaborate_staging')
  })

  it('override wins over sigma', () => {
    const override: ClipOverride = { setup_complexity: 'point_and_shoot' }
    expect(readSetupComplexity(clipWithSigma, override)).toBe('point_and_shoot')
  })
})

// ─── readSkillRequired ─────────────────────────────────────────────────────────

describe('readSkillRequired', () => {
  it('returns null when no sigma and no override', () => {
    expect(readSkillRequired(emptyClip)).toBeNull()
  })

  it('reads from sigma replicability_decomposed.actor_requirements.skill_level', () => {
    expect(readSkillRequired(clipWithSigma)).toBe('acting_required')
  })

  it('returns override when set', () => {
    const override: ClipOverride = { skill_required: 'anyone' }
    expect(readSkillRequired(emptyClip, override)).toBe('anyone')
  })

  it('override wins over sigma', () => {
    const override: ClipOverride = { skill_required: 'professional' }
    expect(readSkillRequired(clipWithSigma, override)).toBe('professional')
  })
})

// ─── readSetting ───────────────────────────────────────────────────────────────

describe('readSetting', () => {
  it('returns null when no sigma and no override', () => {
    expect(readSetting(emptyClip)).toBeNull()
  })

  it('reads from sigma replicability_decomposed.environment_requirements.backdrop_interchangeability', () => {
    expect(readSetting(clipWithSigma)).toBe('specific_setting_needed')
  })

  it('returns override when set', () => {
    const override: ClipOverride = { setting: 'any_venue' }
    expect(readSetting(emptyClip, override)).toBe('any_venue')
  })

  it('override wins over sigma', () => {
    const override: ClipOverride = { setting: 'similar_venue_type' }
    expect(readSetting(clipWithSigma, override)).toBe('similar_venue_type')
  })
})
