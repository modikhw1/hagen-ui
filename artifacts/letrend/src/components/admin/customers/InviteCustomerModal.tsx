'use client';

import { useEffect, useReducer, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, Copy, UserPlus, ShieldAlert, FileText, Send } from 'lucide-react';
import { toast } from 'sonner';
import { inviteCustomer } from '@/app/admin/_actions/billing';
import { AdminFormDialog } from '@/components/admin/ui/feedback/AdminFormDialog';
import { AdminField } from '@/components/admin/ui/form/AdminField';
import { PricingPicker, Section } from '@/components/admin/_primitives';
import { apiClient } from '@/lib/admin/api-client';
import { calculateFirstInvoice } from '@/lib/billing/first-invoice';
import { createCustomerSchema, type CreateCustomerPayload } from '@/lib/schemas/customer';
import type { TikTokProfilePreview } from '@/lib/tiktok/profile';
import { cn } from '@/lib/utils';

type Team = Array<{
  id: string;
  name: string;
  email: string | null;
}>;

type InviteState = CreateCustomerPayload;

const todayYmd = () => new Date().toISOString().split('T')[0];

const initial = (): InviteState => ({
  business_name: '',
  customer_contact_name: '',
  contact_email: '',
  phone: '',
  tiktok_profile_url: '',
  account_manager: '',
  pricing_status: 'fixed',
  monthly_price: 0,
  subscription_interval: 'month',
  contract_start_date: todayYmd(),
  billing_day_of_month: 25,
  waive_days_until_billing: false,
  send_invite_now: true,
  first_invoice_behavior: 'prorated',
  discount_type: 'none',
  discount_value: 0,
  discount_duration_months: 1,
  discount_start_date: null,
  discount_end_date: null,
  upcoming_monthly_price: null,
  upcoming_price_effective_date: null,
  invoice_text: null,
  scope_items: [],
  price_start_date: null,
  price_end_date: null,
  contacts: [],
  profile_data: {},
  game_plan: {},
  concepts: [],
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
  onCreated: (cid: string, meta?: any) => void;
}) {
  const [state, setState] = useState<InviteState>(initial);
  const [tiktokPreview, setTiktokPreview] = useState<TikTokProfilePreview | null>(null);
  
  const setField = (field: keyof InviteState, value: any) => {
    setState(prev => ({ ...prev, [field]: value }));
  };

  const validation = createCustomerSchema.safeParse(state);
  const canSubmit = validation.success && (!state.tiktok_profile_url?.trim() || Boolean(tiktokPreview));

  const verifyTikTok = useMutation({
    mutationFn: async (input: string) => apiClient.get<any>('/api/admin/tiktok/profile-preview', { query: { input } }),
    onSuccess: (data) => {
      setTiktokPreview(data.preview);
      setField('tiktok_profile_url', data.preview.canonical_url);
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const result = await inviteCustomer(state);
      if ('error' in result) throw new Error(result.error.message);
      return result.data;
    },
    onSuccess: (payload: any) => {
      toast.success(state.send_invite_now ? 'Kunden inbjuden' : 'Utkast skapat');
      onCreated(payload.customerId, payload);
      onClose();
      setState(initial());
    }
  });

  const preview = calculateFirstInvoice({
    pricingStatus: state.pricing_status,
    recurringPriceSek: state.monthly_price,
    startDate: state.contract_start_date ?? todayYmd(),
    billingDay: state.billing_day_of_month,
    waiveDaysUntilBilling: state.waive_days_until_billing,
  });

  return (
    <AdminFormDialog
      open={open}
      onClose={onClose}
      title={state.send_invite_now ? 'Bjud in ny kund' : 'Skapa kundutkast'}
      description="Skapa kundprofil. Stripe-prenumerationen aktiveras först när kunden går igenom checkout."
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent">
            Avbryt
          </button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit || createMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {state.send_invite_now ? <Send className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
            {createMutation.isPending
              ? 'Skapar...'
              : state.send_invite_now
                ? 'Skapa & skicka inbjudan'
                : 'Skapa utkast (ingen e-post)'}
          </button>
        </>
      }
    >
      <div className="space-y-8">
        {/* Lifecycle val överst */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Hur vill du skapa kunden?</label>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setField('send_invite_now', false)}
              className={cn(
                "rounded-lg border p-4 text-left transition-colors",
                !state.send_invite_now ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
              )}
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                <FileText className="h-3.5 w-3.5" /> Utkast
              </div>
              <div className="mt-1 text-xs text-muted-foreground">Skapa profil utan inbjudan. Bjud in senare när avtalet är klart.</div>
            </button>
            <button
              type="button"
              onClick={() => setField('send_invite_now', true)}
              className={cn(
                "rounded-lg border p-4 text-left transition-colors",
                state.send_invite_now ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
              )}
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                <Send className="h-3.5 w-3.5" /> Skicka inbjudan nu
              </div>
              <div className="mt-1 text-xs text-muted-foreground">Kunden får e-post och kan logga in. Stripe aktiveras vid checkout.</div>
            </button>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <AdminField label="Företagsnamn" required error={validation.success ? undefined : (validation.error.format() as any).business_name?._errors[0]}>
            <input
              value={state.business_name}
              onChange={e => setField('business_name', e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="Företaget AB"
            />
          </AdminField>
          <AdminField label="Kontaktperson">
            <input
              value={state.customer_contact_name ?? ''}
              onChange={e => setField('customer_contact_name', e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="Maria Holm"
            />
          </AdminField>
          <AdminField label="E-post" required>
            <input
              type="email"
              value={state.contact_email}
              onChange={e => setField('contact_email', e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="maria@foretaget.se"
            />
          </AdminField>
          <AdminField label="Telefon">
            <input
              value={state.phone ?? ''}
              onChange={e => setField('phone', e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </AdminField>
        </div>

        <div className="rounded-xl border border-border bg-secondary/10 p-4">
          <AdminField label="TikTok-profil" hint="Valfritt, men rekommenderas">
            <div className="flex gap-2">
              <input
                value={state.tiktok_profile_url ?? ''}
                onChange={e => {
                  setField('tiktok_profile_url', e.target.value);
                  setTiktokPreview(null);
                }}
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="https://..."
              />
              <button
                type="button"
                onClick={() => verifyTikTok.mutate(state.tiktok_profile_url!)}
                disabled={verifyTikTok.isPending || !state.tiktok_profile_url?.trim()}
                className="rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold hover:bg-accent"
              >
                Verifiera
              </button>
            </div>
            {tiktokPreview && (
              <div className="mt-3 flex items-center gap-3 rounded-lg border border-status-success-fg/20 bg-status-success-bg/10 p-3">
                <div className="h-8 w-8 rounded-full bg-secondary overflow-hidden">
                  {tiktokPreview.cover_image_url && <img src={tiktokPreview.cover_image_url} alt="" />}
                </div>
                <div className="text-xs">
                  <div className="font-bold text-foreground">@{tiktokPreview.handle}</div>
                  <div className="text-muted-foreground">{tiktokPreview.title}</div>
                </div>
              </div>
            )}
          </AdminField>
        </div>

        <div className="space-y-4">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Prissättning</label>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => setField('pricing_status', 'fixed')}
              className={cn(
                "rounded-lg border p-4 text-left transition-colors",
                state.pricing_status === 'fixed' ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
              )}
            >
              <div className="font-bold text-sm">Fast pris</div>
              <div className="text-xs text-muted-foreground">Sätt månadskostnad direkt</div>
            </button>
            <button
              onClick={() => setField('pricing_status', 'unknown')}
              className={cn(
                "rounded-lg border p-4 text-left transition-colors",
                state.pricing_status === 'unknown' ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
              )}
            >
              <div className="font-bold text-sm">Ej satt än</div>
              <div className="text-xs text-muted-foreground">Skapa kunden nu, pris senare</div>
            </button>
          </div>

          {state.pricing_status === 'fixed' && (
            <div className="grid gap-4 sm:grid-cols-2 animate-in fade-in">
              <AdminField label="Månadspris (SEK)">
                <input
                  type="number"
                  value={state.monthly_price}
                  onChange={e => setField('monthly_price', Number(e.target.value))}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </AdminField>
              <AdminField label="Intervall">
                <select
                  value={state.subscription_interval}
                  onChange={e => setField('subscription_interval', e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="month">Månad</option>
                  <option value="quarter">Kvartal</option>
                  <option value="year">År</option>
                </select>
              </AdminField>
            </div>
          )}
        </div>

        <div className="grid gap-6 sm:grid-cols-2 border-t border-border pt-6">
          <AdminField label="Startdatum">
            <input
              type="date"
              value={state.contract_start_date ?? ''}
              onChange={e => setField('contract_start_date', e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </AdminField>
          <AdminField label="Faktureringsdag (1-28)">
            <input
              type="number"
              min={1}
              max={28}
              value={state.billing_day_of_month}
              onChange={e => setField('billing_day_of_month', Number(e.target.value))}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </AdminField>
        </div>

        <div className="rounded-lg border border-status-warning-fg/20 bg-status-warning-bg p-4 shadow-sm">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-status-warning-fg">Förhandsvisning första fakturan</div>
          <div className="text-sm font-medium text-status-warning-fg">{preview.explanation}</div>
          {preview.amountSek !== null && (
            <div className="mt-1 text-lg font-bold text-status-warning-fg">
              Belopp: {preview.amountSek.toLocaleString('sv-SE')} kr
            </div>
          )}
        </div>

        <AdminField label="Ansvarig CM">
          <select
            value={state.account_manager ?? ''}
            onChange={e => setField('account_manager', e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
          >
            <option value="">Ingen CM än</option>
            {team.map(m => <option key={m.id} value={m.email || m.name}>{m.name}</option>)}
          </select>
        </AdminField>

        {createMutation.isError && (
          <div className="rounded-md border border-status-danger-fg/30 bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg">
            {createMutation.error instanceof Error ? createMutation.error.message : 'Kunde inte skapa kund'}
          </div>
        )}
      </div>
    </AdminFormDialog>
  );
}
