'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
};

type FormState = {
  company_name: string;
  contact_name: string;
  contact_email: string;
  tiktok_handle: string;
  proposed_concepts_per_week: string;
  proposed_price_sek: string;
};

function initialState(): FormState {
  return {
    company_name: '',
    contact_name: '',
    contact_email: '',
    tiktok_handle: '',
    proposed_concepts_per_week: '3',
    proposed_price_sek: '',
  };
}

export default function CreateDemoDialog({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState<FormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(initialState());
      setError(null);
    }
  }, [open]);

  const canSubmit = useMemo(
    () => form.company_name.trim().length > 0,
    [form.company_name],
  );

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/demos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          company_name: form.company_name.trim(),
          contact_name: form.contact_name.trim() || null,
          contact_email: form.contact_email.trim() || null,
          tiktok_handle: normalizeHandle(form.tiktok_handle),
          proposed_concepts_per_week: parseOptionalInt(form.proposed_concepts_per_week),
          proposed_price_ore: parseOptionalSekToOre(form.proposed_price_sek),
          status: 'draft',
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte skapa demo');
      }

      await onCreated();
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Kunde inte skapa demo',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Ny demo</DialogTitle>
          <DialogDescription>
            Skapa ett nytt prospectkort och lagg in den information som redan finns.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Bolag *">
              <input
                value={form.company_name}
                onChange={(event) => setForm((current) => ({ ...current, company_name: event.target.value }))}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                placeholder="Cafe Rose"
              />
            </Field>
            <Field label="Kontaktperson">
              <input
                value={form.contact_name}
                onChange={(event) => setForm((current) => ({ ...current, contact_name: event.target.value }))}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                placeholder="Maria Holm"
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="E-post">
              <input
                value={form.contact_email}
                onChange={(event) => setForm((current) => ({ ...current, contact_email: event.target.value }))}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                placeholder="info@example.se"
                type="email"
              />
            </Field>
            <Field label="TikTok-handle">
              <input
                value={form.tiktok_handle}
                onChange={(event) => setForm((current) => ({ ...current, tiktok_handle: event.target.value }))}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                placeholder="@konto"
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Koncept per vecka">
              <input
                value={form.proposed_concepts_per_week}
                onChange={(event) => setForm((current) => ({ ...current, proposed_concepts_per_week: event.target.value }))}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                inputMode="numeric"
                placeholder="3"
              />
            </Field>
            <Field label="Pris per manad (SEK)">
              <input
                value={form.proposed_price_sek}
                onChange={(event) => setForm((current) => ({ ...current, proposed_price_sek: event.target.value }))}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                inputMode="numeric"
                placeholder="12000"
              />
            </Field>
          </div>

          <p className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
            E-post och pris kan fyllas i senare. Konvertering till kund blir tydligare om de finns redan nu.
          </p>

          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm"
          >
            Avbryt
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? 'Skapar...' : 'Skapa demo'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function normalizeHandle(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
}

function parseOptionalInt(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalSekToOre(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
