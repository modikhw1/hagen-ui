'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { changeSubscriptionPrice, previewSubscriptionPrice } from '@/app/admin/_actions/billing';
import { Metric, ModeButton } from '@/components/admin/_primitives';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AdminFormDialog } from '@/components/admin/ui/feedback/AdminFormDialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { parseMonthlyPriceSekInput } from '@/lib/admin/billing';
import { logAdminClientError } from '@/lib/admin/logger';
import { formatPriceSEK, formatSek } from '@/lib/admin/money';
import { shortDateSv } from '@/lib/admin/time';
import { subscriptionPriceChangeSchema } from '@/lib/schemas/billing';
import { cn } from '@/lib/utils';

type PreviewPayload = {
  mode: 'now' | 'next_period';
  effective_date: string;
  subscription_id: string;
  current_period_end: string | null;
  proration_behavior: 'create_prorations' | 'none';
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
  const [monthlyPrice, setMonthlyPrice] = useState(currentPriceSek ? String(currentPriceSek) : '');
  const [mode, setMode] = useState<'now' | 'next_period'>('now');
  const [previewedFor, setPreviewedFor] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<{
    preview: PreviewPayload;
    previewKey: string;
  } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const previewRequestIdRef = useRef(0);

  const validation = useMemo(() => {
    const parsedAmount = parseMonthlyPriceSekInput(monthlyPrice);
    return subscriptionPriceChangeSchema.safeParse({
      monthly_price: parsedAmount ?? Number.NaN,
      mode,
    });
  }, [mode, monthlyPrice]);

  const previewKey = validation.success
    ? `${validation.data.monthly_price}:${validation.data.mode}`
    : null;
  const validatedMonthlyPrice = validation.success ? validation.data.monthly_price : null;
  const validatedMode = validation.success ? validation.data.mode : null;

  const previewMutation = useMutation({
    mutationKey: ['admin', 'customer-subscription-preview', customerId],
    mutationFn: async (input: {
      monthlyPriceSek: number;
      mode: 'now' | 'next_period';
      previewKey: string;
      requestId: number;
    }) => {
      const result = await previewSubscriptionPrice({
        customerId,
        monthlyPriceSek: input.monthlyPriceSek,
        mode: input.mode,
      });

      if ('error' in result) {
        throw new Error(result.error.message);
      }

      return {
        preview: result.data as PreviewPayload,
        previewKey: input.previewKey,
        requestId: input.requestId,
      };
    },
  });

  const saveMutation = useMutation({
    mutationKey: ['admin', 'customer-subscription-price-change', customerId],
    mutationFn: async () => {
      if (!validation.success || previewedFor !== previewKey) {
        throw new Error('Förhandsvisningen är inaktuell. Uppdatera innan du sparar.');
      }

      const result = await changeSubscriptionPrice({
        customerId,
        monthlyPriceSek: validation.data.monthly_price,
        mode: validation.data.mode,
      });

      if ('error' in result) {
        throw new Error(result.error.message);
      }

      return result.data;
    },
    onSuccess: () => {
      onClose();
      void onChanged();
    },
  });

  const requestPreview = useCallback(async () => {
    if (!previewKey || validatedMonthlyPrice === null || validatedMode === null) {
      return;
    }

    const requestId = ++previewRequestIdRef.current;
    try {
      const result = await previewMutation.mutateAsync({
        monthlyPriceSek: validatedMonthlyPrice,
        mode: validatedMode,
        previewKey,
        requestId,
      });

      if (result.requestId !== previewRequestIdRef.current) {
        return;
      }

      setPreviewResult({
        preview: result.preview,
        previewKey: result.previewKey,
      });
      setPreviewedFor(result.previewKey);
      setPreviewError(null);
    } catch (error) {
      if (requestId !== previewRequestIdRef.current) {
        return;
      }
      setPreviewError(error instanceof Error ? error.message : 'Kunde inte hämta förhandsvisning.');
    }
  }, [previewKey, previewMutation, validatedMode, validatedMonthlyPrice]);

  useEffect(() => {
    if (!validation.success || !previewKey || previewMutation.isPending) return;
    if (previewResult?.previewKey === previewKey) return;

    const timeout = window.setTimeout(() => {
      void requestPreview();
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [previewKey, previewMutation.isPending, previewResult?.previewKey, requestPreview, validation.success]);

  const preview = previewResult?.preview ?? null;
  const stalePreview = Boolean(preview && previewKey && previewResult?.previewKey !== previewKey);
  
  const percentChange =
    preview && preview.current_price_ore > 0
      ? Math.round(
          ((preview.new_price_ore - preview.current_price_ore) / preview.current_price_ore) * 100,
        )
      : null;

  const errorMsg = saveMutation.error instanceof Error
    ? saveMutation.error.message
    : previewError || (validation.success ? null : validation.error.issues[0]?.message);

  return (
    <AdminFormDialog
      open={open}
      onClose={onClose}
      title="Ändra abonnemangspris"
      description={customerName}
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent">
            Avbryt
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !validation.success || previewedFor !== previewKey}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Sparar...' : mode === 'now' ? 'Byt pris nu' : 'Schemalägg prisbyte'}
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Nytt månadspris</label>
            <div className="relative">
              <Input
                value={monthlyPrice}
                onChange={(event) => setMonthlyPrice(event.target.value)}
                inputMode="numeric"
                className="pr-8"
              />
              <span className="absolute right-3 top-2 text-sm text-muted-foreground">kr</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">När ska bytet ske</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMode('now')}
                className={cn(
                  "rounded-md border p-2 text-left transition-colors",
                  mode === 'now' ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                )}
              >
                <div className="text-xs font-bold">Nu</div>
                <div className="text-[10px] text-muted-foreground">Prorata direkt</div>
              </button>
              <button
                onClick={() => setMode('next_period')}
                className={cn(
                  "rounded-md border p-2 text-left transition-colors",
                  mode === 'next_period' ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                )}
              >
                <div className="text-xs font-bold">Nästa period</div>
                <div className="text-[10px] text-muted-foreground">Vid periodslut</div>
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-secondary/10 p-4">
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-border/50 pb-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-tight text-foreground">Förhandsvisning</div>
              <div className="text-[11px] text-muted-foreground">
                Nuvarande {formatPriceSEK(currentPriceSek, { fallback: 'Ej satt' })}
              </div>
            </div>
            {(!preview || stalePreview) && (
              <button
                onClick={() => requestPreview()}
                disabled={previewMutation.isPending || !validation.success}
                className="text-[11px] font-bold text-primary hover:underline disabled:opacity-50"
              >
                {previewMutation.isPending ? 'Hämtar...' : 'Uppdatera'}
              </button>
            )}
          </div>

          {stalePreview && (
            <div className="mb-4 rounded-md border border-status-warning-fg/20 bg-status-warning-bg px-3 py-2 text-[11px] text-status-warning-fg">
              Förhandsvisningen är inaktuell. Uppdatera innan du sparar.
            </div>
          )}

          {preview ? (
            <div className="space-y-4">
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-bold text-foreground tabular-nums">{formatSek(preview.new_price_ore)}</span>
                {percentChange !== null && (
                  <span className={cn(
                    "text-xs font-bold",
                    percentChange > 0 ? "text-status-danger-fg" : "text-status-success-fg"
                  )}>
                    {percentChange > 0 ? '+' : ''}{percentChange}%
                  </span>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Metric label="Nu att fakturera" value={mode === 'now' ? formatSek(preview.invoice_total_ore) : '0 kr'} />
                <Metric label="Träder i kraft" value={shortDateSv(preview.effective_date)} />
              </div>

              <div className="overflow-hidden rounded-lg border border-border bg-card">
                <Table>
                  <TableHeader className="bg-secondary/40">
                    <TableRow>
                      <TableHead className="h-8 text-[10px] font-bold uppercase">Beskrivning</TableHead>
                      <TableHead className="h-8 text-right text-[10px] font-bold uppercase">Belopp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.line_items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="py-2 text-[11px]">{item.description}</TableCell>
                        <TableCell className="py-2 text-right text-[11px] font-bold">{formatSek(item.amount_ore)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-muted-foreground italic">
              Väntar på inmatning...
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="rounded-md border border-status-danger-fg/30 bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg">
            {errorMsg}
          </div>
        )}
      </div>
    </AdminFormDialog>
  );
}
