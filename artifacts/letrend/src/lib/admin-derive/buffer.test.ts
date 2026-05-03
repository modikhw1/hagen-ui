import { describe, expect, it } from 'vitest';
import { bufferDays, customerBufferStatus } from './buffer';

describe('buffer', () => {
  it('calculates buffer days', () => {
    expect(bufferDays({
      pace: 3,
      latestPlannedPublishDate: new Date('2026-04-22'),
      pausedUntil: null,
      today: new Date('2026-04-17'),
    })).toBe(5);
  });

  it('classifies thin and blocked buffers', () => {
    expect(customerBufferStatus({
      pace: 3,
      latestPlannedPublishDate: new Date('2026-04-20'),
      pausedUntil: null,
      today: new Date('2026-04-17'),
    }, 0)).toBe('thin');

    expect(customerBufferStatus({
      pace: 3,
      latestPlannedPublishDate: new Date('2026-04-20'),
      pausedUntil: null,
      today: new Date('2026-04-17'),
    }, 7)).toBe('blocked');
  });
});
