'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { usePendingInvoiceItemsRefresh } from '@/hooks/admin/useAdminRefresh';
import { apiClient } from '@/lib/admin/api-client';
import { formatSek } from '@/lib/admin/money';
import { OPERATOR_COPY } from '@/lib/admin/copy/operator-glossary';
import { useCustomerPendingInvoiceItems, type PendingInvoiceItem } from '@/hooks/admin/useCustomerPendingInvoiceItems';
import { LineItemEditor, type LineItem } from '@/components/admin/ui/form/LineItemEditor';
import { oreToSek } from '@/lib/admin/money';

export default function PendingInvoiceItems({ customerId }: { customerId: string }) {
  const refreshPendingItems = usePendingInvoiceItemsRefresh(customerId);
  const [showForm, setShowForm] = useState(false);
  const [newItems, setNewItems] = useState<LineItem[]>([]);
  const [internalNote, setInternalNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: items = [], isLoading } = useCustomerPendingInvoiceItems(customerId);

  const handleCreate = async () => {
    if (newItems.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      for (const item of newItems) {
        await apiClient.post(`/api/admin/customers/${customerId}/invoice-items`, {
          description: item.description,
          amount: oreToSek(item.amount),
          internal_note: internalNote || null,
          currency: 'sek',
        });
      }
      setNewItems([]);
      setInternalNote('');
      setShowForm(false);
      await refreshPendingItems();
    } catch (createError: unknown) {
      setError(createError instanceof Error ? createError.message : 'Kunde inte skapa post');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (itemId: string) => {
    setDeletingId(itemId);
    setError(null);
    try {
      await apiClient.del(`/api/admin/customers/${customerId}/invoice-items/${itemId}`);
      await refreshPendingItems();
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : 'Kunde inte ta bort post');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs font-semibold text-primary hover:underline"
        >
          {showForm ? 'Avbryt' : `+ ${OPERATOR_COPY.pendingItems.addCta}`}
        </button>
      </div>

      {showForm && (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
          <LineItemEditor
            items={newItems}
            onChange={setNewItems}
            addLabel={OPERATOR_COPY.pendingItems.addCta}
            showTotal={false}
          />
          <input
            value={internalNote}
            onChange={(e) => setInternalNote(e.target.value)}
            placeholder="Intern notering (syns bara här)"
            className="w-full rounded-md border border-border bg-secondary/20 px-3 py-2 text-sm focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="rounded-md border border-border px-4 py-1.5 text-xs font-medium hover:bg-accent"
            >
              Avbryt
            </button>
            <button
              onClick={handleCreate}
              disabled={submitting || newItems.length === 0 || newItems.some(it => !it.description.trim() || it.amount <= 0)}
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {submitting ? 'Sparar...' : 'Spara poster'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md bg-status-danger-bg px-3 py-2 text-xs text-status-danger-fg">
          {error}
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-20 w-full rounded-lg" />
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <div className="text-sm font-medium text-foreground">{OPERATOR_COPY.pendingItems.emptyTitle}</div>
          <div className="text-xs text-muted-foreground">{OPERATOR_COPY.pendingItems.emptyHint}</div>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border bg-background">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between p-3 transition-colors hover:bg-secondary/10">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-foreground">{item.description}</div>
                {item.metadata?.internal_note && (
                  <div className="mt-0.5 text-xs text-muted-foreground italic">
                    Not: {item.metadata.internal_note}
                  </div>
                )}
              </div>
              <div className="ml-4 flex items-center gap-4">
                <div className="text-sm font-medium text-foreground text-right tabular-nums">
                  {formatSek(item.amount_ore)}
                </div>
                <button
                  onClick={() => handleDelete(item.id)}
                  disabled={!!deletingId}
                  className="text-muted-foreground hover:text-status-danger-fg transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
