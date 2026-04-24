'use client';

import { formatSek } from '@/lib/admin/money';
import { shortDateSv } from '@/lib/admin/time';

type AdjustmentPayload = {
  creditNotes: Array<{
    stripe_credit_note_id: string;
    total: number;
    refund_amount: number;
    memo: string | null;
    created_at: string;
  }>;
  refunds: Array<{
    stripe_refund_id: string;
    amount: number;
    reason: string | null;
    created_at: string;
  }>;
};

export function InvoiceAdjustmentsSummary({ adjustments }: { adjustments: AdjustmentPayload }) {
  if (adjustments.creditNotes.length === 0 && adjustments.refunds.length === 0) {
    return (
      <div className="rounded-md border border-border bg-secondary/10 px-3 py-3 text-xs text-muted-foreground">
        Inga kreditnotor eller återbetalningar finns registrerade på den här fakturan.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {adjustments.creditNotes.map((cn) => (
        <div key={cn.stripe_credit_note_id} className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs">
          <div className="font-medium text-foreground">
            Kreditnota {formatSek(cn.total)}
          </div>
          <div className="text-muted-foreground">
            {shortDateSv(cn.created_at)}
            {cn.refund_amount > 0 && ` · återbetalning ${formatSek(cn.refund_amount)}`}
            {cn.memo && ` · ${cn.memo}`}
          </div>
        </div>
      ))}
      {adjustments.refunds.map((re) => (
        <div key={re.stripe_refund_id} className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs">
          <div className="font-medium text-foreground">
            Återbetalning {formatSek(re.amount)}
          </div>
          <div className="text-muted-foreground">
            {shortDateSv(re.created_at)}
            {re.reason && ` · ${re.reason}`}
          </div>
        </div>
      ))}
    </div>
  );
}
