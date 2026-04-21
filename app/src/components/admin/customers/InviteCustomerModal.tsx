'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Link as LinkIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { calculateFirstInvoice } from '@/lib/billing/first-invoice';
import type { TikTokProfilePreview } from '@/lib/tiktok/profile';

type Team = Array<{
  id: string;
  name: string;
  email: string | null;
  color: string | null;
}>;

const todayYmd = () => new Date().toISOString().split('T')[0];

const initial = () => ({
  business_name: '',
  customer_contact_name: '',
  contact_email: '',
  phone: '',
  tiktok_profile_url: '',
  account_manager: '',
  pricing_status: 'fixed' as 'fixed' | 'unknown',
  monthly_price: 0,
  subscription_interval: 'month' as 'month' | 'quarter' | 'year',
  contract_start_date: todayYmd(),
  billing_day_of_month: 25,
  waive_days_until_billing: false,
  send_invite_now: true,
});

export default function InviteCustomerModal({
  open,
  team,
  onClose,
  onCreated,
}: {
  open: boolean;
  team: Team;
  onClose: () => void;
  onCreated: (customerId: string) => void | Promise<void>;
}) {
  const [v, setV] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const [verifyingTikTok, setVerifyingTikTok] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sendDemoPreview, setSendDemoPreview] = useState(true);
  const [tiktokPreview, setTiktokPreview] = useState<TikTokProfilePreview | null>(null);

  useEffect(() => {
    if (open) {
      setV(initial());
      setError(null);
      setTiktokPreview(null);
    }
  }, [open]);

  const preview = calculateFirstInvoice({
    pricingStatus: v.pricing_status,
    recurringPriceSek: v.monthly_price,
    startDate: v.contract_start_date,
    billingDay: v.billing_day_of_month,
    waiveDaysUntilBilling: v.waive_days_until_billing,
  });

  const canSubmit =
    v.business_name.trim() &&
    v.contact_email.trim() &&
    (v.pricing_status === 'unknown' || v.monthly_price > 0) &&
    (!v.tiktok_profile_url.trim() || Boolean(tiktokPreview));
  const profileSlug = v.business_name.trim().toLowerCase().replace(/[^a-zåäö0-9]+/g, '-').replace(/-+$/g, '');
  const profileUrl = profileSlug ? `https://letrend.se/demo/${profileSlug}` : '';
  const selectedCM = team.find((member) => member.email === v.account_manager || member.name === v.account_manager);

  const handleCopyLink = async () => {
    if (!profileUrl || typeof navigator === 'undefined') return;
    await navigator.clipboard.writeText(profileUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleVerifyTikTok = async () => {
    const input = v.tiktok_profile_url.trim();
    if (!input || verifyingTikTok) return;

    setVerifyingTikTok(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/admin/tiktok/profile-preview?input=${encodeURIComponent(input)}`,
        {
          credentials: 'include',
        }
      );
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        preview?: TikTokProfilePreview;
      };

      if (!res.ok || !payload.preview) {
        throw new Error(payload.error || 'Kunde inte verifiera TikTok-profilen');
      }

      setTiktokPreview(payload.preview);
      setV((s) => ({ ...s, tiktok_profile_url: payload.preview!.canonical_url }));
    } catch (verifyError: unknown) {
      setTiktokPreview(null);
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : 'Kunde inte verifiera TikTok-profilen'
      );
    } finally {
      setVerifyingTikTok(false);
    }
  };

  const handleSubmit = async () => {
    if (v.tiktok_profile_url.trim() && !tiktokPreview) {
      setError('Verifiera TikTok-profilen innan du skickar inbjudan.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(v),
      });
      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload.error || 'Kunde inte skapa kund');
      }

      await onCreated(payload.customer.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Kunde inte skapa kund');
    } finally {
      setSubmitting(false);
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
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bjud in ny kund</DialogTitle>
          <DialogDescription>
            Skapa kundprofil och skicka inbjudan till kontakten.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <Section title="Företag & kontakt">
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Företagsnamn *"
                value={v.business_name}
                onChange={(x) => setV((s) => ({ ...s, business_name: x }))}
                placeholder="Café Rosé"
              />
              <Field
                label="Kontaktperson"
                value={v.customer_contact_name}
                onChange={(x) =>
                  setV((s) => ({ ...s, customer_contact_name: x }))
                }
                placeholder="Maria Holm"
              />
              <Field
                label="E-post *"
                value={v.contact_email}
                type="email"
                onChange={(x) => setV((s) => ({ ...s, contact_email: x }))}
                placeholder="info@caferose.se"
              />
              <Field
                label="Telefon"
                value={v.phone}
                type="tel"
                onChange={(x) => setV((s) => ({ ...s, phone: x }))}
                placeholder="070-XXX XX XX"
              />
            </div>

            <div className="mt-3 rounded-lg border border-border bg-secondary/40 p-3">
              <Label>TikTok-profil</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={v.tiktok_profile_url}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setV((s) => ({ ...s, tiktok_profile_url: nextValue }));
                    setTiktokPreview(null);
                  }}
                  placeholder="https://www.tiktok.com/@konto"
                  className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/40"
                />
                <button
                  type="button"
                  onClick={() => void handleVerifyTikTok()}
                  disabled={verifyingTikTok || !v.tiktok_profile_url.trim()}
                  className="shrink-0 rounded-md border border-border bg-card px-3 py-2.5 text-sm font-medium hover:bg-accent/30 disabled:opacity-50"
                >
                  {verifyingTikTok ? 'Verifierar...' : 'Verifiera'}
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Profilen följer med redan i invite-flödet. Historik hämtas senare från kundsidan.
              </p>
              {tiktokPreview ? (
                <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                  <div className="font-semibold text-foreground">@{tiktokPreview.handle}</div>
                  {tiktokPreview.author_name ? <div>{tiktokPreview.author_name}</div> : null}
                </div>
              ) : null}
            </div>

            <div className="mt-3">
              <Label>Tilldela CM</Label>
              <select
                value={v.account_manager}
                onChange={(e) =>
                  setV((s) => ({ ...s, account_manager: e.target.value }))
                }
                className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/40"
              >
                <option value="">Ingen CM än</option>
                {team.map((t) => (
                  <option key={t.id} value={t.email || t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {profileUrl ? (
              <div className="mt-3 rounded-lg border border-border bg-secondary/50 p-3">
                <Label>Profillänk (demo-preview)</Label>
                <div className="flex items-center gap-2">
                  <LinkIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate font-mono text-sm text-foreground">{profileUrl}</span>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="inline-flex shrink-0 items-center gap-1 rounded border border-border bg-card px-2 py-1 text-xs font-medium hover:bg-accent/30"
                  >
                    <Copy className="h-3 w-3" />
                    {copied ? 'Kopierad!' : 'Kopiera'}
                  </button>
                </div>
                {selectedCM ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    CM: {selectedCM.name} kopplas till profilen
                  </p>
                ) : null}
              </div>
            ) : null}

            <label className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-secondary/50 p-3">
              <input
                type="checkbox"
                checked={sendDemoPreview}
                onChange={(event) => setSendDemoPreview(event.target.checked)}
              />
              <span className="text-sm text-foreground">
                Skicka demo-preview
                <span className="block text-xs text-muted-foreground">
                  Kunden får länken till profilen med prototypdata
                </span>
              </span>
            </label>
          </Section>

          <Section title="Prissättning">
            <div className="mb-3 grid grid-cols-2 gap-3">
              <PricingPicker
                active={v.pricing_status === 'fixed'}
                onClick={() => setV((s) => ({ ...s, pricing_status: 'fixed' }))}
                title="Fast pris"
                desc="Sätt återkommande debitering direkt."
              />
              <PricingPicker
                active={v.pricing_status === 'unknown'}
                onClick={() =>
                  setV((s) => ({
                    ...s,
                    pricing_status: 'unknown',
                    monthly_price: 0,
                  }))
                }
                title="Ej satt än"
                desc="Skapa kunden nu och sätt pris senare."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Pris (SEK)</Label>
                <input
                  type="number"
                  min={0}
                  value={v.monthly_price}
                  disabled={v.pricing_status === 'unknown'}
                  onChange={(e) =>
                    setV((s) => ({
                      ...s,
                      monthly_price: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm disabled:opacity-50"
                />
              </div>

              <div>
                <Label>Intervall</Label>
                <select
                  value={v.subscription_interval}
                  onChange={(e) =>
                    setV((s) => ({
                      ...s,
                      subscription_interval: e.target
                        .value as typeof v.subscription_interval,
                    }))
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
                >
                  <option value="month">Månad</option>
                  <option value="quarter">Kvartal</option>
                  <option value="year">År</option>
                </select>
              </div>
            </div>
          </Section>

          <Section title="Fakturering & start">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Startdatum</Label>
                <input
                  type="date"
                  value={v.contract_start_date}
                  onChange={(e) =>
                    setV((s) => ({ ...s, contract_start_date: e.target.value }))
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
                />
              </div>

              <div>
                <Label>Faktureringsdag (1–28)</Label>
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={v.billing_day_of_month}
                  onChange={(e) =>
                    setV((s) => ({
                      ...s,
                      billing_day_of_month: Math.max(
                        1,
                        Math.min(28, Number(e.target.value) || 25),
                      ),
                    }))
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
                />
              </div>
            </div>

            <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-md border border-border bg-warning/5 p-3">
              <input
                type="checkbox"
                checked={v.waive_days_until_billing}
                onChange={(e) =>
                  setV((s) => ({
                    ...s,
                    waive_days_until_billing: e.target.checked,
                  }))
                }
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-semibold text-foreground">
                  Bjud på dagarna fram till nästa faktureringsdag
                </div>
                <div className="text-xs text-muted-foreground">
                  Ingen första del-debitering före nästa ordinarie
                  faktureringsdag.
                </div>
              </div>
            </label>

            <div className="mt-3 rounded-md border border-border bg-secondary/50 p-3">
              <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                Förhandsvisning
              </div>
              <div className="text-sm text-foreground">
                {preview.explanation}
              </div>
              <div className="mt-1 text-sm font-semibold text-foreground">
                {preview.amountSek !== null
                  ? `Första faktura: ${preview.amountSek.toLocaleString('sv-SE')} kr`
                  : 'Första faktura beräknas när pris är satt'}
              </div>
              {preview.nextBillingDate && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Nästa ordinarie faktureringsdag: {preview.nextBillingDate}
                </div>
              )}
            </div>
          </Section>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={v.send_invite_now}
              onChange={(e) =>
                setV((s) => ({ ...s, send_invite_now: e.target.checked }))
              }
            />
            Skicka inbjudan via e-post direkt
          </label>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            {submitting ? 'Skapar…' : 'Skicka inbjudan'}
          </button>
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Avbryt
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/40"
      />
    </div>
  );
}

function PricingPicker({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border p-4 text-left transition-colors ${
        active
          ? 'border-primary bg-primary/5'
          : 'border-border bg-card hover:bg-accent/30'
      }`}
    >
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{desc}</div>
    </button>
  );
}
