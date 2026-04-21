'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DraftInvoiceItem {
  description: string;
  amount: number;
}

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
  const [items, setItems] = useState<DraftInvoiceItem[]>([
    { description: '', amount: 0 },
  ]);
  const [daysUntilDue, setDaysUntilDue] = useState(14);
  const [autoFinalize, setAutoFinalize] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setItems([{ description: '', amount: 0 }]);
    setDaysUntilDue(14);
    setAutoFinalize(true);
    setError(null);
  }, [open]);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/invoices/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          customer_profile_id: customerId,
          items: items.filter((item) => item.description.trim() && item.amount > 0),
          days_until_due: daysUntilDue,
          auto_finalize: autoFinalize,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte skapa faktura');
      }

      onCreated();
    } catch (createError: unknown) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'Kunde inte skapa faktura',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Skapa manuell faktura</DialogTitle>
          <DialogDescription>För {customerName}</DialogDescription>
        </DialogHeader>

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
                      rowIndex === index
                        ? { ...row, description: event.target.value }
                        : row,
                    ),
                  )
                }
                placeholder="Beskrivning"
                className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
              />
              <input
                type="number"
                min={0}
                value={item.amount}
                onChange={(event) =>
                  setItems((current) =>
                    current.map((row, rowIndex) =>
                      rowIndex === index
                        ? {
                            ...row,
                            amount: Math.max(
                              0,
                              Number(event.target.value) || 0,
                            ),
                          }
                        : row,
                    ),
                  )
                }
                placeholder="Belopp (kr)"
                className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
              />
              <button
                onClick={() =>
                  setItems((current) =>
                    current.length === 1
                      ? current
                      : current.filter((_, rowIndex) => rowIndex !== index),
                  )
                }
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                Ta bort
              </button>
            </div>
          ))}

          <button
            onClick={() =>
              setItems((current) => [...current, { description: '', amount: 0 }])
            }
            className="w-fit rounded-md border border-border px-3 py-2 text-sm"
          >
            Lägg till rad
          </button>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
                Förfaller om (dagar)
              </label>
              <input
                type="number"
                min={1}
                max={90}
                value={daysUntilDue}
                onChange={(event) =>
                  setDaysUntilDue(
                    Math.max(1, Math.min(90, Number(event.target.value) || 14)),
                  )
                }
                className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 pt-6 text-sm text-foreground">
              <input
                type="checkbox"
                checked={autoFinalize}
                onChange={(event) => setAutoFinalize(event.target.checked)}
              />
              Finalisera direkt
            </label>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-md border border-border px-4 py-2 text-sm"
          >
            Avbryt
          </button>
          <button
            onClick={() => void handleCreate()}
            disabled={loading}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {loading ? 'Skapar...' : 'Skapa faktura'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
