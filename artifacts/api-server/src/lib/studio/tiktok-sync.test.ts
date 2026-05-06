import { describe, it, expect } from 'vitest';
import { buildCronLogPayload, type BatchResult, type CronRunLogInsert } from './tiktok-sync.js';

const BASE_BATCH: BatchResult = {
  processed: 3,
  imported: 1,
  statsUpdated: 5,
  errors: [],
  callsUsed: 6,
  budgetRemaining: 794,
  budgetExceeded: false,
  staleLocksCleared: 0,
  thumbnailsRefreshed: 2,
};

const START = '2026-05-06T10:00:00.000Z';
const FINISH = '2026-05-06T10:01:00.000Z';

const REQUIRED_FIELDS: Array<keyof CronRunLogInsert> = [
  'started_at',
  'finished_at',
  'processed',
  'imported',
  'stats_updated',
  'thumbnails_refreshed',
  'calls_used',
  'budget_remaining',
  'budget_exceeded',
  'stale_locks_cleared',
  'errors',
];

describe('buildCronLogPayload', () => {
  it('contains all required cron_run_log columns', () => {
    const payload = buildCronLogPayload(BASE_BATCH, START, FINISH);
    for (const field of REQUIRED_FIELDS) {
      expect(Object.prototype.hasOwnProperty.call(payload, field), `missing column: ${field}`).toBe(true);
    }
  });

  it('maps camelCase BatchResult fields to snake_case column names', () => {
    const payload = buildCronLogPayload(BASE_BATCH, START, FINISH);
    expect(payload.stats_updated).toBe(BASE_BATCH.statsUpdated);
    expect(payload.calls_used).toBe(BASE_BATCH.callsUsed);
    expect(payload.budget_remaining).toBe(BASE_BATCH.budgetRemaining);
    expect(payload.budget_exceeded).toBe(BASE_BATCH.budgetExceeded);
    expect(payload.stale_locks_cleared).toBe(BASE_BATCH.staleLocksCleared);
    expect(payload.thumbnails_refreshed).toBe(2);
  });

  it('sets timestamps from the arguments, not from the BatchResult', () => {
    const payload = buildCronLogPayload(BASE_BATCH, START, FINISH);
    expect(payload.started_at).toBe(START);
    expect(payload.finished_at).toBe(FINISH);
  });

  it('sets errors to null when errors array is empty', () => {
    const payload = buildCronLogPayload(BASE_BATCH, START, FINISH);
    expect(payload.errors).toBeNull();
  });

  it('preserves errors array when batch has errors', () => {
    const batch: BatchResult = {
      ...BASE_BATCH,
      errors: [{ customerId: 'abc-123', error: 'timeout' }],
    };
    const payload = buildCronLogPayload(batch, START, FINISH);
    expect(payload.errors).toHaveLength(1);
    expect(payload.errors?.[0]?.customerId).toBe('abc-123');
  });

  it('defaults thumbnails_refreshed to 0 when undefined in BatchResult', () => {
    const batch: BatchResult = { ...BASE_BATCH, thumbnailsRefreshed: undefined };
    const payload = buildCronLogPayload(batch, START, FINISH);
    expect(payload.thumbnails_refreshed).toBe(0);
  });
});
