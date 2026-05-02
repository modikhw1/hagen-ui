export function getSuccessThresholds(followers: number) {
  if (followers < 500) return { hit: 8000, viral: 15000, expected_min: 3000, expected_max: 8000 };
  if (followers < 2000) return { hit: 15000, viral: 25000, expected_min: 5000, expected_max: 15000 };
  if (followers < 10000) return { hit: 50000, viral: 100000, expected_min: 15000, expected_max: 50000 };
  if (followers < 50000) return { hit: 100000, viral: 200000, expected_min: 30000, expected_max: 100000 };
  return { hit: 250000, viral: 500000, expected_min: 75000, expected_max: 250000 };
}

export type LikeRateTier = 'poor' | 'ok' | 'good' | 'great';

export function getLikeRateTier(rate: number): LikeRateTier {
  if (rate < 2) return 'poor';
  if (rate < 4) return 'ok';
  if (rate < 7) return 'good';
  return 'great';
}
