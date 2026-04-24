'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import ConfirmActionDialog from '@/components/admin/ConfirmActionDialog';
import { AdminFormDialog } from '@/components/admin/ui/feedback/AdminFormDialog';
import { apiClient } from '@/lib/admin/api-client';
import {
  createManualInvoiceSchema,
  type DraftInvoiceItem,
} from '@/lib/admin/schemas/invoice-create';

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
  const [items, setItems] = useState<DraftInvoiceItem[]>([{ description: '', amount: 0 }]);
  const [daysUntilDue, setDaysUntilDue] = useState(14);
  const [autoFinalize, setAutoFinalize] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  
  const filteredItems = items.filter((item) => item.description.trim() && item.amount > 0);
  const totalAmountSek = filteredItems.reduce((sum, item) => sum + item.amount, 0);
  
  const payload = {
    customer_profile_id: customerId,
    items: filteredItems,
    days_until_due: daysUntilDue,
    auto_finalize: autoFinalize,
  };
  
  const validation = createManualInvoiceSchema.safeParse(payload);
  const createMutation = useMutation({
    mutationKey: ['admin', 'manual-invoice-create', customerId],
    mutationFn: async () =>
      apiClient.post<CreateInvoiceResponse>('/api/admin/invoices/create', payload),
    onSuccess: () => {
      onCreated();
    },
  });

  const errorMessage =
    createMutation.error instanceof Error ? createMutation.error.message : null;
  const validationMessage = validation.success
    ? null
    : validation.error.issues[0]?.message || 'Fyll i minst en giltig rad.';

  const submit = () => {
    if (!validation.success) {
      return;
    }

    if (autoFinalize && totalAmountSek >= 5000) {
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
        description={`För ${customerName}`}
        size="lg"
        error={errorMessage}
        warning={validationMessage}
        footer={
          <>
            <button
              type="button"
              onClick={onClose}
              disabled={createMutation.isPending}
              className="rounded-md border border-border px-4 py-2 text-sm"
            >
              Avbryt
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={createMutation.isPending || !validation.success}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {createMutation.isPending ? 'Skapar...' : 'Skapa faktura'}
            </button>
          </>
        }
      >
        <div className="space-y-6">
          <div className="rounded-md bg-status-info-bg px-3 py-2 text-xs text-status-info-fg">
            Använd manuell faktura för engångsärenden som inte hör till abonnemanget.
            Behöver du lägga till en post som ska följa med nästa månadsfaktura, använd
            <strong> Väntande poster</strong> istället.
          </div>

          <div className="grid gap-4">
            {items.map((item, index) => (
              <div
                key={`${index}-${item.description}`}
                className="grid grid-cols-[1fr_160px_auto] gap-2"
              >
                <input
                  value={item.description}
                  onChange={(event) =>
                    setItems((current) =>
                      current.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, description: event.target.value } : row,
                      ),
                    )
                  }
                  placeholder="Beskrivning"
                  className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                />
                <input
                  type="number"
                  min={0}
                  value={item.amount}
                  onChange={(event) =>
                    setItems((current) =>
                      current.map((row, rowIndex) =>
                        rowIndex === index
                          ? { ...row, amount: Math.max(0, Number(event.target.value) || 0) }
                          : row,
                      ),
                    )
                  }
                  placeholder="Belopp (kr)"
                  className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() =>
                    setItems((current) =>
                      current.length === 1
                        ? current
                        : current.filter((_, rowIndex) => rowIndex !== index),
                    )
                  }
                  className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
                >
                  Ta bort
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setItems((current) => [...current, { description: '', amount: 0 }])}
              className="w-fit rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
            >
              Lägg till rad
            </button>

            <div className="grid grid-cols-2 gap-6 pt-4">
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Förfaller om (dagar)
                </label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={daysUntilDue}
                  onChange={(event) =>
                    setDaysUntilDue(Math.max(1, Math.min(90, Number(event.target.value) || 14)))
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>
              <label className="flex items-center gap-2 pt-6 text-sm text-foreground cursor-pointer group">
                <input
                  type="checkbox"
                  checked={autoFinalize}
                  onChange={(event) => setAutoFinalize(event.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                />
                <span className="group-hover:text-primary transition-colors">Finalisera direkt</span>
              </label>
            </div>
          </div>
        </div>
      </AdminFormDialog>

      <ConfirmActionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Finalisera stor faktura direkt?"
        description={`Detta finaliseras direkt och skickas till kund. Total: ${totalAmountSek.toLocaleString('sv-SE')} kr.`}
        confirmLabel="Skapa och finalisera"
        onConfirm={() => void createMutation.mutateAsync()}
        pending={createMutation.isPending}
      />
    </>
  );
}
