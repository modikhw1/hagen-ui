import { describe, it, expect } from 'vitest';
import {
  scoreCandidate,
  rankCandidates,
  type HistoryConceptForScoring,
  type TargetConceptForScoring,
} from './reconciliation-scoring.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeHistory(overrides: Partial<HistoryConceptForScoring> = {}): HistoryConceptForScoring {
  return {
    id: 'hist-1',
    published_at: '2026-05-01T14:00:00.000Z',
    tiktok_url: 'https://www.tiktok.com/@handle/video/123',
    feed_order: -1,
    ...overrides,
  };
}

function makeTarget(overrides: Partial<TargetConceptForScoring> = {}): TargetConceptForScoring {
  return {
    id: 'tgt-1',
    feed_order: 1,
    planned_publish_at: '2026-05-03T12:00:00.000Z',
    is_already_reconciled: false,
    ...overrides,
  };
}

// ── Hard exclusion ────────────────────────────────────────────────────────────

describe('scoreCandidate — already_reconciled target', () => {
  it('returns score=0 and eligible=false when target is already reconciled', () => {
    const h = makeHistory();
    const t = makeTarget({ is_already_reconciled: true });
    const result = scoreCandidate(h, t);
    expect(result.score).toBe(0);
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('already_reconciled');
  });

  it('ignores all other signals when already_reconciled is true', () => {
    // Even a perfect match (nu-slot + ±0 days) gets 0 when target is reconciled
    const h = makeHistory({ published_at: '2026-05-01T00:00:00.000Z', feed_order: 0 });
    const t = makeTarget({ feed_order: 0, planned_publish_at: '2026-05-01T00:00:00.000Z', is_already_reconciled: true });
    const result = scoreCandidate(h, t);
    expect(result.score).toBe(0);
    expect(result.eligible).toBe(false);
  });
});

// ── Current slot bonus ────────────────────────────────────────────────────────

describe('scoreCandidate — current slot (feed_order=0)', () => {
  it('adds +40 for the nu-slot and sets current_slot reason', () => {
    // feed_order=-5 to avoid the adjacency bonus (|-5 - 0| = 5 > 1)
    const h = makeHistory({ published_at: null, feed_order: -5 });
    const t = makeTarget({ feed_order: 0, planned_publish_at: null, is_already_reconciled: false });
    const result = scoreCandidate(h, t);
    expect(result.score).toBe(40);
    expect(result.reasons).toContain('current_slot');
    expect(result.eligible).toBe(true);
  });

  it('does not add current_slot bonus for future slots (feed_order>0)', () => {
    const h = makeHistory({ published_at: null });
    const t = makeTarget({ feed_order: 2, planned_publish_at: null });
    const result = scoreCandidate(h, t);
    expect(result.reasons).not.toContain('current_slot');
  });
});

// ── Date proximity ────────────────────────────────────────────────────────────

describe('scoreCandidate — date_proximity_high (≤3 days)', () => {
  it('adds +40 and date_proximity_high for ±1 day match', () => {
    const h = makeHistory({ published_at: '2026-05-01T00:00:00.000Z' });
    const t = makeTarget({ planned_publish_at: '2026-05-02T00:00:00.000Z', feed_order: 1 });
    const result = scoreCandidate(h, t);
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.reasons).toContain('date_proximity_high');
  });

  it('adds +40 for exactly 3 days difference', () => {
    const h = makeHistory({ published_at: '2026-05-01T00:00:00.000Z' });
    const t = makeTarget({ planned_publish_at: '2026-05-04T00:00:00.000Z', feed_order: 1 });
    const result = scoreCandidate(h, t);
    expect(result.reasons).toContain('date_proximity_high');
  });
});

