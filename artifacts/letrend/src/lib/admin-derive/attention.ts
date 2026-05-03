export type AttentionItem =
  | { kind: 'cm_notification'; id: string; subjectType: 'cm_notification'; subjectId: string; priority: 'normal' | 'urgent'; createdAt: Date; from: string; message: string; customerId: string | null; cmName?: string }
  | { kind: 'invoice_unpaid'; id: string; subjectType: 'invoice'; subjectId: string; customerId: string; customerName: string; invoiceNumber: string | null; daysPastDue: number; amount_ore: number; hostedInvoiceUrl: string | null; cmName?: string }
  | { kind: 'onboarding_stuck'; id: string; subjectType: 'onboarding'; subjectId: string; customerId: string; customerName: string; daysSinceCmReady: number; cmName?: string }
  | { kind: 'demo_responded'; id: string; subjectType: 'demo_response'; subjectId: string; respondedAt: Date; companyName: string; cmName?: string }
  | { kind: 'customer_blocked'; id: string; subjectType: 'customer_blocking'; subjectId: string; customerId: string; customerName: string; daysBlocked: number; cmName?: string }
  | { kind: 'cm_change_due_today'; id: string; subjectType: 'cm_assignment'; subjectId: string; customerId: string; customerName: string; currentCmName: string | null; nextCmName: string | null; effectiveDate: Date; cmName?: string }
  | { kind: 'pause_resume_due_today'; id: string; subjectType: 'subscription_pause_resume'; subjectId: string; customerId: string; customerName: string; resumeDate: Date; cmName?: string }
  | { kind: 'cm_low_activity'; id: string; subjectType: 'cm_activity'; subjectId: string; customerId: null; cmName: string; interactionCount7d: number; expectedConcepts7d: number; lastInteractionDays: number }
  | { kind: 'credit_note_failed'; id: string; subjectType: 'credit_note_operation'; subjectId: string; customerId: string; customerName: string; operationType: string; amount_ore: number; createdAt: Date; errorMessage: string | null; attentionReason: string | null; cmName?: string };

export type AttentionSeverity = 'critical' | 'high' | 'medium' | 'info';

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

const SEVERITY_RANK: Record<AttentionSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  info: 3,
};

export function attentionSeverity(item: AttentionItem): AttentionSeverity {
  switch (item.kind) {
    case 'customer_blocked':
      return 'critical';
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

export function attentionTimestamp(
  item: AttentionItem,
  now: Date = new Date(),
): Date | null {
  switch (item.kind) {
    case 'cm_notification':
      return item.createdAt;
    case 'credit_note_failed':
      return item.createdAt;
    case 'invoice_unpaid':
      return new Date(now.getTime() - item.daysPastDue * 86_400_000);
    case 'onboarding_stuck':
      return new Date(
        now.getTime() - Math.max(0, item.daysSinceCmReady - 7) * 86_400_000,
      );
    case 'demo_responded':
      return item.respondedAt;
    case 'customer_blocked':
      return new Date(
        now.getTime() - Math.max(0, item.daysBlocked - 10) * 86_400_000,
      );
    case 'cm_change_due_today':
      return item.effectiveDate;
    case 'pause_resume_due_today':
      return item.resumeDate;
    case 'cm_low_activity':
      return new Date(
        now.getTime() -
          (item.interactionCount7d === 0
            ? 7
            : Math.max(0, item.lastInteractionDays - 5)) *
            86_400_000,
      );
  }
}

export function sortAttention(items: AttentionItem[], now: Date = new Date()) {
  return [...items].sort((a, b) => {
    const severityDiff =
      SEVERITY_RANK[attentionSeverity(a)] - SEVERITY_RANK[attentionSeverity(b)];
    if (severityDiff !== 0) {
      return severityDiff;
    }

    if (a.kind === 'invoice_unpaid' && b.kind === 'invoice_unpaid') {
      return b.daysPastDue - a.daysPastDue;
    }

    if (a.kind === 'cm_low_activity' && b.kind === 'cm_low_activity') {
      if (a.interactionCount7d !== b.interactionCount7d) {
        return a.interactionCount7d - b.interactionCount7d;
      }

      return b.lastInteractionDays - a.lastInteractionDays;
    }

    const kindDiff = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (kindDiff !== 0) {
      return kindDiff;
    }

    const aTime = attentionTimestamp(a, now);
    const bTime = attentionTimestamp(b, now);
    const timeDiff = +(bTime ?? new Date(0)) - +(aTime ?? new Date(0));
    if (timeDiff !== 0) {
      return timeDiff;
    }

    return a.id.localeCompare(b.id);
  });
}
