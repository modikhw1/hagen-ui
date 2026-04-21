'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Props = {
  open: boolean;
  customerId: string;
  customerName: string;
  onClose: () => void;
  onApplied: (profile: Record<string, unknown>) => void;
};

export default function DiscountModal({
  open,
  customerId,
  customerName,
  onClose,
  onApplied,
}: Props) {
  const [type, setType] = useState<'percent' | 'amount' | 'free_months'>(
    'percent',
  );
  const [value, setValue] = useState(0);
  const [durationMonths, setDurationMonths] = useState(1);
  const [ongoing, setOngoing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setType('percent');
    setValue(0);
    setDurationMonths(1);
    setOngoing(false);
    setError(null);
  }, [open]);

  const submit = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/customers/${customerId}/discount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type,
          value: type === 'free_months' ? 100 : value,
          duration_months: ongoing ? null : durationMonths,
          ongoing,
        }),
      });
      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload.error || 'Kunde inte spara erbjudandet');
      }

      onApplied(payload.profile);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Kunde inte spara erbjudandet');
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lägg till erbjudande</DialogTitle>
          <DialogDescription>För {customerName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
              Typ
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
            >
              <option value="percent">Procent</option>
              <option value="amount">Fast belopp</option>
              <option value="free_months">Gratis period</option>
            </select>
          </div>

          {type !== 'free_months' && (
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
                Värde {type === 'percent' ? '(%)' : '(kr)'}
              </label>
              <input
                type="number"
                min={0}
                value={value}
                onChange={(e) =>
                  setValue(Math.max(0, Number(e.target.value) || 0))
                }
                className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
              />
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={ongoing}
              onChange={(e) => setOngoing(e.target.checked)}
            />
            Prissänkning tills vidare
          </label>

          {!ongoing && (
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
                Varaktighet (månader)
              </label>
              <input
                type="number"
                min={1}
                max={36}
                value={durationMonths}
                onChange={(e) =>
                  setDurationMonths(
                    Math.max(1, Math.min(36, Number(e.target.value) || 1)),
                  )
                }
                className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
              />
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-md border border-border px-4 py-2 text-sm"
          >
            Avbryt
          </button>
          <button
            onClick={() => void submit()}
            disabled={loading}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {loading ? 'Sparar...' : 'Spara erbjudande'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