describe('scoreCandidate — date_proximity_medium (4-7 days)', () => {
  it('adds +25 and date_proximity_medium for 5-day difference', () => {
    const h = makeHistory({ published_at: '2026-05-01T00:00:00.000Z' });
    const t = makeTarget({ planned_publish_at: '2026-05-06T00:00:00.000Z', feed_order: 1 });
    const result = scoreCandidate(h, t);
    expect(result.reasons).toContain('date_proximity_medium');
    expect(result.reasons).not.toContain('date_proximity_high');
  });
});

describe('scoreCandidate — date_proximity_low (8-14 days)', () => {
  it('adds +10 and date_proximity_low for 10-day difference', () => {
    const h = makeHistory({ published_at: '2026-05-01T00:00:00.000Z' });
    const t = makeTarget({ planned_publish_at: '2026-05-11T00:00:00.000Z', feed_order: 1 });
    const result = scoreCandidate(h, t);
    expect(result.reasons).toContain('date_proximity_low');
    expect(result.score).toBe(10);
  });

  it('adds no date bonus for >14 days difference', () => {
    const h = makeHistory({ published_at: '2026-05-01T00:00:00.000Z' });
    const t = makeTarget({ planned_publish_at: '2026-05-20T00:00:00.000Z', feed_order: 1 });
    const result = scoreCandidate(h, t);
    expect(result.reasons).not.toContain('date_proximity_high');
    expect(result.reasons).not.toContain('date_proximity_medium');
    expect(result.reasons).not.toContain('date_proximity_low');
  });
});

// ── Missing date signals ──────────────────────────────────────────────────────

describe('scoreCandidate — no_published_at', () => {
  it('adds no_published_at reason and no date bonus when history has no published_at', () => {
    const h = makeHistory({ published_at: null });
    const t = makeTarget({ planned_publish_at: '2026-05-03T00:00:00.000Z', feed_order: 1 });
    const result = scoreCandidate(h, t);
    expect(result.reasons).toContain('no_published_at');
    expect(result.reasons).not.toContain('date_proximity_high');
    expect(result.reasons).not.toContain('date_proximity_medium');
    expect(result.reasons).not.toContain('date_proximity_low');
  });

  it('returns eligible=false when score is 0 (no slot bonus, no date)', () => {
    const h = makeHistory({ published_at: null, feed_order: -5 });
    const t = makeTarget({ planned_publish_at: '2026-05-03T00:00:00.000Z', feed_order: 3, is_already_reconciled: false });
    const result = scoreCandidate(h, t);
    expect(result.score).toBe(0);
    expect(result.eligible).toBe(false);
  });
});

describe('scoreCandidate — no_planned_date', () => {
  it('adds no_planned_date reason and no date bonus when target has no planned_publish_at', () => {
    const h = makeHistory({ published_at: '2026-05-01T00:00:00.000Z' });
    const t = makeTarget({ planned_publish_at: null, feed_order: 1 });
    const result = scoreCandidate(h, t);
    expect(result.reasons).toContain('no_planned_date');
    expect(result.reasons).not.toContain('date_proximity_high');
  });
});

// ── feed_order adjacency ──────────────────────────────────────────────────────

describe('scoreCandidate — feed_order_adjacent', () => {
  it('adds +5 and feed_order_adjacent when |history.feed_order - target.feed_order| <= 1', () => {
    const h = makeHistory({ published_at: null, feed_order: -1 });
    const t = makeTarget({ feed_order: 0, planned_publish_at: null }); // adjacent: |-1 - 0| = 1
    const result = scoreCandidate(h, t);
    expect(result.reasons).toContain('feed_order_adjacent');
    // current_slot +40, adjacent +5 = 45
    expect(result.score).toBe(45);
  });

  it('does not add adjacency bonus for non-adjacent feed_orders', () => {
    const h = makeHistory({ published_at: null, feed_order: -5 });
    const t = makeTarget({ feed_order: 0, planned_publish_at: null });
    const result = scoreCandidate(h, t);
    expect(result.reasons).not.toContain('feed_order_adjacent');
  });

  it('does not add adjacency bonus when either feed_order is null', () => {
    const h = makeHistory({ published_at: null, feed_order: null });
    const t = makeTarget({ feed_order: 0, planned_publish_at: null });
    const result = scoreCandidate(h, t);
    expect(result.reasons).not.toContain('feed_order_adjacent');
  });
});

