import { describe, expect, it } from 'vitest';
import { customerBlocking } from './blocking';

describe('blocking', () => {
  it('ignores missing publications but escalates stale ones', () => {
    expect(customerBlocking({
      lastPublishedAt: null,
      activatedAt: null,
      isLive: false,
      pausedUntil: null,
      today: new Date('2026-04-17'),
    })).toEqual({
      state: 'none',
      daysSincePublish: 0,
      reference: 'none',
      daysSinceReference: 0,
    });

    expect(customerBlocking({
      lastPublishedAt: null,
      activatedAt: new Date('2026-04-10'),
      isLive: true,
      pausedUntil: null,
      today: new Date('2026-04-17'),
    })).toEqual({
      state: 'escalated',
      daysSincePublish: 999,
      reference: 'activation',
      daysSinceReference: 7,
    });

    expect(customerBlocking({
      lastPublishedAt: new Date('2026-04-06'),
      activatedAt: new Date('2026-04-01'),
      isLive: true,
      pausedUntil: null,
      today: new Date('2026-04-17'),
    }).state).toBe('escalated');
  });
});
