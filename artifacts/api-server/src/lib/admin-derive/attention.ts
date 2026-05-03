import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdmin } from '../supabase.js';
import { logger } from '../logger.js';

export type AttentionItem =
  | {
      kind: 'cm_notification';
      id: string;
      subjectType: 'cm_notification';
      subjectId: string;
      priority: 'normal' | 'urgent';
      createdAt: string;
      from: string;
      message: string;
      customerId: string | null;
      cmName?: string;
    }
  | {
      kind: 'invoice_unpaid';
      id: string;
      subjectType: 'invoice';
      subjectId: string;
      customerId: string;
      customerName: string;
      invoiceNumber: string | null;
      daysPastDue: number;
      amount_ore: number;
      hostedInvoiceUrl: string | null;
      cmName?: string;
    }
  | {
      kind: 'onboarding_stuck';
      id: string;
      subjectType: 'onboarding';
      subjectId: string;
      customerId: string;
      customerName: string;
      daysSinceCmReady: number;
      cmName?: string;
    }
  | {
      kind: 'demo_responded';
      id: string;
      subjectType: 'demo_response';
      subjectId: string;
      respondedAt: string;
      companyName: string;
      cmName?: string;
    }
  | {
      kind: 'customer_blocked';
      id: string;
      subjectType: 'customer_blocking';
      subjectId: string;
      customerId: string;
      customerName: string;
      daysBlocked: number;
      cmName?: string;
    }
  | {
      kind: 'cm_change_due_today';
      id: string;
      subjectType: 'cm_assignment';
      subjectId: string;
      customerId: string;
      customerName: string;
      currentCmName: string | null;
      nextCmName: string | null;
      effectiveDate: string;
      cmName?: string;
    }
  | {
      kind: 'pause_resume_due_today';
      id: string;
      subjectType: 'subscription_pause_resume';
      subjectId: string;
      customerId: string;
      customerName: string;
      resumeDate: string;
      cmName?: string;
    }
  | {
      kind: 'cm_low_activity';
      id: string;
      subjectType: 'cm_activity';
      subjectId: string;
      customerId: null;
      cmName: string;
      interactionCount7d: number;
      expectedConcepts7d: number;
      lastInteractionDays: number;
    }
  | {
      kind: 'credit_note_failed';
      id: string;
      subjectType: 'credit_note_operation';
      subjectId: string;
      customerId: string;
      customerName: string;
      operationType: string;
      amount_ore: number;
      createdAt: string;
      errorMessage: string | null;
      attentionReason: string | null;
      cmName?: string;
    };

export type DerivedAttention = {
  open: AttentionItem[];
  snoozed: AttentionItem[];
};

const ONBOARDING_STUCK_DAYS = 5;
const CM_LOW_ACTIVITY_MIN_RATIO = 0.5;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.floor((+a - +b) / 86_400_000));
}

type SnoozeRow = {
  subject_type: string;
  subject_id: string;
  snoozed_until: string | null;
  released_at: string | null;
};

function buildSnoozeKey(subjectType: string, subjectId: string): string {
  return `${subjectType}::${subjectId}`;
}

