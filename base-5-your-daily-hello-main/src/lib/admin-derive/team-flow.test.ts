import { describe, expect, it } from 'vitest';
import { baseline90d, classifyDay, summarize, type DailyDot } from './team-flow';

describe('team-flow', () => {
  it('calculates baseline and levels', () => {
    const baseline = baseline90d([
      { date: new Date('2026-04-01'), count: 0 },
      { date: new Date('2026-04-02'), count: 2 },
      { date: new Date('2026-04-03'), count: 4 },
    ]);

    expect(baseline).toBe(3);
    expect(classifyDay(5, baseline, false)).toBe('high');
  });

  it('summarizes activity dots', () => {
    const dots: DailyDot[] = [
      { date: new Date('2026-04-01'), count: 0, level: 'empty', isWeekend: false },
      { date: new Date('2026-04-02'), count: 2, level: 'mid', isWeekend: false },
      { date: new Date('2026-04-03'), count: 0, level: 'empty', isWeekend: false },
    ];

    expect(summarize(dots)).toEqual({ activeDays: 1, total: 3, median: 2, longestRest: 1 });
  });
});
