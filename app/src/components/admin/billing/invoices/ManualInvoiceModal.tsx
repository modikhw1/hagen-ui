'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/admin/api-client';
import { AdminFormDialog } from '@/components/admin/ui/feedback/AdminFormDialog';
import { LineItemEditor, type LineItem } from '@/components/admin/ui/form/LineItemEditor';
import { AdminField } from '@/components/admin/ui/form/AdminField';
import { MANUAL_INVOICE_TEMPLATES } from '@/lib/admin/billing/line-item-templates';
import { sekToOre } from '@/lib/admin/money';
import ConfirmActionDialog from '@/components/admin/ConfirmActionDialog';
import { toast } from 'sonner';

type CreateInvoiceResponse = {
  invoice: {
    id: string;
  };
};

export default function ManualInvoiceModal({
  open,
  customerId,
  customerName,
  onClose,
  onCreated,
}: {
  open: boolean;
  customerId: string;
  customerName: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [items, setItems] = useState<LineItem[]>([]);
  const [daysUntilDue, setDaysUntilDue] = useState(14);
  const [autoFinalize, setAutoFinalize] = useState(true);
  const [memo, setMemo] = useState('');
  const [memoVisibleToCustomer, setMemoVisibleToCustomer] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const totalOre = items.reduce((s, it) => s + it.amount * it.quantity, 0);

  const createMutation = useMutation({
    mutationKey: ['admin', 'manual-invoice-create', customerId],
    mutationFn: async () =>
      apiClient.post<CreateInvoiceResponse>('/api/admin/invoices/create', {
        customer_profile_id: customerId,
        items: items.map(it => ({ 
          description: it.description, 
          amount: it.amount / 100 // API expects SEK according to current schema
        })),
        days_until_due: daysUntilDue,
        auto_finalize: autoFinalize,
        memo: memo || null,
        memo_visible_to_customer: memoVisibleToCustomer,
      }),
    onSuccess: () => {
      toast.success('Fakturan har skapats');
      onCreated();
      onClose();
    },
  });

  const handleSubmit = () => {
    if (items.length === 0 || totalOre <= 0) return;
    
    if (autoFinalize && totalOre >= 500000) { // 5000 kr
      setConfirmOpen(true);
      return;
    }

    void createMutation.mutateAsync();
  };

  return (
    <>
      <AdminFormDialog
        open={open}
        onClose={onClose}
        title="Skapa manuell faktura"
        description={customerName}
        size="lg"
        footer={
          <>
            <button
              onClick={onClose}
              disabled={createMutation.isPending}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Avbryt
            </button>
            <button
              onClick={handleSubmit}
              disabled={createMutation.isPending || items.length === 0 || totalOre <= 0}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {createMutation.isPending ? 'Skapar...' : 'Skapa faktura'}
            </button>
          </>
        }
      >
        <div className="space-y-6">
          <LineItemEditor
            items={items}
            onChange={setItems}
            templates={MANUAL_INVOICE_TEMPLATES}
          />

          <div className="grid gap-6 sm:grid-cols-2">
            <AdminField label="Förfaller om (dagar)" htmlFor="days_until_due">
              <input
                id="days_until_due"
                type="number"
                min={1}
                max={120}
                value={daysUntilDue}
                onChange={(e) => setDaysUntilDue(Number(e.target.value))}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </AdminField>

            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={autoFinalize}
                  onChange={(e) => setAutoFinalize(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary"
                />
                Finalisera och skicka direkt
              </label>
            </div>
          </div>

          <AdminField 
            label="Memo (intern eller kund)" 
            htmlFor="memo" 
            hint="Visas på fakturan om rutan nedan kryssas i."
          >
            <textarea
              id="memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            />
          </AdminField>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={memoVisibleToCustomer}
              onChange={(e) => setMemoVisibleToCustomer(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
            Visa memo på kundens fakturakopia
          </label>
        </div>
      </AdminFormDialog>

      <ConfirmActionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Skicka stor faktura direkt?"
        description={`Fakturan på ${(totalOre / 100).toLocaleString('sv-SE')} kr kommer att finaliseras och skickas till kund omedelbart.`}
        confirmLabel="Ja, skapa och skicka"
        onConfirm={() => void createMutation.mutateAsync()}
        pending={createMutation.isPending}
      />
    </>
  );
}
