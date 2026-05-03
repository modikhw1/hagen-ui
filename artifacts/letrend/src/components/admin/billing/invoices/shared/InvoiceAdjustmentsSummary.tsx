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
  operations?: Array<{
    id: string;
    operation_type: string;
    status: string;
    requires_attention: boolean;
    attention_reason: string | null;
    error_message: string | null;
    amount_ore: number;
    created_at: string;
  }>;
};

export function InvoiceAdjustmentsSummary({ adjustments }: { adjustments: AdjustmentPayload }) {
  if (adjustments.creditNotes.length === 0 && adjustments.refunds.length === 0 && (!adjustments.operations || adjustments.operations.length === 0)) {
    return (
      <div className="rounded-md border border-border bg-secondary/10 px-3 py-3 text-xs text-muted-foreground">
        Inga kreditnotor, återbetalningar eller pågående operationer finns registrerade på den här fakturan.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {adjustments.operations?.map((op) => (
        <div key={op.id} className={`rounded-md border ${op.requires_attention || op.status === 'failed' ? 'border-status-danger-border bg-status-danger-bg' : 'border-status-warning-border bg-status-warning-bg'} px-3 py-2 text-xs`}>
          <div className={`font-medium ${op.requires_attention || op.status === 'failed' ? 'text-status-danger-fg' : 'text-status-warning-fg'} flex items-center justify-between`}>
            <span>
              {op.operation_type === 'credit_note_and_reissue' ? 'Kreditera och fakturera om' : op.operation_type === 'credit_note_only' ? 'Kreditering' : op.operation_type} {formatSek(op.amount_ore)}
            </span>
            <span className="uppercase tracking-wider text-[10px] bg-background/50 px-1.5 py-0.5 rounded">
              {op.status.replace(/_/g, ' ')}
            </span>
          </div>
          <div className={op.requires_attention || op.status === 'failed' ? 'text-status-danger-fg/80' : 'text-status-warning-fg/80'}>
            {shortDateSv(op.created_at)}
            {(op.error_message || op.attention_reason) && (
              <div className="mt-1 font-semibold">
                {op.attention_reason ? `Systemnotis: ${op.attention_reason}` : ''}
                {op.error_message ? ` Fel: ${op.error_message}` : ''}
              </div>
            )}
          </div>
        </div>
      ))}
      {adjustments.creditNotes.map((cn) => (        <div key={cn.stripe_credit_note_id} className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs">
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
