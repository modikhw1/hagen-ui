import { describe, expect, it } from 'vitest';
import {
  computeUnreadCount,
  deriveAttention,
  type AttentionItem,
} from './attention.js';

const NOW = new Date('2025-06-15T12:00:00.000Z');
const TODAY = '2025-06-15';

type Tables = Record<string, any[]>;

function makeFakeSupabase(tables: Tables) {
  return {
    from(table: string) {
      let rows: any[] = (tables[table] ?? []).slice();
      const builder: any = {
        select() {
          return builder;
        },
        eq(col: string, val: any) {
          rows = rows.filter((r) => r[col] === val);
          return builder;
        },
        is(col: string, val: any) {
          rows = rows.filter((r) => (r[col] ?? null) === val);
          return builder;
        },
        in(col: string, vals: any[]) {
          rows = rows.filter((r) => vals.includes(r[col]));
          return builder;
        },
        lt(col: string, val: any) {
          rows = rows.filter((r) => r[col] != null && r[col] < val);
          return builder;
        },
        gte(col: string, val: any) {
          rows = rows.filter((r) => r[col] != null && r[col] >= val);
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        maybeSingle() {
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
        then(onFulfilled: any, onRejected: any) {
          return Promise.resolve({ data: rows, error: null }).then(
            onFulfilled,
            onRejected,
          );
        },
      };
      return builder;
    },
  } as any;
}

const TEAM_ROW = (id: string, name: string) => ({
  id,
  name,
  role: 'cm',
  is_active: true,
});

describe('deriveAttention - 9 attention kinds', () => {
  it('emits invoice_unpaid for open invoices past their due date', async () => {
    const supabase = makeFakeSupabase({
      team_members: [TEAM_ROW('cm1', 'Alice')],
      cm_assignments: [
        { id: 'a1', customer_id: 'c1', cm_id: 'cm1', valid_to: null, scheduled_change: null },
      ],
      invoices: [
        {
          id: 'inv1',
          customer_profile_id: 'c1',
          invoice_number: 'INV-1',
          amount_due: 50000,
          due_date: '2025-06-01',
          status: 'open',
          hosted_invoice_url: 'https://stripe/i/1',
        },
        // Excluded: not yet due
        {
          id: 'inv2',
          customer_profile_id: 'c1',
          invoice_number: 'INV-2',
          amount_due: 10,
          due_date: '2025-12-01',
          status: 'open',
          hosted_invoice_url: null,
        },
        // Excluded: already paid
        {
          id: 'inv3',
          customer_profile_id: 'c1',
          invoice_number: 'INV-3',
          amount_due: 1,
          due_date: '2025-01-01',
          status: 'paid',
          hosted_invoice_url: null,
        },
      ],
      customer_profiles: [{ id: 'c1', business_name: 'Cafe Ros' }],
    });

    const { open } = await deriveAttention(supabase, NOW);
    const invoices = open.filter((i) => i.kind === 'invoice_unpaid');
    expect(invoices).toHaveLength(1);
    const inv = invoices[0]!;
    expect(inv).toMatchObject({
      kind: 'invoice_unpaid',
      id: 'inv1',
      subjectType: 'invoice',
      subjectId: 'inv1',
      customerId: 'c1',
      customerName: 'Cafe Ros',
      invoiceNumber: 'INV-1',
      amount_ore: 50000,
      hostedInvoiceUrl: 'https://stripe/i/1',
      cmName: 'Alice',
    });
    expect(inv.kind === 'invoice_unpaid' && inv.daysPastDue).toBe(14);
  });

  it('emits onboarding_stuck only after the threshold has elapsed', async () => {
    const supabase = makeFakeSupabase({
      customer_profiles: [
        // Stuck for 10 days — included
        {
          id: 'c1',
          business_name: 'Stuck Co',
          status: 'active',
          onboarding_state: 'cm_ready',
          updated_at: '2025-06-05T00:00:00.000Z',
        },
        // Only 1 day — excluded (below 5d threshold)
        {
          id: 'c2',
          business_name: 'Fresh Co',
          status: 'invited',
          onboarding_state: 'invited',
          updated_at: '2025-06-14T00:00:00.000Z',
        },
        // Onboarded already — excluded
        {
          id: 'c3',
          business_name: 'Done Co',
          status: 'active',
          onboarding_state: 'onboarded',
          updated_at: '2025-01-01T00:00:00.000Z',
        },
      ],
    });

    const { open } = await deriveAttention(supabase, NOW);
    const stuck = open.filter((i) => i.kind === 'onboarding_stuck');
    expect(stuck.map((s) => s.id)).toEqual(['c1']);
    expect(stuck[0]).toMatchObject({
      kind: 'onboarding_stuck',
      subjectType: 'onboarding',
      customerId: 'c1',
      customerName: 'Stuck Co',
      daysSinceCmReady: 10,
    });
  });

  it('emits customer_blocked for blocked status (and paused-without-resume)', async () => {
    const supabase = makeFakeSupabase({
      customer_profiles: [
        {
          id: 'b1',
          business_name: 'Blocked',
          status: 'blocked',
          updated_at: '2025-06-10T00:00:00.000Z',
        },
        {
          id: 'b2',
          business_name: 'Paused-NoDate',
          status: 'paused',
          paused_until: null,
          updated_at: '2025-06-12T00:00:00.000Z',
        },
        // Excluded: paused but with a future resume date
        {
          id: 'p1',
          business_name: 'Paused',
          status: 'paused',
          paused_until: '2025-09-01',
          updated_at: '2025-06-01T00:00:00.000Z',
        },
      ],
    });

    const { open } = await deriveAttention(supabase, NOW);
    const blocked = open.filter((i) => i.kind === 'customer_blocked');
    expect(blocked.map((b) => b.id).sort()).toEqual(['b1', 'b2']);
  });

  it('emits pause_resume_due_today only when paused_until is today', async () => {
    const supabase = makeFakeSupabase({
      customer_profiles: [
        {
          id: 'r1',
          business_name: 'Resume Today',
          status: 'paused',
          paused_until: TODAY,
          updated_at: '2025-06-01T00:00:00.000Z',
        },
        {
          id: 'r2',
          business_name: 'Resume Later',
          status: 'paused',
          paused_until: '2025-06-20',
          updated_at: '2025-06-01T00:00:00.000Z',
        },
        {
          id: 'r3',
          business_name: 'Resume Past',
          status: 'paused',
          paused_until: '2025-06-01',
          updated_at: '2025-06-01T00:00:00.000Z',
        },
      ],
    });

    const { open } = await deriveAttention(supabase, NOW);
    const resumes = open.filter((i) => i.kind === 'pause_resume_due_today');
    expect(resumes.map((r) => r.id)).toEqual(['r1']);
    expect(resumes[0]).toMatchObject({
      kind: 'pause_resume_due_today',
      subjectType: 'subscription_pause_resume',
      customerId: 'r1',
      resumeDate: TODAY,
    });
  });

  it('emits cm_change_due_today when a scheduled CM change becomes effective today', async () => {
    const supabase = makeFakeSupabase({
      team_members: [TEAM_ROW('cm1', 'Alice'), TEAM_ROW('cm2', 'Bob')],
      cm_assignments: [
        {
          id: 'a1',
          customer_id: 'c1',
          cm_id: 'cm1',
          valid_to: null,
          scheduled_change: { effective_date: TODAY, next_cm_id: 'cm2' },
        },
        {
          id: 'a2',
          customer_id: 'c2',
          cm_id: 'cm1',
          valid_to: null,
          scheduled_change: { effective_date: '2025-07-01', next_cm_id: 'cm2' },
        },
      ],
      customer_profiles: [
        { id: 'c1', business_name: 'A&B' },
        { id: 'c2', business_name: 'Later' },
      ],
    });

    const { open } = await deriveAttention(supabase, NOW);
    const changes = open.filter((i) => i.kind === 'cm_change_due_today');
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      kind: 'cm_change_due_today',
      subjectType: 'cm_assignment',
      subjectId: 'a1',
      customerId: 'c1',
      customerName: 'A&B',
      currentCmName: 'Alice',
      nextCmName: 'Bob',
      effectiveDate: TODAY,
    });
  });

  it('emits credit_note_failed only when requires_attention is true', async () => {
    const supabase = makeFakeSupabase({
      credit_note_operations: [
        {
          id: 'op1',
          operation_type: 'refund',
          customer_profile_id: 'c1',
          amount_ore: 12345,
          created_at: '2025-06-14T00:00:00.000Z',
          error_message: 'stripe rejected',
          attention_reason: 'check tax',
          requires_attention: true,
        },
        {
          id: 'op2',
          operation_type: 'refund',
          customer_profile_id: 'c1',
          amount_ore: 1,
          created_at: '2025-06-14T00:00:00.000Z',
          error_message: null,
          attention_reason: null,
          requires_attention: false,
        },
      ],
      customer_profiles: [{ id: 'c1', business_name: 'CN Co' }],
    });

    const { open } = await deriveAttention(supabase, NOW);
    const cn = open.filter((i) => i.kind === 'credit_note_failed');
    expect(cn.map((c) => c.id)).toEqual(['op1']);
    expect(cn[0]).toMatchObject({
      kind: 'credit_note_failed',
      subjectType: 'credit_note_operation',
      customerId: 'c1',
      customerName: 'CN Co',
      operationType: 'refund',
      amount_ore: 12345,
      errorMessage: 'stripe rejected',
      attentionReason: 'check tax',
    });
  });

  it('emits cm_notification only when not yet resolved', async () => {
    const supabase = makeFakeSupabase({
      team_members: [TEAM_ROW('cm1', 'Alice')],
      cm_notifications: [
        {
          id: 'n1',
          from_cm_id: 'cm1',
          customer_id: 'c1',
          message: 'urgent please look',
          priority: 'urgent',
          created_at: '2025-06-14T00:00:00.000Z',
          resolved_at: null,
        },
        {
          id: 'n2',
          from_cm_id: 'cm1',
          customer_id: null,
          message: 'old',
          priority: 'normal',
          created_at: '2025-06-13T00:00:00.000Z',
          resolved_at: '2025-06-14T00:00:00.000Z',
        },
      ],
    });

    const { open } = await deriveAttention(supabase, NOW);
    const notes = open.filter((i) => i.kind === 'cm_notification');
    expect(notes.map((n) => n.id)).toEqual(['n1']);
    expect(notes[0]).toMatchObject({
      kind: 'cm_notification',
      subjectType: 'cm_notification',
      priority: 'urgent',
      from: 'Alice',
      message: 'urgent please look',
      customerId: 'c1',
    });
  });

  it('emits demo_responded only when status=responded and not resolved', async () => {
    const supabase = makeFakeSupabase({
      demos: [
        {
          id: 'd1',
          company_name: 'New Lead',
          status: 'responded',
          responded_at: '2025-06-14T00:00:00.000Z',
          resolved_at: null,
        },
        {
          id: 'd2',
          company_name: 'Already Handled',
          status: 'responded',
          responded_at: '2025-06-10T00:00:00.000Z',
          resolved_at: '2025-06-11T00:00:00.000Z',
        },
        {
          id: 'd3',
          company_name: 'Pending',
          status: 'pending',
          responded_at: null,
          resolved_at: null,
        },
      ],
    });

    const { open } = await deriveAttention(supabase, NOW);
    const demos = open.filter((i) => i.kind === 'demo_responded');
    expect(demos.map((d) => d.id)).toEqual(['d1']);
    expect(demos[0]).toMatchObject({
      kind: 'demo_responded',
      subjectType: 'demo_response',
      companyName: 'New Lead',
    });
  });

  it('emits cm_low_activity when interactions are below the expected ratio', async () => {
    const within = new Date(NOW.getTime() - 1 * 86_400_000).toISOString();
    const supabase = makeFakeSupabase({
      team_members: [TEAM_ROW('low', 'Slow CM'), TEAM_ROW('high', 'Active CM')],
      cm_assignments: [
        { id: 'a-low', customer_id: 'cl', cm_id: 'low', valid_to: null, scheduled_change: null },
        { id: 'a-high', customer_id: 'ch', cm_id: 'high', valid_to: null, scheduled_change: null },
      ],
      customer_profiles: [
        // expected = 4 concepts/week, actual 1 → ratio 0.25 (low)
        { id: 'cl', status: 'active', concepts_per_week: 4 },
        // expected = 2, actual 5 → ratio above threshold (not low)
        { id: 'ch', status: 'active', concepts_per_week: 2 },
      ],
      cm_interactions: [
        { cm_id: 'low', customer_id: 'cl', created_at: within },
        ...Array.from({ length: 5 }, () => ({
          cm_id: 'high',
          customer_id: 'ch',
          created_at: within,
        })),
        // older than 7 days, should be filtered out by gte()
        { cm_id: 'low', customer_id: 'cl', created_at: '2025-01-01T00:00:00.000Z' },
      ],
    });

    const { open } = await deriveAttention(supabase, NOW);
    const low = open.filter((i) => i.kind === 'cm_low_activity');
    expect(low.map((l) => l.id)).toEqual(['low']);
    expect(low[0]).toMatchObject({
      kind: 'cm_low_activity',
      subjectType: 'cm_activity',
      cmName: 'Slow CM',
      interactionCount7d: 1,
      expectedConcepts7d: 4,
    });
  });
});

