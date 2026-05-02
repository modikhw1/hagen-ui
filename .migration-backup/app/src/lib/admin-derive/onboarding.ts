export type OnboardingState = 'invited' | 'cm_ready' | 'live' | 'settled';

export type OnboardingChecklist = {
  contractSigned: boolean;
  contentPlanSet: boolean;
  startConceptsLoaded: boolean;
  tiktokHandleConfirmed: boolean;
  firstPublication: boolean;
};

export function deriveOnboardingState(checklist: OnboardingChecklist): OnboardingState {
  if (checklist.firstPublication) return 'live';
  if (checklist.contentPlanSet && checklist.startConceptsLoaded && checklist.tiktokHandleConfirmed) return 'cm_ready';
  return 'invited';
}

export function settleIfDue(state: OnboardingState, liveSince: Date | null, today: Date): OnboardingState {
  if (state === 'live' && liveSince && (+today - +liveSince) >= 14 * 86_400_000) {
    return 'settled';
  }

  return state;
}
