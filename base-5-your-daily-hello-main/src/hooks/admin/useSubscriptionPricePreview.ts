'use client';

import { useEffect, useState } from 'react';

export interface PreviewLineItem {
  id: string;
  description: string;
  amount_ore: number;
  currency: string;
  period_start: string | null;
  period_end: string | null;
}

export interface SubscriptionPricePreview {
  mode: 'now' | 'next_period';
  effective_date: string;
  current_period_end: string | null;
  proration_behavior: 'create_prorations' | 'none';
  current_price_ore: number;
  new_price_ore: number;
  line_items: PreviewLineItem[];
  invoice_total_ore: number;
}

export interface UsePricePreviewArgs {
  enabled: boolean;
  customerId: string;
  newMonthlyPriceKr: number | null;
  currentPriceOre: number;
  mode: 'now' | 'next_period';
  /** Debounce in ms, default 400 */
  debounceMs?: number;
}

export interface UsePricePreviewResult {
  preview: SubscriptionPricePreview | null;
  loading: boolean;
  error: string | null;
}

/**
 * Återanvändbar hook som hämtar Stripe proration-preview för
 * subscription-prisändringar. Debouncar input och avbryter inflight-fetches.
 *
 * Skipping: returnerar null preview om priset är samma som nuvarande,
 * priset är ogiltigt, eller hooken är inaktiv.
 */
export function useSubscriptionPricePreview({
  enabled,
  customerId,
  newMonthlyPriceKr,
  currentPriceOre,
  mode,
  debounceMs = 400,
}: UsePricePreviewArgs): UsePricePreviewResult {
  const [preview, setPreview] = useState<SubscriptionPricePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setPreview(null);
      setError(null);
      return;
    }
    if (
      newMonthlyPriceKr == null ||
      !Number.isFinite(newMonthlyPriceKr) ||
      newMonthlyPriceKr <= 0
    ) {
      setPreview(null);
      return;
    }
    if (Math.round(newMonthlyPriceKr * 100) === currentPriceOre) {
      setPreview(null);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/customers/${customerId}/subscription-preview`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              monthly_price: newMonthlyPriceKr,
              mode,
            }),
          },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        const json = await res.json();
        setPreview(json.preview ?? null);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Kunde inte hämta preview');
        setPreview(null);
      } finally {
        setLoading(false);
      }
    }, debounceMs);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [
    enabled,
    customerId,
    newMonthlyPriceKr,
    currentPriceOre,
    mode,
    debounceMs,
  ]);

  return { preview, loading, error };
}
