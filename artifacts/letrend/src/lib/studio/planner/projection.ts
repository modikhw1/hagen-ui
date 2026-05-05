import { DEFAULT_TEMPO_WEEKDAYS, projectTempoDate } from '@/lib/feed-planner-utils';
import { buildPlannerCardModel } from './cards';
import { buildFeedPlannerGridProjection } from './grid-projection';
import type {
  FeedPlannerCurrentPlaceholder,
  FeedPlannerViewModel,
  PlannerTimelineNode,
} from './types';

function toIsoDateString(date: Date | null): string | null {
  if (!date) return null;
  return date.toISOString();
}

function projectNodeDate(node: PlannerTimelineNode, now: Date, tempoWeekdays: number[]): string | null {
  if (node.state === 'past') {
    return node.occurredAt;
  }

  if (node.state === 'now') {
    return toIsoDateString(new Date(now));
  }

  return toIsoDateString(projectTempoDate(node.relativePosition, new Date(now), tempoWeekdays));
}

export function buildFeedPlannerViewModel(
  timeline: PlannerTimelineNode[],
  boundaryIndex: number,
  now: Date,
  tempoWeekdays: number[] = DEFAULT_TEMPO_WEEKDAYS
): FeedPlannerViewModel {
  const futureCount = timeline.filter((node) => node.zone === 'future').length;
  const cards = timeline.map((node) =>
    buildPlannerCardModel(node, projectNodeDate(node, now, tempoWeekdays), {
      futureCount,
    })
  );
  const pastCards = cards.filter((card) => card.state === 'past');
  const currentCard = cards.find((card) => card.state === 'now') ?? null;
  const upcomingCards = cards.filter((card) => card.state === 'upcoming');
  const currentPlaceholder: FeedPlannerCurrentPlaceholder | null = currentCard
    ? null
    : {
        state: 'now',
        positionLabel: 'Nu',
        projectedDate: toIsoDateString(new Date(now)),
        reason: 'current_placeholder',
      };

  const model = {
    boundaryIndex,
    cards,
    pastCards,
    currentCard,
    upcomingCards,
    currentPlaceholder,
    hasPast: pastCards.length > 0,
    hasPlanned: currentCard !== null || upcomingCards.length > 0,
  };

  return {
    ...model,
    grid: buildFeedPlannerGridProjection(model, {
      now,
      tempoWeekdays,
    }),
  };
}
