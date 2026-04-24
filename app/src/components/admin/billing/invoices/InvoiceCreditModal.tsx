'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AdminFormDialog } from '@/components/admin/ui/feedback/AdminFormDialog';
import { LineItemEditor, type LineItem } from '@/components/admin/ui/form/LineItemEditor';
import { AdminField } from '@/components/admin/ui/form/AdminField';
import { PriceInput } from '@/components/admin/ui/form/PriceInput';
import { CREDIT_NOTE_TEMPLATES } from '@/lib/admin/billing/line-item-templates';
import { OPERATOR_COPY } from '@/lib/admin/copy/operator-glossary';
import { oreToSek, formatSek } from '@/lib/admin/money';
import { apiClient } from '@/lib/admin/api-client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';

export function InvoiceCreditModal({
  open,
  onClose,
  invoice,
  lineItems,
  onUpdated,
}: {
  open: boolean;
  onClose: () => void;
  invoice: any;
  lineItems: any[];
  onUpdated: () => void;
}) {
  const [isAdvanced, setIsAdvanced] = useState(false);
  const [selectedLines, setSelectedLines] = useState<string[]>([]);
  const [creditAmountOre, setCreditAmountOre] = useState<number>(invoice.amount_due);
  const [refundAmountOre, setRefundAmountOre] = useState<number>(invoice.status === 'paid' ? invoice.amount_due : 0);
  const [memo, setMemo] = useState('');
  const [reissue, setReissue] = useState(false);
  const [reissueItems, setReissueItems] = useState<LineItem[]>([]);

  const copy = OPERATOR_COPY.credit;

  const actionMutation = useMutation({
    mutationFn: async (payload: any) => apiClient.patch(`/api/admin/invoices/${invoice.id}`, payload),
    onSuccess: () => {
      toast.success('Justeringen har genomförts');
      onUpdated();
      onClose();
    },
  });

  const handleSelectLine = (lineId: string, amount: number) => {
    setSelectedLines(prev => {
      const next = prev.includes(lineId) ? prev.filter(id => id !== lineId) : [...prev, lineId];
      const totalSelected = lineItems
        .filter(l => next.includes(l.stripe_line_item_id))
        .reduce((s, l) => s + l.amount, 0);
      setCreditAmountOre(totalSelected);
      if (invoice.status === 'paid') setRefundAmountOre(totalSelected);
      return next;
    });
  };

  const handleSubmit = () => {
    const payload: any = {
      action: reissue ? 'credit_note_and_reissue' : 'credit_note',
      amount_ore: creditAmountOre,
      refund_amount_ore: refundAmountOre,
      memo: memo || null,
    };

    if (isAdvanced && selectedLines.length > 0) {
      payload.stripe_line_item_id = selectedLines[0]; // API current limitation
    }

    if (reissue) {
      payload.reissue_items = reissueItems.map(it => ({
        description: it.description,
        amount: oreToSek(it.amount),
      }));
      payload.days_until_due = 14;
    }

    actionMutation.mutate(payload);
  };

  return (
    <AdminFormDialog
      open={open}
      onClose={onClose}
      title="Kreditera faktura"
      description={invoice.business_name}
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent">
            Avbryt
          </button>
          <button
            onClick={handleSubmit}
            disabled={actionMutation.isPending || creditAmountOre <= 0}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {actionMutation.isPending ? 'Sparar...' : reissue ? 'Kreditera och skapa ersättning' : `Kreditera ${formatSek(creditAmountOre)}`}
          </button>
        </>
      }
    >
      <div className="space-y-6">
        {/* Primär väg: Hela fakturan */}
        {!isAdvanced && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <h3 className="text-sm font-semibold text-foreground">{copy.primaryCta}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{copy.primarySubtitle}</p>
            <div className="mt-4 text-xl font-bold">{formatSek(invoice.amount_due)}</div>
          </div>
        )}

        {/* Avancerad väg: Rader */}
        <div className="space-y-3">
          <button
            onClick={() => {
              const next = !isAdvanced;
              setIsAdvanced(next);
              if (!next) {
                setCreditAmountOre(invoice.amount_due);
                if (invoice.status === 'paid') setRefundAmountOre(invoice.amount_due);
                setSelectedLines([]);
              } else {
                setCreditAmountOre(0);
                setRefundAmountOre(0);
              }
            }}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {isAdvanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {copy.advancedToggle}
          </button>

          {isAdvanced && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
              <div className="divide-y divide-border rounded-lg border border-border bg-card">
                {lineItems.map((line) => (
                  <label key={line.stripe_line_item_id} className="flex items-center justify-between p-3 cursor-pointer hover:bg-secondary/10">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedLines.includes(line.stripe_line_item_id)}
                        onChange={() => handleSelectLine(line.stripe_line_item_id, line.amount)}
                        className="h-4 w-4 rounded border-gray-300 text-primary"
                      />
                      <span className="text-sm font-medium">{line.description}</span>
                    </div>
                    <span className="text-sm font-semibold">{formatSek(line.amount)}</span>
                  </label>
                ))}
              </div>
              
              <AdminField label="Kreditbelopp">
                <PriceInput
                  valueOre={creditAmountOre}
                  onChangeOre={setCreditAmountOre}
                />
              </AdminField>
            </div>
          )}
        </div>

        {/* Gemensamma val */}
        <div className="space-y-6 pt-2">
          {invoice.status === 'paid' && (
            <div className="flex items-center gap-3 rounded-lg border border-status-warning-fg/20 bg-status-warning-bg/10 p-3">
              <AlertCircle className="h-4 w-4 text-status-warning-fg" />
              <div className="flex-1 text-xs">
                <div className="font-semibold text-status-warning-fg">Fakturan är betald</div>
                <div className="mt-0.5 text-muted-foreground">Välj hur mycket som ska återbetalas via Stripe.</div>
              </div>
              <div className="w-32">
                <PriceInput
                  valueOre={refundAmountOre}
                  onChangeOre={setRefundAmountOre}
                />
              </div>
            </div>
          )}

          <AdminField label={copy.memoLabel}>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              placeholder="Varför krediteras fakturan?"
            />
          </AdminField>

          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={reissue}
                onChange={(e) => setReissue(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary"
              />
              {copy.issueReplacement}
            </label>

            {reissue && (
              <div className="space-y-3 animate-in fade-in zoom-in-95">
                <LineItemEditor 
                  items={reissueItems}
                  onChange={setReissueItems}
                  templates={CREDIT_NOTE_TEMPLATES}
                  emptyHint="Lägg till de rader som ersättningsfakturan ska innehålla."
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminFormDialog>
  );
}