export async function deriveAttention(
  supabase: SupabaseClient = createSupabaseAdmin(),
  now: Date = new Date(),
): Promise<DerivedAttention> {
  const today = isoDay(now);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const open: AttentionItem[] = [];

  // Active CM assignments → cm name per customer
  const cmNamesById = new Map<string, string>();
  const cmNameByCustomer = new Map<string, string>();
  let activeAssignments: Array<{
    customer_id: string;
    cm_id: string | null;
    scheduled_change: any;
    id: string;
  }> = [];

  try {
    const [{ data: members }, { data: assignments }] = await Promise.all([
      (supabase as any)
        .from('team_members')
        .select('id, name, role, is_active')
        .eq('is_active', true),
      (supabase as any)
        .from('cm_assignments')
        .select('id, customer_id, cm_id, scheduled_change, valid_to')
        .is('valid_to', null),
    ]);

    for (const m of (members ?? []) as Array<{ id: string; name: string }>) {
      cmNamesById.set(m.id, m.name ?? '');
    }

    activeAssignments = (assignments ?? []) as typeof activeAssignments;
    for (const a of activeAssignments) {
      if (a.cm_id) {
        const name = cmNamesById.get(a.cm_id);
        if (name) cmNameByCustomer.set(a.customer_id, name);
      }
    }
  } catch (err) {
    logger.warn({ err }, 'attention derive: cm assignments lookup failed');
  }

  // ---- 1. invoice_unpaid ----
  try {
    const { data: invoices } = await (supabase as any)
      .from('invoices')
      .select('id, customer_profile_id, invoice_number, amount_due, due_date, status, hosted_invoice_url')
      .eq('status', 'open')
      .lt('due_date', today)
      .order('due_date', { ascending: true })
      .limit(500);

    const invList = (invoices ?? []) as Array<any>;
    const customerIds = Array.from(
      new Set(invList.map((i) => i.customer_profile_id).filter(Boolean)),
    );
    const nameById = new Map<string, string>();
    if (customerIds.length > 0) {
      const { data: cps } = await (supabase as any)
        .from('customer_profiles')
        .select('id, business_name')
        .in('id', customerIds);
      for (const c of (cps ?? []) as Array<{ id: string; business_name: string | null }>) {
        nameById.set(c.id, c.business_name ?? '');
      }
    }

    for (const inv of invList) {
      if (!inv.customer_profile_id) continue;
      const due = inv.due_date ? new Date(inv.due_date) : null;
      const days = due ? daysBetween(now, due) : 0;
      open.push({
        kind: 'invoice_unpaid',
        id: String(inv.id),
        subjectType: 'invoice',
        subjectId: String(inv.id),
        customerId: String(inv.customer_profile_id),
        customerName: nameById.get(inv.customer_profile_id) ?? '',
        invoiceNumber: inv.invoice_number ?? null,
        daysPastDue: days,
        amount_ore: Number(inv.amount_due ?? 0),
        hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
        cmName: cmNameByCustomer.get(inv.customer_profile_id),
      });
    }
  } catch (err) {
    logger.warn({ err }, 'attention derive: invoices failed');
  }

  // ---- customer_profiles for onboarding/blocked/pause-resume ----
  try {
    const { data: customers } = await (supabase as any)
      .from('customer_profiles')
      .select(
        'id, business_name, status, paused_until, onboarding_state, agreed_at, created_at, updated_at',
      );

    for (const c of (customers ?? []) as Array<any>) {
      const cid = String(c.id);
      const name = (c.business_name as string | null) ?? '';

      // onboarding_stuck: invited or cm_ready and no movement
      const onboardingState = (c.onboarding_state as string | null) ?? null;
      const status = (c.status as string | null) ?? null;
      if (
        status === 'invited' ||
        onboardingState === 'invited' ||
        onboardingState === 'cm_ready'
      ) {
        const ref = c.updated_at ?? c.agreed_at ?? c.created_at;
        const refDate = ref ? new Date(ref) : null;
        const daysSince = refDate ? daysBetween(now, refDate) : 0;
        if (daysSince >= ONBOARDING_STUCK_DAYS) {
          open.push({
            kind: 'onboarding_stuck',
            id: cid,
            subjectType: 'onboarding',
            subjectId: cid,
            customerId: cid,
            customerName: name,
            daysSinceCmReady: daysSince,
            cmName: cmNameByCustomer.get(cid),
          });
        }
      }

      // customer_blocked: explicit blocked status (paused without resume date or status indicates blocked)
      if (status === 'blocked' || status === 'paused' && !c.paused_until) {
        const ref = c.updated_at ?? c.created_at;
        const refDate = ref ? new Date(ref) : null;
        const days = refDate ? daysBetween(now, refDate) : 0;
        open.push({
          kind: 'customer_blocked',
          id: cid,
          subjectType: 'customer_blocking',
          subjectId: cid,
          customerId: cid,
          customerName: name,
          daysBlocked: days,
          cmName: cmNameByCustomer.get(cid),
        });
      }

      // pause_resume_due_today: paused_until is today
      if (c.paused_until) {
        const resumeDay = String(c.paused_until).slice(0, 10);
        if (resumeDay === today) {
          open.push({
            kind: 'pause_resume_due_today',
            id: cid,
            subjectType: 'subscription_pause_resume',
            subjectId: cid,
            customerId: cid,
            customerName: name,
            resumeDate: c.paused_until,
            cmName: cmNameByCustomer.get(cid),
          });
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, 'attention derive: customer_profiles failed');
  }

  // ---- cm_change_due_today: scheduled_change.effective_date == today ----
  try {
    const customerIds = activeAssignments
      .filter((a) => {
        const sc = a.scheduled_change as { effective_date?: string } | null;
        return sc && sc.effective_date && String(sc.effective_date).slice(0, 10) === today;
      })
      .map((a) => a.customer_id);

    const nameById = new Map<string, string>();
    if (customerIds.length > 0) {
      const { data: cps } = await (supabase as any)
        .from('customer_profiles')
        .select('id, business_name')
        .in('id', customerIds);
      for (const c of (cps ?? []) as Array<{ id: string; business_name: string | null }>) {
        nameById.set(c.id, c.business_name ?? '');
      }
    }

    for (const a of activeAssignments) {
      const sc = a.scheduled_change as
        | { effective_date?: string; next_cm_id?: string | null; next_cm_name?: string | null }
        | null;
      if (!sc?.effective_date) continue;
      if (String(sc.effective_date).slice(0, 10) !== today) continue;
      const cid = String(a.customer_id);
      const currentCmName = a.cm_id ? cmNamesById.get(a.cm_id) ?? null : null;
      const nextCmName =
        sc.next_cm_name ??
        (sc.next_cm_id ? cmNamesById.get(sc.next_cm_id) ?? null : null);
      open.push({
        kind: 'cm_change_due_today',
        id: String(a.id),
        subjectType: 'cm_assignment',
        subjectId: String(a.id),
        customerId: cid,
        customerName: nameById.get(cid) ?? '',
        currentCmName,
        nextCmName,
        effectiveDate: sc.effective_date,
        cmName: cmNameByCustomer.get(cid),
      });
    }
  } catch (err) {
    logger.warn({ err }, 'attention derive: cm_change failed');
  }

  // ---- credit_note_failed ----
  try {
    const { data: cnos } = await (supabase as any)
      .from('credit_note_operations')
      .select(
        'id, operation_type, customer_profile_id, amount_ore, created_at, error_message, attention_reason, requires_attention',
      )
      .eq('requires_attention', true)
      .order('created_at', { ascending: false })
      .limit(200);

    const list = (cnos ?? []) as Array<any>;
    const customerIds = Array.from(
      new Set(list.map((r) => r.customer_profile_id).filter(Boolean)),
    );
    const nameById = new Map<string, string>();
    if (customerIds.length > 0) {
      const { data: cps } = await (supabase as any)
        .from('customer_profiles')
        .select('id, business_name')
        .in('id', customerIds);
      for (const c of (cps ?? []) as Array<{ id: string; business_name: string | null }>) {
        nameById.set(c.id, c.business_name ?? '');
      }
    }

    for (const r of list) {
      const cid = String(r.customer_profile_id ?? '');
      if (!cid) continue;
      open.push({
        kind: 'credit_note_failed',
        id: String(r.id),
        subjectType: 'credit_note_operation',
        subjectId: String(r.id),
        customerId: cid,
        customerName: nameById.get(cid) ?? '',
        operationType: String(r.operation_type ?? ''),
        amount_ore: Number(r.amount_ore ?? 0),
        createdAt: r.created_at ?? new Date(0).toISOString(),
        errorMessage: r.error_message ?? null,
        attentionReason: r.attention_reason ?? null,
        cmName: cmNameByCustomer.get(cid),
      });
    }
  } catch (err) {
    logger.warn({ err }, 'attention derive: credit_note_operations failed');
  }

  // ---- cm_notification ----
  try {
    const { data: rows } = await (supabase as any)
      .from('cm_notifications')
      .select('id, from_cm_id, customer_id, message, priority, created_at, resolved_at')
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .limit(200);

    for (const r of (rows ?? []) as Array<any>) {
      const fromName = r.from_cm_id ? cmNamesById.get(r.from_cm_id) ?? 'Okänd' : 'Okänd';
      open.push({
        kind: 'cm_notification',
        id: String(r.id),
        subjectType: 'cm_notification',
        subjectId: String(r.id),
        priority: r.priority === 'urgent' ? 'urgent' : 'normal',
        createdAt: r.created_at ?? new Date(0).toISOString(),
        from: fromName,
        message: r.message ?? '',
        customerId: r.customer_id ?? null,
        cmName: fromName,
      });
    }
  } catch (err) {
    logger.warn({ err }, 'attention derive: cm_notifications failed');
  }

  // ---- demo_responded ----
  try {
    const { data: demos } = await (supabase as any)
      .from('demos')
      .select('id, company_name, status, responded_at, resolved_at')
      .eq('status', 'responded')
      .is('resolved_at', null)
      .order('responded_at', { ascending: false })
      .limit(200);

    for (const r of (demos ?? []) as Array<any>) {
      open.push({
        kind: 'demo_responded',
        id: String(r.id),
        subjectType: 'demo_response',
        subjectId: String(r.id),
        respondedAt: r.responded_at ?? r.created_at ?? new Date(0).toISOString(),
        companyName: r.company_name ?? '',
      });
    }
  } catch (err) {
    logger.warn({ err }, 'attention derive: demos failed');
  }

  // ---- cm_low_activity ----
  try {
    const [{ data: customers }, { data: interactions }] = await Promise.all([
      (supabase as any)
        .from('customer_profiles')
        .select('id, status, paused_until, concepts_per_week, expected_concepts_per_week')
        .in('status', ['active']),
      (supabase as any)
        .from('cm_interactions')
        .select('cm_id, customer_id, created_at')
        .gte('created_at', sevenDaysAgo.toISOString()),
    ]);

    // expected concepts per cm (from active assignments)
    const expectedByCm = new Map<string, number>();
    for (const a of activeAssignments) {
      if (!a.cm_id) continue;
      const c = ((customers ?? []) as Array<any>).find((x) => x.id === a.customer_id);
      if (!c) continue;
      const pace =
        Number(c.concepts_per_week ?? c.expected_concepts_per_week ?? 1) || 1;
      expectedByCm.set(a.cm_id, (expectedByCm.get(a.cm_id) ?? 0) + pace);
    }

    type IStats = { count: number; lastAt: Date | null };
    const stats = new Map<string, IStats>();
    for (const it of (interactions ?? []) as Array<{ cm_id: string; created_at: string }>) {
      let s = stats.get(it.cm_id);
      if (!s) {
        s = { count: 0, lastAt: null };
        stats.set(it.cm_id, s);
      }
      s.count += 1;
      const at = new Date(it.created_at);
      if (!s.lastAt || at > s.lastAt) s.lastAt = at;
    }

    for (const [cmId, expected] of expectedByCm.entries()) {
      const s = stats.get(cmId) ?? { count: 0, lastAt: null };
      const ratio = expected > 0 ? s.count / expected : 1;
      if (expected === 0) continue;
      if (ratio >= CM_LOW_ACTIVITY_MIN_RATIO && s.count > 0) continue;
      const lastDays = s.lastAt ? daysBetween(now, s.lastAt) : 999;
      open.push({
        kind: 'cm_low_activity',
        id: cmId,
        subjectType: 'cm_activity',
        subjectId: cmId,
        customerId: null,
        cmName: cmNamesById.get(cmId) ?? 'Okänd',
        interactionCount7d: s.count,
        expectedConcepts7d: expected,
        lastInteractionDays: lastDays,
      });
    }
  } catch (err) {
    logger.warn({ err }, 'attention derive: cm_low_activity failed');
  }

  // ---- snoozes ----
  let snoozeKeys = new Set<string>();
  try {
    const { data: snoozes } = await (supabase as any)
      .from('attention_snoozes')
      .select('subject_type, subject_id, snoozed_until, released_at');

    const nowIso = now.toISOString();
    for (const s of (snoozes ?? []) as SnoozeRow[]) {
      if (s.released_at) continue;
      if (s.snoozed_until && s.snoozed_until <= nowIso) continue;
      snoozeKeys.add(buildSnoozeKey(s.subject_type, s.subject_id));
    }
  } catch (err) {
    logger.warn({ err }, 'attention derive: snoozes failed');
  }

  const opened: AttentionItem[] = [];
  const snoozed: AttentionItem[] = [];
  for (const item of open) {
    if (snoozeKeys.has(buildSnoozeKey(item.subjectType, item.subjectId))) {
      snoozed.push(item);
    } else {
      opened.push(item);
    }
  }

  return { open: sortAttention(opened), snoozed: sortAttention(snoozed) };
}

const KIND_RANK: Record<AttentionItem['kind'], number> = {
  cm_notification: 0,
  credit_note_failed: 1,
  cm_change_due_today: 2,
  pause_resume_due_today: 3,
  cm_low_activity: 4,
  invoice_unpaid: 5,
  onboarding_stuck: 6,
  demo_responded: 7,
  customer_blocked: 8,
};

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  info: 3,
};

function severity(item: AttentionItem): 'critical' | 'high' | 'medium' | 'info' {
  switch (item.kind) {
    case 'customer_blocked':
    case 'credit_note_failed':
      return 'critical';
    case 'invoice_unpaid':
      return item.daysPastDue >= 14 ? 'critical' : 'high';
    case 'cm_notification':
      return item.priority === 'urgent' ? 'critical' : 'high';
    case 'cm_low_activity':
      return item.interactionCount7d === 0 ? 'high' : 'medium';
    case 'cm_change_due_today':
      return 'high';
    case 'onboarding_stuck':
      return item.daysSinceCmReady >= 14 ? 'high' : 'medium';
    case 'pause_resume_due_today':
      return 'medium';
    case 'demo_responded':
      return 'info';
  }
}

function attentionTimestamp(item: AttentionItem, now: Date): Date | null {
  switch (item.kind) {
    case 'cm_notification':
    case 'credit_note_failed':
      return item.createdAt ? new Date(item.createdAt) : null;
    case 'invoice_unpaid':
      return new Date(now.getTime() - item.daysPastDue * 86_400_000);
    case 'onboarding_stuck':
      return new Date(now.getTime() - item.daysSinceCmReady * 86_400_000);
    case 'demo_responded':
      return item.respondedAt ? new Date(item.respondedAt) : null;
    case 'customer_blocked':
      return new Date(now.getTime() - item.daysBlocked * 86_400_000);
    case 'cm_change_due_today':
      return new Date(item.effectiveDate);
    case 'pause_resume_due_today':
      return new Date(item.resumeDate);
    case 'cm_low_activity':
      return new Date(now.getTime() - 7 * 86_400_000);
  }
}

export function sortAttention(items: AttentionItem[], now: Date = new Date()) {
  return [...items].sort((a, b) => {
    const sevDiff = SEVERITY_RANK[severity(a)]! - SEVERITY_RANK[severity(b)]!;
    if (sevDiff !== 0) return sevDiff;
    const kindDiff = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (kindDiff !== 0) return kindDiff;
    const at = attentionTimestamp(a, now);
    const bt = attentionTimestamp(b, now);
    return +(bt ?? new Date(0)) - +(at ?? new Date(0));
  });
}

export { attentionTimestamp };
