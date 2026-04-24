import { describe, expect, it } from 'vitest';
import { demoStatusLabel, moveDemoBetweenColumns } from './demos';

describe('demos', () => {
  it('maps status labels for client rendering', () => {
    expect(demoStatusLabel('draft')).toBe('Utkast');
    expect(demoStatusLabel('responded')).toBe('Svar inkom');
    expect(demoStatusLabel('won')).toBe('Vunnen');
  });

  it('moves a card optimistically between columns', () => {
    type TestCard = {
      id: string;
      status: 'draft' | 'sent' | 'opened' | 'responded' | 'won' | 'lost' | 'expired';
      statusChangedAt: string;
      nextStatus: 'sent' | 'opened' | 'responded' | null;
    };

    const board: {
      columns: {
        draft: TestCard[];
        sent: TestCard[];
        opened: TestCard[];
        responded: TestCard[];
        closed: TestCard[];
      };
    } = {
      columns: {
        draft: [
          {
            id: 'demo-1',
            status: 'draft',
            statusChangedAt: '2026-01-01T00:00:00.000Z',
            nextStatus: 'sent',
          },
        ],
        sent: [],
        opened: [],
        responded: [],
        closed: [],
      },
    };

    const updated = moveDemoBetweenColumns(board, 'demo-1', 'sent');
    expect(updated.columns.draft).toHaveLength(0);
    expect(updated.columns.sent).toHaveLength(1);
    expect(updated.columns.sent[0]?.status).toBe('sent');
    expect(updated.columns.sent[0]?.nextStatus).toBe('opened');
  });
});
