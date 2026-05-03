import { describe, expect, it } from 'vitest';
import { aggregateOverviewCosts } from '@/lib/admin/overview-costs';

describe('aggregateOverviewCosts', () => {
  it('groups service costs and normalizes them to ore', () => {
    expect(
      aggregateOverviewCosts([
        {
          service: 'Vertex AI',
          calls: 12,
          cost_sek: 15.75,
        },
        {
          service: 'Stripe fees',
          calls: 3,
          cost_sek: 4.5,
        },
        {
          service: 'Vertex storage',
          calls: 5,
          cost_sek: 2.25,
        },
      ]),
    ).toEqual({
      entries: [
        {
          service: 'Google Cloud (Vertex + GCS)',
          calls_30d: 17,
          cost_30d: 1800,
          trend: [1575, 225],
        },
        {
          service: 'Gemini API',
          calls_30d: 0,
          cost_30d: 0,
          trend: [],
        },
        {
          service: 'TikTok Fetcher',
          calls_30d: 0,
          cost_30d: 0,
          trend: [],
        },
        {
          service: 'Supabase',
          calls_30d: 0,
          cost_30d: 0,
          trend: [],
        },
        {
          service: 'Stripe',
          calls_30d: 3,
          cost_30d: 450,
          trend: [450],
        },
      ],
      totalOre: 2250,
    });
  });

  it('ignores resend rows and preserves negative cost adjustments', () => {
    expect(
      aggregateOverviewCosts([
        {
          service: 'Resend',
          calls: 8,
          cost_sek: 99,
        },
        {
          service: 'Supabase',
          calls: 4,
          cost_sek: -3,
        },
      ]),
    ).toEqual({
      entries: [
        {
          service: 'Google Cloud (Vertex + GCS)',
          calls_30d: 0,
          cost_30d: 0,
          trend: [],
        },
        {
          service: 'Gemini API',
          calls_30d: 0,
          cost_30d: 0,
          trend: [],
        },
        {
          service: 'TikTok Fetcher',
          calls_30d: 0,
          cost_30d: 0,
          trend: [],
        },
        {
          service: 'Supabase',
          calls_30d: 4,
          cost_30d: -300,
          trend: [-300],
        },
        {
          service: 'Stripe',
          calls_30d: 0,
          cost_30d: 0,
          trend: [],
        },
      ],
      totalOre: -300,
    });
  });
});
