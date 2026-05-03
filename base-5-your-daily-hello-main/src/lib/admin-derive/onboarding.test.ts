import { describe, expect, it } from 'vitest';
import { deriveOnboardingState, settleIfDue } from './onboarding';

describe('onboarding', () => {
  it('derives onboarding states', () => {
    expect(deriveOnboardingState({
      contractSigned: true,
      contentPlanSet: true,
      startConceptsLoaded: true,
      tiktokHandleConfirmed: true,
      firstPublication: false,
    })).toBe('cm_ready');
  });

  it('settles after 14 days in live', () => {
    expect(settleIfDue('live', new Date('2026-04-01'), new Date('2026-04-17'))).toBe('settled');
  });
});
