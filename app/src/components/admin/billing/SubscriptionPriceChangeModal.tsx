'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { callCustomerAction } from '@/lib/admin/api-client';
import { formatSek } from '@/lib/admin/money';

type PreviewPayload = {
  mode: 'now' | 'next_period';
  effective_date: string;
  current_price_ore: number;
  new_price_ore: number;
  line_items: Array<{
    id: string;
    description: string;
    amount_ore: number;
    currency: string;
    period_start: string | null;
    period_end: string | null;
  }>;
  invoice_total_ore: number;
};

export default function SubscriptionPriceChangeModal({
  open,
  customerId,
  customerName,
  currentPriceSek,
  onClose,
  onChanged,
}: {
  open: boolean;
  customerId: string;
  customerName: string;
  currentPriceSek: number | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [monthlyPrice, setMonthlyPrice] = useState(
    currentPriceSek ? String(currentPriceSek) : '',
  );
  const [mode, setMode] = useState<'now' | 'next_period'>('now');
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setMonthlyPrice(currentPriceSek ? String(currentPriceSek) : '');
    setMode('now');
    setPreview(null);
    setError(null);
  }, [currentPriceSek, open]);

  const loadPreview = async () => {
    setLoadingPreview(true);
    setError(null);
    setPreview(null);

    try {
      const response = await fetch(`/api/admin/customers/${customerId}/subscription-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          monthly_price: Number(monthlyPrice),
          mode,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        preview?: PreviewPayload;
      };

      if (!response.ok || !payload.preview) {
        throw new Error(payload.error || 'Kunde inte forhandsvisa prisandringen');
      }

      setPreview(payload.preview);
    } catch (previewError: unknown) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : 'Kunde inte forhandsvisa prisandringen',
      );
    } finally {
      setLoadingPreview(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);

    try {
      const result = await callCustomerAction(customerId, {
        action: 'change_subscription_price',
        monthly_price: Number(monthlyPrice),
        mode,
      });

      if (!result.ok) {
        throw new Error(result.error || 'Kunde inte spara prisandringen');
      }

      onChanged();
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error ? saveError.message : 'Kunde inte spara prisandringen',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Andra abonnemangspris</DialogTitle>
          <DialogDescription>
            {customerName}. Valj om priset ska sla igenom nu med prorata eller vid nasta periodskifte.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-[1.2fr_1fr]">
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                Nytt manadspris
              </div>
              <input
                value={monthlyPrice}
                onChange={(event) => {
                  setMonthlyPrice(event.target.value);
                  setPreview(null);
                }}
                inputMode="decimal"
                placeholder="9900"
                className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
              />
            </div>

            <div>
              <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                Nar ska bytet ske
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ModeButton
                  active={mode === 'now'}
                  onClick={() => {
                    setMode('now');
                    setPreview(null);
                  }}
                  title="Nu"
                  description="Stripe skapar prorata direkt"
                />
                <ModeButton
                  active={mode === 'next_period'}
                  onClick={() => {
                    setMode('next_period');
                    setPreview(null);
                  }}
                  title="Nasta period"
                  description="Schemalaggs till periodslut"
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-secondary/30 p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">Forhandsvisning</div>
                <div className="text-xs text-muted-foreground">
                  Nuvarande pris {formatSek(Math.round((currentPriceSek ?? 0) * 100))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void loadPreview()}
                disabled={loadingPreview || !Number.isFinite(Number(monthlyPrice)) || Number(monthlyPrice) <= 0}
                className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
              >
                {loadingPreview ? 'Hamta preview...' : 'Forhandsvisa'}
              </button>
            </div>

            {preview ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Metric label="Nuvarande manadspris" value={formatSek(preview.current_price_ore)} />
                  <Metric label="Nytt manadspris" value={formatSek(preview.new_price_ore)} />
                  <Metric
                    label={mode === 'now' ? 'Nu att fakturera' : 'Trader i kraft'}
                    value={
                      mode === 'now'
                        ? formatSek(preview.invoice_total_ore)
                        : preview.effective_date
                    }
                  />
                </div>

                <div className="overflow-hidden rounded-lg border border-border bg-card">
                  {preview.line_items.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-muted-foreground">
                      Inga Stripe-rader att visa for den har andringen.
                    </div>
                  ) : (
                    preview.line_items.map((lineItem, index) => (
                      <div
                        key={lineItem.id}
                        className={`flex items-start justify-between gap-4 px-4 py-3 ${
                          index < preview.line_items.length - 1 ? 'border-b border-border' : ''
                        }`}
                      >
                        <div>
                          <div className="text-sm font-medium text-foreground">
                            {lineItem.description}
                          </div>
                          {(lineItem.period_start || lineItem.period_end) ? (
                            <div className="text-xs text-muted-foreground">
                              {lineItem.period_start?.slice(0, 10) || '-'} till {lineItem.period_end?.slice(0, 10) || '-'}
                            </div>
                          ) : null}
                        </div>
                        <div className="text-sm font-semibold text-foreground">
                          {formatSek(lineItem.amount_ore)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Hamta preview innan du sparar sa ser du precis vad som skapas.
              </div>
            )}
          </div>

          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-md border border-border px-4 py-2 text-sm"
            >
              Avbryt
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !Number.isFinite(Number(monthlyPrice)) || Number(monthlyPrice) <= 0}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {saving ? 'Sparar...' : mode === 'now' ? 'Byt pris nu' : 'Schemalagg prisbyte'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-3 text-left ${
        active ? 'border-primary bg-primary/5' : 'border-border bg-background'
      }`}
    >
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{description}</div>
    </button>
  );
}
