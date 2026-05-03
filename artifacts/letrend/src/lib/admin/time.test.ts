import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_DATE_VALUE,
  dateInputSv,
  dateTimeSv,
  longDateSv,
  relativeSv,
  shortDateSv,
  todayDateInput,
  timeAgoSv,
} from '@/lib/admin/time';

describe('time helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-23T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats short and long dates from date inputs', () => {
    expect(shortDateSv(new Date('2026-04-23T12:00:00Z'))).toMatch(/^23 apr/);
    expect(longDateSv('2026-04-23')).toBe('23 april 2026');
  });

  it('formats date values for date inputs', () => {
    expect(dateInputSv('2026-04-23T14:34:00+02:00')).toBe('2026-04-23');
    expect(todayDateInput()).toBe('2026-04-23');
  });

  it('formats date and time together', () => {
    expect(dateTimeSv('2026-04-23T14:34:00+02:00')).toMatch(/^23 apr.*14:34$/);
  });

  it('formats relative dates consistently', () => {
    expect(relativeSv('2026-04-23T11:00:00Z')).toContain('sedan');
    expect(timeAgoSv('2026-04-23T11:00:00Z')).toContain('sedan');
  });

  it('returns empty marker for missing values', () => {
    expect(shortDateSv(null)).toBe(EMPTY_DATE_VALUE);
    expect(dateTimeSv(undefined)).toBe(EMPTY_DATE_VALUE);
  });
});
