'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  FileText,
  Send,
  Building2,
  AtSign,
  Music2,
  Wallet,
  CalendarDays,
  UserRound,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { inviteCustomer } from '@/app/admin/_actions/billing';
import { AdminFormDialog } from '@/components/admin/ui/feedback/AdminFormDialog';
import { AdminField } from '@/components/admin/ui/form/AdminField';
// (Section/PricingPicker primitives ersatta av lokala SectionHeader för tightare layout)
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
  // Blockera fast pris med 0 kr — annars skapas ingen Stripe-prenumeration tyst
  // och admin tror att allt är klart.
  const invalidFixedPrice =
    state.pricing_status === 'fixed' && (!state.monthly_price || state.monthly_price <= 0);
  const canSubmit =
    validation.success
    && (!state.tiktok_profile_url?.trim() || Boolean(tiktokPreview))
    && !invalidFixedPrice;

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
      const recipient = state.contact_email;
      const warnings: string[] = Array.isArray(payload?.warnings) ? payload.warnings : [];

      if (state.send_invite_now) {
        if (payload?.inviteSent) {
          toast.success(`Inbjudan skickad till ${recipient}`);
        } else {
          // Profil skapades men mejlet misslyckades — varna tydligt
          toast.warning(`Kund skapad, men inbjudan kunde inte skickas till ${recipient}`, {
            description: warnings.join(' · ') || 'Försök "Skicka inbjudan igen" från kundprofilen.',
            duration: 8000,
          });
        }
      } else {
        toast.success('Utkast skapat — ingen e-post skickades');
      }

      // Visa eventuella övriga varningar separat
      warnings
        .filter((w) => !w.toLowerCase().includes('inbjudan kunde inte skickas'))
        .forEach((w) => toast.warning(w, { duration: 6000 }));

      onCreated(payload.customerId, payload);
      onClose();
      setState(initial());
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : 'Kunde inte skapa kund';
      toast.error(msg, { duration: 6000 });
    },
  });

  const handleSubmit = () => {
    // Hard guard mot dubbelklick — useMutation gör detta också men vi vill
    // vara extra säkra eftersom Stripe + invite-mejl är icke-idempotenta sidoeffekter.
    if (createMutation.isPending || !canSubmit) return;
    createMutation.mutate();
  };

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
          <button
            onClick={onClose}
            disabled={createMutation.isPending}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Avbryt
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || createMutation.isPending}
            aria-busy={createMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {state.send_invite_now ? 'Skickar inbjudan…' : 'Skapar utkast…'}
              </>
            ) : (
              <>
                {state.send_invite_now ? <Send className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                {state.send_invite_now ? 'Skapa & skicka inbjudan' : 'Skapa utkast'}
              </>
            )}
          </button>
        </>
      }
    >
      <div className="space-y-7">
        {/* ── 1. LIFECYCLE ──────────────────────────────────────────── */}
        <SectionHeader index={1} title="Hur vill du skapa kunden?" />
        <div className="grid gap-3 sm:grid-cols-2 -mt-3">
          <ChoiceCard
            active={!state.send_invite_now}
            onClick={() => setField('send_invite_now', false)}
            icon={<FileText className="h-4 w-4" />}
            title="Utkast"
            description="Skapa profil utan inbjudan. Bjud in senare när avtalet är klart."
          />
          <ChoiceCard
            active={state.send_invite_now}
            onClick={() => setField('send_invite_now', true)}
            icon={<Send className="h-4 w-4" />}
            title="Skicka inbjudan nu"
            description="Kunden får e-post och kan logga in. Stripe aktiveras vid checkout."
          />
        </div>

        {/* ── 2. KONTAKT ────────────────────────────────────────────── */}
        <SectionHeader index={2} title="Företag & kontakt" icon={<Building2 className="h-3.5 w-3.5" />} />
        <div className="grid gap-5 sm:grid-cols-2 -mt-2">
          <AdminField label="Företagsnamn" required error={validation.success ? undefined : (validation.error.format() as any).business_name?._errors[0]}>
            <input
              value={state.business_name}
              onChange={e => setField('business_name', e.target.value)}
              className={inputCls}
              placeholder="Företaget AB"
            />
          </AdminField>
          <AdminField label="Kontaktperson">
            <input
              value={state.customer_contact_name ?? ''}
              onChange={e => setField('customer_contact_name', e.target.value)}
              className={inputCls}
              placeholder="Maria Holm"
            />
          </AdminField>
          <AdminField label="E-post" required>
            <div className="relative">
              <AtSign className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="email"
                value={state.contact_email}
                onChange={e => setField('contact_email', e.target.value)}
                className={cn(inputCls, 'pl-9')}
                placeholder="maria@foretaget.se"
              />
            </div>
          </AdminField>
          <AdminField label="Telefon">
            <input
              value={state.phone ?? ''}
              onChange={e => setField('phone', e.target.value)}
              className={inputCls}
              placeholder="+46 70 123 45 67"
            />
          </AdminField>
        </div>

        {/* ── 3. TIKTOK ─────────────────────────────────────────────── */}
        <SectionHeader index={3} title="TikTok-profil" icon={<Music2 className="h-3.5 w-3.5" />} optional />
        <div className="-mt-2">
          <div className="flex gap-2">
            <input
              value={state.tiktok_profile_url ?? ''}
              onChange={e => {
                setField('tiktok_profile_url', e.target.value);
                setTiktokPreview(null);
              }}
              className={cn(inputCls, 'flex-1')}
              placeholder="https://tiktok.com/@handle"
            />
            <button
              type="button"
              onClick={() => verifyTikTok.mutate(state.tiktok_profile_url!)}
              disabled={verifyTikTok.isPending || !state.tiktok_profile_url?.trim()}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-semibold hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {verifyTikTok.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              Verifiera
            </button>
          </div>
          {tiktokPreview && (
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-status-success-fg/30 bg-status-success-bg/20 p-3 animate-in fade-in slide-in-from-top-1">
              <div className="h-9 w-9 shrink-0 rounded-full bg-secondary overflow-hidden">
                {tiktokPreview.cover_image_url && (
                  <img src={tiktokPreview.cover_image_url} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1 text-xs">
                <div className="font-bold text-foreground truncate">@{tiktokPreview.handle}</div>
                <div className="text-muted-foreground truncate">{tiktokPreview.title}</div>
              </div>
              <CheckCircle2 className="h-4 w-4 shrink-0 text-status-success-fg" />
            </div>
          )}
        </div>

        {/* ── 4. PRIS ───────────────────────────────────────────────── */}
        <SectionHeader index={4} title="Prissättning" icon={<Wallet className="h-3.5 w-3.5" />} />
        <div className="-mt-2 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <ChoiceCard
              active={state.pricing_status === 'fixed'}
              onClick={() => setField('pricing_status', 'fixed')}
              title="Fast pris"
              description="Sätt månadskostnad direkt"
            />
            <ChoiceCard
              active={state.pricing_status === 'unknown'}
              onClick={() => setField('pricing_status', 'unknown')}
              title="Ej satt än"
              description="Skapa kunden nu, pris senare"
            />
          </div>

          {state.pricing_status === 'fixed' && (
            <div className="space-y-3 animate-in fade-in slide-in-from-top-1">
              <div className="grid gap-5 sm:grid-cols-2">
                <AdminField label="Månadspris (SEK)" required>
                  <input
                    type="number"
                    min={1}
                    value={state.monthly_price}
                    onChange={e => setField('monthly_price', Number(e.target.value))}
                    className={cn(
                      inputCls,
                      invalidFixedPrice && 'border-status-danger-fg/60 focus:border-status-danger-fg focus:ring-status-danger-fg'
                    )}
                  />
                </AdminField>
                <AdminField label="Intervall">
                  <select
                    value={state.subscription_interval}
                    onChange={e => setField('subscription_interval', e.target.value)}
                    className={inputCls}
                  >
                    <option value="month">Månad</option>
                    <option value="quarter">Kvartal</option>
                    <option value="year">År</option>
                  </select>
                </AdminField>
              </div>
              {invalidFixedPrice && (
                <div className="rounded-md border border-status-danger-fg/30 bg-status-danger-bg/40 px-3 py-2 text-xs text-status-danger-fg">
                  Med fast pris måste månadspriset vara större än 0 kr — annars skapas ingen Stripe-prenumeration.
                  Välj <span className="font-bold">Ej satt än</span> om priset ska bestämmas senare.
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── 5. FAKTURERING ────────────────────────────────────────── */}
        <SectionHeader index={5} title="Fakturering" icon={<CalendarDays className="h-3.5 w-3.5" />} />
        <div className="-mt-2 grid gap-5 sm:grid-cols-2">
          <AdminField label="Startdatum">
            <input
              type="date"
              value={state.contract_start_date ?? ''}
              onChange={e => setField('contract_start_date', e.target.value)}
              className={inputCls}
            />
          </AdminField>
          <AdminField label="Faktureringsdag (1–28)">
            <input
              type="number"
              min={1}
              max={28}
              value={state.billing_day_of_month}
              onChange={e => setField('billing_day_of_month', Number(e.target.value))}
              className={inputCls}
            />
          </AdminField>
        </div>

        {state.pricing_status === 'fixed' && (
          <div className="rounded-lg border border-status-warning-fg/20 bg-status-warning-bg/60 p-4">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-status-warning-fg">
              Förhandsvisning · första fakturan
            </div>
            <div className="text-sm text-status-warning-fg">{preview.explanation}</div>
            {preview.amountSek !== null && (
              <div className="mt-1.5 text-lg font-bold text-status-warning-fg tabular-nums">
                {preview.amountSek.toLocaleString('sv-SE')} kr
              </div>
            )}
          </div>
        )}

        {/* ── 6. ANSVARIG ───────────────────────────────────────────── */}
        <SectionHeader index={6} title="Ansvarig CM" icon={<UserRound className="h-3.5 w-3.5" />} />
        <div className="-mt-2">
          <select
            value={state.account_manager ?? ''}
            onChange={e => setField('account_manager', e.target.value)}
            className={inputCls}
          >
            <option value="">Ingen CM än</option>
            {team.map(m => <option key={m.id} value={m.email || m.name}>{m.name}</option>)}
          </select>
        </div>

        {createMutation.isError && (
          <div className="rounded-md border border-status-danger-fg/30 bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg">
            {createMutation.error instanceof Error ? createMutation.error.message : 'Kunde inte skapa kund'}
          </div>
        )}
      </div>
    </AdminFormDialog>
  );
}

// ─── Lokala UI-helpers ────────────────────────────────────────────────
const inputCls =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';

function SectionHeader({
  index,
  title,
  icon,
  optional,
}: {
  index: number;
  title: string;
  icon?: React.ReactNode;
  optional?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border/60 pb-2">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
        {index}
      </span>
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <span className="text-xs font-bold uppercase tracking-wider text-foreground">{title}</span>
      {optional && (
        <span className="ml-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          · Valfritt
        </span>
      )}
    </div>
  );
}

function ChoiceCard({
  active,
  onClick,
  icon,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'group relative rounded-lg border p-4 text-left transition-all',
        active
          ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
          : 'border-border hover:bg-accent hover:border-border/80'
      )}
    >
      <div className="flex items-center gap-2 text-sm font-bold text-foreground">
        {icon}
        {title}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{description}</div>
      {active && (
        <CheckCircle2 className="absolute right-3 top-3 h-4 w-4 text-primary" />
      )}
    </button>
  );
}
