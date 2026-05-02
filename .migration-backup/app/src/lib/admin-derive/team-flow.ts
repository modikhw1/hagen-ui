export type DailyDot = {
  date: Date;
  count: number;
  level: 'empty' | 'low' | 'mid' | 'high' | 'peak';
  isWeekend: boolean;
};

export function baseline90d(daily: { date: Date; count: number }[]): number {
  const nonZero = daily.filter((day) => day.count > 0).map((day) => day.count).sort((a, b) => a - b);
  if (!nonZero.length) return 0;
  const mid = Math.floor(nonZero.length / 2);
  return nonZero.length % 2 ? nonZero[mid] : (nonZero[mid - 1] + nonZero[mid]) / 2;
}

export function classifyDay(count: number, baseline: number, isWeekend: boolean): DailyDot['level'] {
  if (baseline === 0) return count > 0 ? 'mid' : 'empty';
  const adjustedBaseline = baseline * (isWeekend ? 0.4 : 1);
  if (count === 0) return 'empty';
  if (count > 3 * adjustedBaseline) return 'peak';
  if (count > 1.5 * adjustedBaseline) return 'high';
  if (count >= 0.5 * adjustedBaseline) return 'mid';
  return 'low';
}

export function summarize(dots: DailyDot[]) {
  const active = dots.filter((dot) => dot.count > 0);
  const nonZeroCounts = active.map((dot) => dot.count).sort((a, b) => a - b);
  const median = nonZeroCounts.length ? nonZeroCounts[Math.floor(nonZeroCounts.length / 2)] : 0;
  let longestRest = 0;
  let run = 0;

  for (const dot of dots) {
    if (dot.count === 0) {
      run += 1;
      longestRest = Math.max(longestRest, run);
    } else {
      run = 0;
    }
  }

  return { activeDays: active.length, total: dots.length, median, longestRest };
}
