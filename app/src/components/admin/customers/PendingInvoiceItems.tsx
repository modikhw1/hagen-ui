'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FilePlus2 } from 'lucide-react';
import EmptyState from '@/components/admin/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { formatSek, sekToOre } from '@/lib/admin/money';
import { usePendingInvoiceItemsRefresh } from '@/hooks/admin/useAdminRefresh';

type PendingInvoiceItem = {
  id: string;
  description: string;
  amount_ore: number;
  amount_sek: number;
  currency: string;
  created: string | null;
};

export default function PendingInvoiceItems({ customerId }: { customerId: string }) {
  const refreshPendingItems = usePendingInvoiceItemsRefresh(customerId);
  const [showForm, setShowForm] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['admin', 'customer', customerId, 'pending-items'],
    queryFn: async (): Promise<PendingInvoiceItem[]> => {
      const response = await fetch(
        `/api/admin/customers/${customerId}/invoice-items`,
        {
          credentials: 'include',
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte ladda fakturatillagg');
      }
      return payload.items || [];
    },
  });

  const handleCreate = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/customers/${customerId}/invoice-items`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ description, amount, currency: 'sek' }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte skapa fakturatillagg');
      }
      setDescription('');
      setAmount(0);
      setShowForm(false);
      await refreshPendingItems();
    } catch (createError: unknown) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'Kunde inte skapa fakturatillagg',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (itemId: string) => {
    setDeletingId(itemId);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/customers/${customerId}/invoice-items/${itemId}`,
        {
          method: 'DELETE',
          credentials: 'include',
        },
      );
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || 'Kunde inte ta bort fakturatillagg');
      }
      await refreshPendingItems();
    } catch (deleteError: unknown) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Kunde inte ta bort fakturatillagg',
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="rounded-md border border-border bg-secondary/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Pending items
          </div>
          <div className="text-sm text-muted-foreground">
            Dessa poster läggs till på kundens nästa faktura.
          </div>
        </div>
        <button
          onClick={() => setShowForm((current) => !current)}
          className="rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold"
        >
          {showForm ? 'Stang' : 'Lagg till rad'}
        </button>
      </div>

      {showForm && (
        <div className="mb-3 grid gap-2 rounded-md border border-border bg-background p-3">
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Beskrivning"
            className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
          />
          <input
            type="number"
            min={0}
            value={amount}
            onChange={(event) =>
              setAmount(Math.max(0, Number(event.target.value) || 0))
            }
            placeholder="Belopp (kr)"
            className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
          />
          <div className="flex justify-end">
            <button
              onClick={() => void handleCreate()}
              disabled={submitting || !description.trim() || amount <= 0}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {submitting ? 'Sparar...' : 'Spara rad'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full rounded-md" />
          <Skeleton className="h-14 w-full rounded-md" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={FilePlus2}
          title="Inga pending items"
          hint="Nya tillagg du lagger har foljer med pa nasta faktura."
        />
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3"
            >
              <div>
                <div className="text-sm font-semibold text-foreground">
                  {item.description}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatSek(item.amount_ore || sekToOre(item.amount_sek || 0))}
                </div>
              </div>
              <button
                onClick={() => void handleDelete(item.id)}
                disabled={deletingId === item.id}
                className="rounded-md border border-destructive px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-50"
              >
                {deletingId === item.id ? 'Tar bort...' : 'Ta bort'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