describe('deriveAttention - snoozes', () => {
  function buildSnoozedFixture(snoozes: any[]) {
    return makeFakeSupabase({
      team_members: [TEAM_ROW('cm1', 'Alice')],
      cm_assignments: [],
      customer_profiles: [{ id: 'c1', business_name: 'Cafe Ros' }],
      invoices: [
        {
          id: 'inv1',
          customer_profile_id: 'c1',
          invoice_number: 'INV-1',
          amount_due: 1000,
          due_date: '2025-06-01',
          status: 'open',
          hosted_invoice_url: null,
        },
      ],
      attention_snoozes: snoozes,
    });
  }

  it('moves an active snoozed item from open into snoozed', async () => {
    const supabase = buildSnoozedFixture([
      {
        subject_type: 'invoice',
        subject_id: 'inv1',
        snoozed_until: '2025-12-31T00:00:00.000Z',
        released_at: null,
      },
    ]);
    const { open, snoozed } = await deriveAttention(supabase, NOW);
    expect(open.find((i) => i.subjectId === 'inv1')).toBeUndefined();
    expect(snoozed.find((i) => i.subjectId === 'inv1')).toBeDefined();
  });

  it('does not filter when the snooze has been released', async () => {
    const supabase = buildSnoozedFixture([
      {
        subject_type: 'invoice',
        subject_id: 'inv1',
        snoozed_until: '2025-12-31T00:00:00.000Z',
        released_at: '2025-06-10T00:00:00.000Z',
      },
    ]);
    const { open, snoozed } = await deriveAttention(supabase, NOW);
    expect(open.find((i) => i.subjectId === 'inv1')).toBeDefined();
    expect(snoozed).toHaveLength(0);
  });

  it('does not filter when the snooze has expired', async () => {
    const supabase = buildSnoozedFixture([
      {
        subject_type: 'invoice',
        subject_id: 'inv1',
        snoozed_until: '2025-06-01T00:00:00.000Z',
        released_at: null,
      },
    ]);
    const { open, snoozed } = await deriveAttention(supabase, NOW);
    expect(open.find((i) => i.subjectId === 'inv1')).toBeDefined();
    expect(snoozed).toHaveLength(0);
  });

  it('uses subject_type::subject_id as the snooze match key', async () => {
    // Wrong subject_type — should not match the invoice item
    const supabase = buildSnoozedFixture([
      {
        subject_type: 'cm_notification',
        subject_id: 'inv1',
        snoozed_until: '2025-12-31T00:00:00.000Z',
        released_at: null,
      },
    ]);
    const { open, snoozed } = await deriveAttention(supabase, NOW);
    expect(open.find((i) => i.subjectId === 'inv1')).toBeDefined();
    expect(snoozed).toHaveLength(0);
  });
});

