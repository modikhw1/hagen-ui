import { describe, expect, it } from 'vitest';
import { groupDemos } from './demos';

describe('demos', () => {
  it('groups demo cards into columns', () => {
    const grouped = groupDemos([
      { id: '1', companyName: 'A', tiktokHandle: null, proposedPace: 3, proposedPriceSek: 12000, status: 'draft', statusChangedAt: new Date(), ownerName: null },
      { id: '2', companyName: 'B', tiktokHandle: null, proposedPace: 3, proposedPriceSek: 12000, status: 'responded', statusChangedAt: new Date(), ownerName: null },
      { id: '3', companyName: 'C', tiktokHandle: null, proposedPace: 3, proposedPriceSek: 12000, status: 'won', statusChangedAt: new Date(), ownerName: null },
    ]);

    expect(grouped.draft).toHaveLength(1);
    expect(grouped.responded).toHaveLength(1);
    expect(grouped.closed).toHaveLength(1);
  });
});
