import { describe, expect, it } from 'vitest';
import { cmAggregate, sortCmRows } from './cm-pulse';

describe('cm-pulse', () => {
  it('aggregates cm status and load', () => {
    const aggregate = cmAggregate({
      cm: { id: 'cm-1', name: 'Maja', avatarUrl: null },
      activeAbsence: null,
      customers: [
        { id: '1', name: 'A', bufferStatus: 'under', pace: 3, onboardingState: 'live', lastPublishedAt: new Date('2026-04-16') },
        { id: '2', name: 'B', bufferStatus: 'thin', pace: 2, onboardingState: 'cm_ready', lastPublishedAt: new Date('2026-04-15') },
      ],
      interactions7d: [{ type: 'concept_added', created_at: new Date('2026-04-16') }],
      lastInteractionAt: new Date('2026-04-13'),
      now: new Date('2026-04-17'),
    });

    expect(aggregate.status).toBe('watch');
    expect(aggregate.barLabel).toBe('1/5 koncept');
    expect(aggregate.newCustomers).toHaveLength(1);
  });

  it('sorts needs action first', () => {
    const rows = [
      { cmId: '1', status: 'in_phase', last_interaction_days: 0, interaction_count_7d: 7 },
      { cmId: '2', status: 'needs_action', last_interaction_days: 8, interaction_count_7d: 1 },
    ] as Array<ReturnType<typeof cmAggregate>>;

    expect(sortCmRows(rows, 'standard')[0]?.cmId).toBe('2');
  });

  it('suppresses red pulse during active absence', () => {
    const aggregate = cmAggregate({
      cm: { id: 'cm-1', name: 'Maja', avatarUrl: null },
      activeAbsence: {
        absenceType: 'vacation',
        startsOn: '2026-04-16',
        endsOn: '2026-04-18',
        backupCmName: 'Nora',
      },
      customers: [
        { id: '1', name: 'A', bufferStatus: 'under', pace: 3, onboardingState: 'live', lastPublishedAt: new Date('2026-04-16') },
      ],
      interactions7d: [],
      lastInteractionAt: null,
      now: new Date('2026-04-17'),
    });

    expect(aggregate.status).toBe('away');
  });
});
