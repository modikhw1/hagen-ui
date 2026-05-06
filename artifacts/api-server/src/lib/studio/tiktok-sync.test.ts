import { describe, it, expect } from 'vitest';
import {
  buildCronLogPayload,
  filterEligibleCustomers,
  type BatchResult,
  type CronRunLogInsert,
  type EligibleCustomer,
} from './tiktok-sync.js';

// ── buildCronLogPayload ───────────────────────────────────────────────────────

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

// ── filterEligibleCustomers ───────────────────────────────────────────────────

const NOW = '2026-05-06T12:00:00.000Z';
const TWO_H_AGO = '2026-05-06T10:00:00.000Z';    // very recent sync (inside staleness)
const SIX_H_AGO = '2026-05-06T06:00:00.000Z';    // old enough sync (outside staleness)
const TWO_DAYS_AGO = '2026-05-04T12:00:00.000Z'; // outside quiet 1×/day
const FIFTEEN_DAYS_AGO = '2026-04-21T12:00:00.000Z';

// CUTOFF = 4h ago boundary; SIX_H_AGO (06:00) < CUTOFF (08:00) → eligible
// TWO_H_AGO (10:00) > CUTOFF (08:00) → NOT eligible
const CUTOFF = '2026-05-06T08:00:00.000Z';
const QUIET_CUTOFF = FIFTEEN_DAYS_AGO;
const DAILY_CUTOFF = TWO_DAYS_AGO;

const OPTS = { cutoff: CUTOFF, quietCutoff: QUIET_CUTOFF, dailyCutoff: DAILY_CUTOFF };

function makeCustomer(overrides: Partial<EligibleCustomer>): EligibleCustomer {
  return {
    id: 'cust-1',
    tiktok_handle: '@testhandle',
    status: 'active',
    last_history_sync_at: null,
    last_upload_at: null,
    ...overrides,
  };
}

describe('filterEligibleCustomers', () => {
  it('excludes customers without a tiktok_handle', () => {
    const c = makeCustomer({ tiktok_handle: null });
    expect(filterEligibleCustomers([c], OPTS)).toHaveLength(0);
  });

  it('excludes customers with an empty tiktok_handle', () => {
    const c = makeCustomer({ tiktok_handle: '   ' });
    expect(filterEligibleCustomers([c], OPTS)).toHaveLength(0);
  });

  it('includes customers that have never been synced', () => {
    const c = makeCustomer({ last_history_sync_at: null });
    expect(filterEligibleCustomers([c], OPTS)).toHaveLength(1);
  });

  it('includes active customers synced outside the staleness window', () => {
    // last_upload_at is recent → not quiet; last sync is older than cutoff → eligible
    const c = makeCustomer({ last_history_sync_at: SIX_H_AGO, last_upload_at: NOW });
    expect(filterEligibleCustomers([c], OPTS)).toHaveLength(1);
  });

  it('excludes active customers synced within the staleness window', () => {
    const c = makeCustomer({ last_history_sync_at: TWO_H_AGO, last_upload_at: NOW });
    expect(filterEligibleCustomers([c], OPTS)).toHaveLength(0);
  });

  it('includes quiet customers whose last sync is older than the daily cutoff', () => {
    // quiet = no upload in 15+ days; last sync >2 days ago → eligible once per day
    const c = makeCustomer({ last_history_sync_at: TWO_DAYS_AGO, last_upload_at: FIFTEEN_DAYS_AGO });
    expect(filterEligibleCustomers([c], OPTS)).toHaveLength(1);
  });

  it('excludes quiet customers synced recently (within daily cutoff)', () => {
    // quiet customer but synced 2h ago — still within the 2-day daily cutoff
    const c = makeCustomer({ last_history_sync_at: TWO_H_AGO, last_upload_at: FIFTEEN_DAYS_AGO });
    expect(filterEligibleCustomers([c], OPTS)).toHaveLength(0);
  });

  it('respects maxCustomers slicing after filtering', () => {
    const customers: EligibleCustomer[] = [
      makeCustomer({ id: 'c1', last_history_sync_at: null }),
      makeCustomer({ id: 'c2', last_history_sync_at: null }),
      makeCustomer({ id: 'c3', last_history_sync_at: null }),
    ];
    const all = filterEligibleCustomers(customers, OPTS);
    expect(all).toHaveLength(3);
    // Slicing (as done in runHistorySyncBatch when maxCustomers is set)
    expect(all.slice(0, 1)).toHaveLength(1);
    expect(all.slice(0, 2)).toHaveLength(2);
  });
});