describe('computeUnreadCount', () => {
  const baseInvoice: AttentionItem = {
    kind: 'invoice_unpaid',
    id: 'inv1',
    subjectType: 'invoice',
    subjectId: 'inv1',
    customerId: 'c1',
    customerName: 'Cafe Ros',
    invoiceNumber: 'INV-1',
    daysPastDue: 1,
    amount_ore: 1000,
    hostedInvoiceUrl: null,
  };
  const oldNotif: AttentionItem = {
    kind: 'cm_notification',
    id: 'n-old',
    subjectType: 'cm_notification',
    subjectId: 'n-old',
    priority: 'normal',
    createdAt: '2025-06-10T00:00:00.000Z',
    from: 'Alice',
    message: 'old',
    customerId: null,
  };
  const newNotif: AttentionItem = {
    kind: 'cm_notification',
    id: 'n-new',
    subjectType: 'cm_notification',
    subjectId: 'n-new',
    priority: 'normal',
    createdAt: '2025-06-15T11:30:00.000Z',
    from: 'Alice',
    message: 'fresh',
    customerId: null,
  };

  it('counts every open item when lastSeenAt is null', () => {
    expect(computeUnreadCount([baseInvoice, oldNotif, newNotif], null, NOW)).toBe(3);
  });

  it('only counts items whose timestamp is strictly newer than lastSeenAt', () => {
    const lastSeen = '2025-06-14T00:00:00.000Z';
    // baseInvoice timestamp = NOW - 1 day = 2025-06-14T12:00 → newer
    // oldNotif = 2025-06-10 → older, excluded
    // newNotif = 2025-06-15T11:30 → newer
    expect(computeUnreadCount([baseInvoice, oldNotif, newNotif], lastSeen, NOW)).toBe(2);
  });

  it('returns 0 when every open item is older than lastSeenAt', () => {
    const lastSeen = '2025-12-31T00:00:00.000Z';
    expect(computeUnreadCount([baseInvoice, oldNotif, newNotif], lastSeen, NOW)).toBe(0);
  });

  it('treats items with no comparable timestamp as not unread', () => {
    const orphan: AttentionItem = { ...oldNotif, createdAt: '' };
    expect(
      computeUnreadCount([orphan], '2025-06-14T00:00:00.000Z', NOW),
    ).toBe(0);
  });
});
