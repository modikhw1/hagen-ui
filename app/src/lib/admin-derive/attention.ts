export type AttentionItem =
  | { kind: 'cm_notification'; id: string; subjectType: 'cm_notification'; subjectId: string; priority: 'normal' | 'urgent'; createdAt: Date; from: string; message: string; customerId: string | null }
  | { kind: 'invoice_unpaid'; id: string; subjectType: 'invoice'; subjectId: string; customerId: string; daysPastDue: number; amount_ore: number }
  | { kind: 'onboarding_stuck'; id: string; subjectType: 'onboarding'; subjectId: string; customerId: string; daysSinceCmReady: number }
  | { kind: 'demo_responded'; id: string; subjectType: 'demo_response'; subjectId: string; respondedAt: Date; companyName: string }
  | { kind: 'customer_blocked'; id: string; subjectType: 'customer_blocking'; subjectId: string; customerId: string; daysBlocked: number };

const RANK: Record<AttentionItem['kind'], number> = {
  cm_notification: 0,
  invoice_unpaid: 1,
  onboarding_stuck: 2,
  demo_responded: 3,
  customer_blocked: 4,
};

export function sortAttention(items: AttentionItem[]) {
  return [...items].sort((a, b) => {
    const aUrgent = a.kind === 'cm_notification' && a.priority === 'urgent' ? 0 : 1;
    const bUrgent = b.kind === 'cm_notification' && b.priority === 'urgent' ? 0 : 1;
    if (aUrgent !== bUrgent) return aUrgent - bUrgent;

    const aOld = a.kind === 'invoice_unpaid' && a.daysPastDue > 14 ? 0 : 1;
    const bOld = b.kind === 'invoice_unpaid' && b.daysPastDue > 14 ? 0 : 1;
    if (aOld !== bOld) return aOld - bOld;

    return RANK[a.kind] - RANK[b.kind];
  });
}
