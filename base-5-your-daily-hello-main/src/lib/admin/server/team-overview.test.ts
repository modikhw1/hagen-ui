import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildTeamOverview,
  classifyLoad,
  MAX_CUSTOMERS_PER_CM,
} from '@/lib/admin/server/team-overview';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('team-overview helpers', () => {
  it('classifies load percent with percent-based thresholds', () => {
    expect(classifyLoad(2)).toMatchObject({
      customerLoadLevel: 'ok',
      customerLoadLabel: 'Lätt portfölj',
      overloaded: false,
    });

    expect(classifyLoad(6)).toMatchObject({
      customerLoadLevel: 'warn',
      customerLoadLabel: 'Balans',
      overloaded: false,
    });

    expect(classifyLoad(9)).toMatchObject({
      customerLoadLevel: 'overload',
      customerLoadLabel: 'Full portfölj',
      overloaded: false,
    });

    expect(classifyLoad(MAX_CUSTOMERS_PER_CM)).toMatchObject({
      customerLoadLevel: 'overload',
      customerLoadLabel: 'Överbelastad',
      overloaded: true,
    });
  });

  it('adds warning when legacy account manager fallback match is used', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = buildTeamOverview({
      members: [
        {
          id: 'cm-1',
          name: 'Alice CM',
          email: 'alice@example.com',
          phone: null,
          role: 'content_manager',
          is_active: true,
          profile_id: null,
          bio: null,
          city: null,
          avatar_url: null,
          commission_rate: 0.2,
          customer_count: null,
          mrr_ore: null,
          customer_load_level: null,
          customer_load_label: null,
          overloaded: null,
        },
      ],
      customers: [
        {
          id: 'cus-1',
          business_name: 'Legacy Match Co',
          monthly_price: 12000,
          status: 'active',
          paused_until: null,
          account_manager_profile_id: null,
          account_manager: 'alice cm',
          last_upload_at: null,
        },
      ],
      activities: [],
      assignments: [],
      absences: [],
      byCustomer: {},
      sortMode: 'standard',
    });

    expect(result.schemaWarnings).toContain('team-overview-legacy-am-match');
    expect(result.members).toHaveLength(1);
    expect(result.members[0]?.customers).toHaveLength(1);
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('returns degraded payload when one member aggregation fails', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const byCustomer = new Proxy<Record<string, { followers: number; videos_last_7d: number; engagement_rate: number }>>(
      {},
      {
        get(_target, property) {
          if (property === 'cus-break') {
            throw new Error('simulated byCustomer failure');
          }
          return undefined;
        },
      },
    );

    const result = buildTeamOverview({
      members: [
        {
          id: 'cm-break',
          name: 'Broken CM',
          email: 'broken@example.com',
          phone: null,
          role: 'content_manager',
          is_active: true,
          profile_id: 'profile-break',
          bio: null,
          city: null,
          avatar_url: null,
          commission_rate: 0.2,
          customer_count: null,
          mrr_ore: null,
          customer_load_level: null,
          customer_load_label: null,
          overloaded: null,
        },
        {
          id: 'cm-safe',
          name: 'Safe CM',
          email: 'safe@example.com',
          phone: null,
          role: 'content_manager',
          is_active: true,
          profile_id: 'profile-safe',
          bio: null,
          city: null,
          avatar_url: null,
          commission_rate: 0.2,
          customer_count: null,
          mrr_ore: null,
          customer_load_level: null,
          customer_load_label: null,
          overloaded: null,
        },
      ],
      customers: [
        {
          id: 'cus-break',
          business_name: 'Will Throw AB',
          monthly_price: 15000,
          status: 'active',
          paused_until: null,
          account_manager_profile_id: 'profile-break',
          account_manager: 'Broken CM',
          last_upload_at: null,
        },
      ],
      activities: [],
      assignments: [],
      absences: [],
      byCustomer,
      sortMode: 'standard',
    });

    expect(result.schemaWarnings).toContain('team-overview-degraded');
    expect(result.schemaWarnings.some((warning) => warning.startsWith('team-overview-member-skipped:cm-break'))).toBe(true);
    expect(result.members).toHaveLength(1);
    expect(result.members[0]?.id).toBe('cm-safe');
    expect(consoleSpy).toHaveBeenCalled();
  });
});
