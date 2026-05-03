import { cmAggregate } from './lib/admin-derive/cm-pulse';

const mockInput: any = {
  cm: { id: '1', name: 'Test CM', avatarUrl: null },
  activeAbsence: null,
  interactions7d: [],
  lastInteractionAt: new Date(),
  now: new Date(),
  customers: [
    { id: 'c1', name: 'C1', bufferStatus: 'ok', pace: 2, onboardingState: 'live', plannedConceptsCount: 3 },
    { id: 'c2', name: 'C2', bufferStatus: 'ok', pace: 4, onboardingState: 'live', plannedConceptsCount: 2 },
    { id: 'c3', name: 'C3', bufferStatus: 'ok', pace: 3, onboardingState: 'live', plannedConceptsCount: 3 },
    { id: 'c4', name: 'C4', bufferStatus: 'ok', pace: 5, onboardingState: 'live', plannedConceptsCount: 1 }
  ]
};

const result = cmAggregate(mockInput);
console.log('--- TEST RESULT ---');
console.log('Planned Concepts (Numerator):', result.planned_concepts_total);
console.log('Expected Concepts (Denominator):', result.expected_concepts_7d);
console.log('Bar Label:', result.barLabel);
console.log('Fill Pct:', result.fillPct + '%');
console.log('Status:', result.status);