// ── Combined scoring ──────────────────────────────────────────────────────────

describe('scoreCandidate — combined signals', () => {
  it('achieves maximum score for perfect match: nu-slot + same-day publish', () => {
    const h = makeHistory({ published_at: '2026-05-01T12:00:00.000Z', feed_order: -1 });
    const t = makeTarget({ feed_order: 0, planned_publish_at: '2026-05-01T10:00:00.000Z', is_already_reconciled: false });
    const result = scoreCandidate(h, t);
    // +40 current_slot + +40 date_high + +5 adjacent = 85
    expect(result.score).toBe(85);
    expect(result.eligible).toBe(true);
    expect(result.reasons).toContain('current_slot');
    expect(result.reasons).toContain('date_proximity_high');
    expect(result.reasons).toContain('feed_order_adjacent');
  });

  it('scores correctly for non-nu future slot with good date match', () => {
    const h = makeHistory({ published_at: '2026-05-10T00:00:00.000Z', feed_order: null });
    const t = makeTarget({ feed_order: 2, planned_publish_at: '2026-05-11T00:00:00.000Z', is_already_reconciled: false });
    const result = scoreCandidate(h, t);
    // +40 date_high only (no current_slot, no adjacency)
    expect(result.score).toBe(40);
    expect(result.reasons).toContain('date_proximity_high');
    expect(result.reasons).not.toContain('current_slot');
  });
});

// ── rankCandidates ────────────────────────────────────────────────────────────

describe('rankCandidates', () => {
  it('returns only eligible candidates sorted by score descending', () => {
    const h = makeHistory({ published_at: '2026-05-01T00:00:00.000Z', feed_order: -1 });
    const targets: TargetConceptForScoring[] = [
      makeTarget({ id: 'tgt-reconciled', feed_order: 1, planned_publish_at: '2026-05-01T00:00:00.000Z', is_already_reconciled: true }),
      makeTarget({ id: 'tgt-future-far', feed_order: 3, planned_publish_at: '2026-06-01T00:00:00.000Z', is_already_reconciled: false }),
      makeTarget({ id: 'tgt-nu-slot', feed_order: 0, planned_publish_at: '2026-05-02T00:00:00.000Z', is_already_reconciled: false }),
      makeTarget({ id: 'tgt-future-near', feed_order: 1, planned_publish_at: '2026-05-03T00:00:00.000Z', is_already_reconciled: false }),
    ];

    const ranked = rankCandidates(h, targets);

    // Already-reconciled target is excluded
    expect(ranked.map((r) => r.target.id)).not.toContain('tgt-reconciled');

    // Sorted by score descending
    const scores = ranked.map((r) => r.result.score);
    for (let i = 0; i < scores.length - 1; i++) {
      expect(scores[i]!).toBeGreaterThanOrEqual(scores[i + 1]!);
    }

    // Nu-slot should rank highest (current_slot + date_proximity_high + adjacent)
    expect(ranked[0]!.target.id).toBe('tgt-nu-slot');
  });

  it('returns empty array when all targets are already reconciled', () => {
    const h = makeHistory();
    const targets = [
      makeTarget({ id: 't1', is_already_reconciled: true }),
      makeTarget({ id: 't2', is_already_reconciled: true }),
    ];
    expect(rankCandidates(h, targets)).toHaveLength(0);
  });

  it('excludes targets where score is 0 and eligible is false', () => {
    // No published_at, no nu-slot, no adjacency → score=0
    const h = makeHistory({ published_at: null, feed_order: -10 });
    const targets = [
      makeTarget({ id: 't1', feed_order: 5, planned_publish_at: null, is_already_reconciled: false }),
    ];
    const ranked = rankCandidates(h, targets);
    expect(ranked).toHaveLength(0);
  });
});
