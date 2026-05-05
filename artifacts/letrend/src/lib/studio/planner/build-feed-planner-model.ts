import { normalizePlannerInput } from './ingest';
import { buildPlannerOrdering } from './ordering';
import { buildFeedPlannerViewModel } from './projection';
import type { FeedPlannerViewModel, PlannerInput } from './types';

export function buildFeedPlannerModel(input: PlannerInput): FeedPlannerViewModel {
  const entries = normalizePlannerInput(input);
  const ordering = buildPlannerOrdering(entries);

  return buildFeedPlannerViewModel(
    ordering.timeline,
    ordering.boundaryIndex,
    input.now ?? new Date(),
    input.tempoWeekdays
  );
}
