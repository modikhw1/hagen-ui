import { DEFAULT_TEMPO_WEEKDAYS, projectTempoDate } from '@/lib/feed-planner-utils';
import type {
  FeedPlannerCardModel,
  FeedPlannerCurrentPlaceholder,
  FeedPlannerGridProjection,
  FeedPlannerViewModel,
  PlannerVisualCell,
  PlannerVisualCellKind,
} from './types';

export interface FeedPlannerGridProjectionOptions {
  columns?: number;
  currentCellIndex?: number;
  minimumCells?: number;
  now?: Date;
  tempoWeekdays?: number[];
}

function toIsoDateString(date: Date | null): string | null {
  if (!date) return null;
  return date.toISOString();
}

function projectFutureDate(
  relativePosition: number,
  now: Date,
  tempoWeekdays: number[]
): string | null {
  if (relativePosition <= 0) return toIsoDateString(new Date(now));
  return toIsoDateString(projectTempoDate(relativePosition, new Date(now), tempoWeekdays));
}

function makeCell(args: {
  kind: PlannerVisualCellKind;
  cellIndex: number;
  columns: number;
  relativePosition: number;
  projectedDate: string | null;
  card?: FeedPlannerCardModel | null;
  placeholder?: FeedPlannerCurrentPlaceholder | null;
}): PlannerVisualCell {
  return {
    kind: args.kind,
    cellIndex: args.cellIndex,
    rowIndex: Math.floor(args.cellIndex / args.columns),
    columnIndex: args.cellIndex % args.columns,
    relativePosition: args.relativePosition,
    projectedDate: args.projectedDate,
    card: args.card ?? null,
    placeholder: args.placeholder ?? null,
  };
}

function toRows(cells: PlannerVisualCell[], columns: number): PlannerVisualCell[][] {
  const rows: PlannerVisualCell[][] = [];
  for (let index = 0; index < cells.length; index += columns) {
    rows.push(cells.slice(index, index + columns));
  }
  return rows;
}

export function buildFeedPlannerGridProjection(
  model: Omit<FeedPlannerViewModel, 'grid'>,
  options: FeedPlannerGridProjectionOptions = {}
): FeedPlannerGridProjection {
  const columns = options.columns ?? 3;
  const currentCellIndex = options.currentCellIndex ?? 4;
  const minimumCells = options.minimumCells ?? 9;
  const now = options.now ?? new Date();
  const tempoWeekdays = options.tempoWeekdays ?? DEFAULT_TEMPO_WEEKDAYS;
  const latestFirstPastCards = [...model.pastCards].reverse();
  const cells: PlannerVisualCell[] = [];

  for (let cellIndex = 0; cellIndex < currentCellIndex; cellIndex += 1) {
    const visualDistanceFromNow = currentCellIndex - cellIndex;
    const relativePosition = visualDistanceFromNow;
    const card = model.upcomingCards[visualDistanceFromNow - 1] ?? null;
    cells.push(
      makeCell({
        kind: card ? 'card' : 'insert_invite',
        cellIndex,
        columns,
        relativePosition,
        projectedDate: card?.projectedDate ?? projectFutureDate(relativePosition, now, tempoWeekdays),
        card,
      })
    );
  }

  cells.push(
    makeCell({
      kind: model.currentCard ? 'card' : 'current_placeholder',
      cellIndex: currentCellIndex,
      columns,
      relativePosition: 0,
      projectedDate:
        model.currentCard?.projectedDate ??
        model.currentPlaceholder?.projectedDate ??
        toIsoDateString(new Date(now)),
      card: model.currentCard,
      placeholder: model.currentPlaceholder,
    })
  );

  const requiredCellCount = Math.max(
    minimumCells,
    currentCellIndex + 1 + latestFirstPastCards.length
  );
  const rowAlignedCellCount = Math.ceil(requiredCellCount / columns) * columns;

  for (let cellIndex = currentCellIndex + 1; cellIndex < rowAlignedCellCount; cellIndex += 1) {
    const historyIndex = cellIndex - currentCellIndex - 1;
    const card = latestFirstPastCards[historyIndex] ?? null;
    cells.push(
      makeCell({
        kind: card ? 'card' : 'let_pad',
        cellIndex,
        columns,
        relativePosition: -(historyIndex + 1),
        projectedDate: card?.projectedDate ?? null,
        card,
      })
    );
  }

  return {
    columns,
    currentCellIndex,
    cells,
    rows: toRows(cells, columns),
  };
}
