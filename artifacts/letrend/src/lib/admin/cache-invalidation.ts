import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { qk } from '@/lib/admin/queryKeys';

type QueryKeyFactory = () => QueryKey;

const overviewMetricKeys: QueryKeyFactory[] = [
  qk.overview.metrics,
  qk.overview.main,
];

const overviewAttentionKeys: QueryKeyFactory[] = [
  () => qk.overview.attention('standard'),
  () => qk.overview.attention('lowest_activity'),
  () => qk.overview.cmPulse('standard'),
  () => qk.overview.cmPulse('lowest_activity'),
  qk.overview.main,
];

export const INVALIDATION_MAP = {
  'demos.create': [qk.demos.root, ...overviewMetricKeys] as QueryKeyFactory[],
  'demos.update_status': [
    qk.demos.root,
    ...overviewMetricKeys,
    ...overviewAttentionKeys,
  ] as QueryKeyFactory[],
  'demos.convert': [
    qk.demos.root,
    qk.customers.all,
    ...overviewMetricKeys,
    ...overviewAttentionKeys,
  ] as QueryKeyFactory[],
  'settings.update': [
    qk.settings.root,
    qk.payroll.root,
    ...overviewMetricKeys,
  ] as QueryKeyFactory[],
} as const;

export async function invalidateFor(
  queryClient: QueryClient,
  operation: keyof typeof INVALIDATION_MAP,
) {
  const seen = new Set<string>();
  const tasks: Array<Promise<unknown>> = [];

  for (const factory of INVALIDATION_MAP[operation]) {
    const queryKey = factory();
    const serialized = JSON.stringify(queryKey);
    if (seen.has(serialized)) {
      continue;
    }
    seen.add(serialized);
    tasks.push(queryClient.invalidateQueries({ queryKey }));
  }

  await Promise.all(tasks);
}
