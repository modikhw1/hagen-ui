'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatSek } from '@/lib/admin/money';

type DemoSummary = {
  id: string;
  company_name: string;
  contact_email: string | null;
  proposed_price_ore: number | null;
};

type ConvertResult = {
  invite_sent?: boolean;
  warning?: string | null;
};

type Props = {
  demo: DemoSummary | null;
  open: boolean;
  onClose: () => void;
  onSaved: (result: ConvertResult) => void | Promise<void>;
};

const todayYmd = () => new Date().toISOString().slice(0, 10);

export default function ConvertDemoDialog({ demo, open, onClose, onSaved }: Props) {
  const [billingDay, setBillingDay] = useState('25');
  const [contractStartDate, setContractStartDate] = useState(todayYmd());
  const [sendInvite, setSendInvite] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setBillingDay('25');
      setContractStartDate(todayYmd());
      setSendInvite(true);
      setError(null);
    }
  }, [open]);

  const canSendInvite = Boolean(demo?.contact_email);

  const handleSubmit = async () => {
    if (!demo || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/demos/${demo.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          send_invite: canSendInvite ? sendInvite : false,
          billing_day_of_month: clampBillingDay(billingDay),
          contract_start_date: contractStartDate || todayYmd(),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        invite_sent?: boolean;
        warning?: string | null;
      };

      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte konvertera demo');
      }

      await onSaved({
        invite_sent: payload.invite_sent,
        warning: payload.warning ?? null,
      });
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Kunde inte konvertera demo',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Konvertera demo</DialogTitle>
          <DialogDescription>
            Skapa kundprofil direkt fran demo och skicka inbjudan om e-post finns.
          </DialogDescription>
        </DialogHeader>

        {demo ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-secondary/30 p-3 text-sm">
              <div className="font-semibold text-foreground">{demo.company_name}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {demo.contact_email || 'Ingen kontaktmail satt'}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {demo.proposed_price_ore == null ? 'Pris saknas' : `Prisforslag: ${formatSek(demo.proposed_price_ore)}`}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Startdatum">
                <input
                  value={contractStartDate}
                  onChange={(event) => setContractStartDate(event.target.value)}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                  type="date"
                />
              </Field>
              <Field label="Fakturadag">
                <input
                  value={billingDay}
                  onChange={(event) => setBillingDay(event.target.value)}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                  inputMode="numeric"
                />
              </Field>
            </div>

            <label className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-3 text-sm">
              <input
                checked={canSendInvite ? sendInvite : false}
                disabled={!canSendInvite}
                onChange={(event) => setSendInvite(event.target.checked)}
                type="checkbox"
              />
              <span className="space-y-1">
                <span className="block font-medium text-foreground">Skicka inbjudan direkt</span>
                <span className="block text-xs text-muted-foreground">
                  {canSendInvite
                    ? 'Kunden far inviteflodet direkt efter konvertering.'
                    : 'Kan inte skicka invite utan kontaktmail pa demon.'}
                </span>
              </span>
            </label>

            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}
          </div>
        ) : null}

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
            disabled={!demo || submitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? 'Konverterar...' : 'Konvertera till kund'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function clampBillingDay(value: string) {
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed)) return 25;
  return Math.max(1, Math.min(28, parsed));
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
