# Kapitel 03 — Customers List & Invite Wizard

**Förutsättning:** Kapitel 01 + 02 klara.

**Outcome:**
- `/admin/customers` är en kompakt tabell-vy enligt prototypen
- Söknings- och status-segmenterade filter (Alla/Aktiva/Pipeline/Arkiverade)
- "Bjud in kund"-modal är **förenklad till en enstegs-vy** (prototypens
  design) men behåller originalets 3-stegs-data (företag, pris, fakturering)
  i en logiskt grupperad form
- Alla skrivningar går genom befintlig `/api/admin/customers`-route

---

## 3.1 Vad som ska bort från originalet

Originalets `app/admin/customers/page.tsx` (bundle 03) har:
- Stor gradient-header
- KPI-rad ovanför listan (kunder/aktiva/pipeline/MRR)
- "Snabba filter"-row med många chips
- Ofta 5-6 kolumner inkl. Stripe-IDs och nästa fakturadatum
- 3-stegs invite-wizard med stora "Steg 1 / Steg 2 / Steg 3"-kort

**Tas bort:** Gradient, KPI-overlay (finns i `/admin`), Stripe-ID-kolumn
(visas i kunddetalj), step-cards.

**Behålls funktionellt:** Sökning, statusfilter, kundklick → detail,
inbjudan-flöde med samma fält.

---

## 3.2 Sidans struktur

```
[h1: Kunder]                    [+ Bjud in kund]
n kunder

[🔍 Sök kund...]   [Alla][Aktiva][Pipeline][Arkiverade]

┌────────────────────────────────────────────────────────┐
│ FÖRETAG     │ CM     │ PRIS    │ TILLAGD │ STATUS     │
├────────────────────────────────────────────────────────┤
│ Café Rosé   │ ●Alma  │ 3500 kr │ 15 nov  │ [Aktiv]    │
│ info@...se  │        │         │         │            │
├────────────────────────────────────────────────────────┤
│ ...                                                    │
└────────────────────────────────────────────────────────┘
```

---

## 3.3 Datakontrakt

### Hämtning (klient)

```ts
// src/hooks/admin/useCustomers.ts
'use client';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';

export type CustomerListRow = {
  id: string;
  business_name: string;
  contact_email: string;
  customer_contact_name: string | null;
  phone: string | null;
  account_manager: string | null;
  account_manager_profile_id: string | null;
  monthly_price: number | null;
  pricing_status: 'fixed' | 'unknown' | null;
  status: 'active' | 'agreed' | 'invited' | 'pending' | 'archived' | string;
  created_at: string;
  next_invoice_date: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

export function useCustomers() {
  return useQuery({
    queryKey: ['admin', 'customers'],
    queryFn: async (): Promise<CustomerListRow[]> => {
      const { data, error } = await supabase
        .from('customer_profiles')
        .select('id, business_name, contact_email, customer_contact_name, phone, account_manager, account_manager_profile_id, monthly_price, pricing_status, status, created_at, next_invoice_date, stripe_customer_id, stripe_subscription_id')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CustomerListRow[];
    },
  });
}

export function useTeamMembers() {
  return useQuery({
    queryKey: ['admin', 'team-members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_members')
        .select('id, name, email, color, profile_id, is_active')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}
```

### Invite-mutation

Behåll originalets `POST /api/admin/customers` (bundle 07). Frontend-kontrakt:

```ts
// Request body
{
  business_name: string;          // required
  contact_email: string;          // required, validated email
  customer_contact_name?: string;
  phone?: string;
  account_manager?: string;       // email or name (string), matches team_members
  pricing_status: 'fixed' | 'unknown';
  monthly_price: number;          // SEK, integer
  subscription_interval: 'month' | 'quarter' | 'year';
  contract_start_date: string;    // YYYY-MM-DD
  billing_day_of_month: number;   // 1-28
  waive_days_until_billing: boolean;
  send_invite_now: boolean;       // if true: also calls send_invite action
}

// Response 201
{
  customer: { id, business_name, status: 'pending' | 'invited', ... },
  invite_sent?: boolean,
  warnings?: string[]
}

// Response 4xx
{ error: string, field?: string }
```

> Originalets route returnerar redan ungefär detta. Verifiera mot bundle 07
> `app/api/admin/customers/route.ts` och anpassa response-shapen vid behov.

---

## 3.4 Sidkomponenten

Ersätt `src/app/admin/customers/page.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { useCustomers, useTeamMembers } from '@/hooks/admin/useCustomers';
import { customerStatusConfig } from '@/lib/admin/labels';
import { shortDateSv } from '@/lib/admin/time';
import InviteCustomerModal from '@/components/admin/customers/InviteCustomerModal';

const FILTERS = [
  { key: 'all', label: 'Alla' },
  { key: 'active', label: 'Aktiva' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'archived', label: 'Arkiverade' },
] as const;

export default function CustomersPage() {
  const router = useRouter();
  const { data: customers = [], isLoading, refetch } = useCustomers();
  const { data: team = [] } = useTeamMembers();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<typeof FILTERS[number]['key']>('all');
  const [showInvite, setShowInvite] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter(c => {
      const matchSearch = !q || c.business_name.toLowerCase().includes(q) || c.contact_email.toLowerCase().includes(q);
      const matchStatus =
        filter === 'all' ||
        (filter === 'active' && (c.status === 'active' || c.status === 'agreed')) ||
        (filter === 'pipeline' && (c.status === 'invited' || c.status === 'pending')) ||
        c.status === filter;
      return matchSearch && matchStatus;
    });
  }, [customers, search, filter]);

  const cmByName = useMemo(() => {
    const map = new Map<string, typeof team[number]>();
    team.forEach(t => {
      if (t.name) map.set(t.name.toLowerCase(), t);
      if (t.email) map.set(t.email.toLowerCase(), t);
    });
    return map;
  }, [team]);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Kunder</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isLoading ? 'Laddar…' : `${filtered.length} kund${filtered.length === 1 ? '' : 'er'}`}
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90"
        >
          + Bjud in kund
        </button>
      </div>

      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Sök kund..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-md border border-border bg-card text-sm outline-none focus:border-primary/30"
          />
        </div>
        <div className="flex bg-secondary rounded-md p-1 gap-0.5">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                filter === f.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_120px] gap-4 px-5 py-3 bg-secondary/50 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          <div>Företag</div>
          <div>CM</div>
          <div>Pris</div>
          <div>Tillagd</div>
          <div>Status</div>
        </div>
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {isLoading ? 'Laddar…' : 'Inga kunder hittades.'}
          </div>
        ) : (
          filtered.map((c, i) => {
            const cm = c.account_manager ? cmByName.get(c.account_manager.toLowerCase()) : undefined;
            const sc = customerStatusConfig(c.status);
            return (
              <div
                key={c.id}
                onClick={() => router.push(`/admin/customers/${c.id}`)}
                className={`grid grid-cols-[2fr_1fr_1fr_1fr_120px] gap-4 px-5 py-3.5 items-center cursor-pointer hover:bg-accent/30 transition-colors ${
                  i < filtered.length - 1 ? 'border-b border-border' : ''
                }`}
              >
                <div>
                  <div className="text-sm font-semibold text-foreground">{c.business_name}</div>
                  <div className="text-xs text-muted-foreground">{c.contact_email}</div>
                </div>
                <div className="flex items-center gap-2">
                  {cm ? (
                    <>
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-primary-foreground shrink-0"
                        style={{ backgroundColor: cm.color || '#6B4423' }}
                      >
                        {cm.name.charAt(0)}
                      </div>
                      <span className="text-sm text-foreground">{cm.name.split(' ')[0]}</span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
                <div className="text-sm font-semibold text-foreground">
                  {c.pricing_status === 'unknown'
                    ? 'Ej satt'
                    : (c.monthly_price ?? 0) > 0
                      ? `${(c.monthly_price ?? 0).toLocaleString('sv-SE')} kr`
                      : '—'}
                </div>
                <div className="text-xs text-muted-foreground">{shortDateSv(c.created_at)}</div>
                <div>
                  <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-semibold ${sc.className}`}>
                    {sc.label}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <InviteCustomerModal
        open={showInvite}
        team={team}
        onClose={() => setShowInvite(false)}
        onCreated={async () => { setShowInvite(false); await refetch(); }}
      />
    </div>
  );
}
```

---

## 3.5 Invite Customer Modal

Skapa `src/components/admin/customers/InviteCustomerModal.tsx`. Detta är
**en kondenserad version** av originalets 3-stegs wizard (bundle 03,
`InviteCustomerWizard.tsx`) — samma fält, samma `calculateFirstInvoice`-preview,
men i en enda Dialog.

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Check } from 'lucide-react';
import { calculateFirstInvoice } from '@/lib/billing/first-invoice';

type Team = Array<{ id: string; name: string; email: string | null; color: string | null }>;

const todayYmd = () => new Date().toISOString().split('T')[0];

const initial = () => ({
  business_name: '',
  customer_contact_name: '',
  contact_email: '',
  phone: '',
  account_manager: '',
  pricing_status: 'fixed' as 'fixed' | 'unknown',
  monthly_price: 0,
  subscription_interval: 'month' as 'month' | 'quarter' | 'year',
  contract_start_date: todayYmd(),
  billing_day_of_month: 25,
  waive_days_until_billing: false,
  send_invite_now: true,
});

export default function InviteCustomerModal({ open, team, onClose, onCreated }: {
  open: boolean;
  team: Team;
  onClose: () => void;
  onCreated: (customerId: string) => void;
}) {
  const [v, setV] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setV(initial()); setError(null); } }, [open]);

  const preview = calculateFirstInvoice({
    pricingStatus: v.pricing_status,
    recurringPriceSek: v.monthly_price,
    startDate: v.contract_start_date,
    billingDay: v.billing_day_of_month,
    waiveDaysUntilBilling: v.waive_days_until_billing,
  });

  const canSubmit = v.business_name.trim() && v.contact_email.trim() &&
    (v.pricing_status === 'unknown' || v.monthly_price > 0);

  const handleSubmit = async () => {
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
      if (!res.ok) throw new Error(payload.error || 'Kunde inte skapa kund');
      onCreated(payload.customer.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Kunde inte skapa kund');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bjud in ny kund</DialogTitle>
          <DialogDescription>Skapa kundprofil och skicka inbjudan till kontakten.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Section 1: Företag & kontakt */}
          <Section title="Företag & kontakt">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Företagsnamn *" value={v.business_name} onChange={x => setV(s => ({ ...s, business_name: x }))} placeholder="Café Rosé" />
              <Field label="Kontaktperson" value={v.customer_contact_name} onChange={x => setV(s => ({ ...s, customer_contact_name: x }))} placeholder="Maria Holm" />
              <Field label="E-post *" value={v.contact_email} type="email" onChange={x => setV(s => ({ ...s, contact_email: x }))} placeholder="info@caferose.se" />
              <Field label="Telefon" value={v.phone} type="tel" onChange={x => setV(s => ({ ...s, phone: x }))} placeholder="070-XXX XX XX" />
            </div>
            <div className="mt-3">
              <Label>Tilldela CM</Label>
              <select
                value={v.account_manager}
                onChange={e => setV(s => ({ ...s, account_manager: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-md border border-border bg-background text-sm outline-none focus:border-primary/40"
              >
                <option value="">Ingen CM än</option>
                {team.map(t => (
                  <option key={t.id} value={t.email || t.name}>{t.name}</option>
                ))}
              </select>
            </div>
          </Section>

          {/* Section 2: Pris */}
          <Section title="Prissättning">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <PricingPicker active={v.pricing_status === 'fixed'} onClick={() => setV(s => ({ ...s, pricing_status: 'fixed' }))} title="Fast pris" desc="Sätt återkommande debitering direkt." />
              <PricingPicker active={v.pricing_status === 'unknown'} onClick={() => setV(s => ({ ...s, pricing_status: 'unknown', monthly_price: 0 }))} title="Ej satt än" desc="Skapa kunden nu och sätt pris senare." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Pris (SEK)</Label>
                <input
                  type="number" min={0} value={v.monthly_price} disabled={v.pricing_status === 'unknown'}
                  onChange={e => setV(s => ({ ...s, monthly_price: Math.max(0, Number(e.target.value) || 0) }))}
                  className="w-full px-3 py-2.5 rounded-md border border-border bg-background text-sm disabled:opacity-50"
                />
              </div>
              <div>
                <Label>Intervall</Label>
                <select
                  value={v.subscription_interval}
                  onChange={e => setV(s => ({ ...s, subscription_interval: e.target.value as typeof v.subscription_interval }))}
                  className="w-full px-3 py-2.5 rounded-md border border-border bg-background text-sm"
                >
                  <option value="month">Månad</option>
                  <option value="quarter">Kvartal</option>
                  <option value="year">År</option>
                </select>
              </div>
            </div>
          </Section>

          {/* Section 3: Fakturering & start */}
          <Section title="Fakturering & start">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Startdatum</Label>
                <input type="date" value={v.contract_start_date} onChange={e => setV(s => ({ ...s, contract_start_date: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-md border border-border bg-background text-sm" />
              </div>
              <div>
                <Label>Faktureringsdag (1–28)</Label>
                <input type="number" min={1} max={28} value={v.billing_day_of_month}
                  onChange={e => setV(s => ({ ...s, billing_day_of_month: Math.max(1, Math.min(28, Number(e.target.value) || 25)) }))}
                  className="w-full px-3 py-2.5 rounded-md border border-border bg-background text-sm" />
              </div>
            </div>
            <label className="mt-3 flex items-start gap-2 p-3 rounded-md border border-border bg-warning/5 cursor-pointer">
              <input type="checkbox" checked={v.waive_days_until_billing}
                onChange={e => setV(s => ({ ...s, waive_days_until_billing: e.target.checked }))} className="mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-foreground">Bjud på dagarna fram till nästa faktureringsdag</div>
                <div className="text-xs text-muted-foreground">Ingen första del-debitering före nästa ordinarie faktureringsdag.</div>
              </div>
            </label>

            <div className="mt-3 p-3 rounded-md bg-secondary/50 border border-border">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Förhandsvisning</div>
              <div className="text-sm text-foreground">{preview.explanation}</div>
              <div className="mt-1 text-sm font-semibold text-foreground">
                {preview.amountSek !== null
                  ? `Första faktura: ${preview.amountSek.toLocaleString('sv-SE')} kr`
                  : 'Första faktura beräknas när pris är satt'}
              </div>
              {preview.nextBillingDate && (
                <div className="text-xs text-muted-foreground mt-1">Nästa ordinarie faktureringsdag: {preview.nextBillingDate}</div>
              )}
            </div>
          </Section>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={v.send_invite_now} onChange={e => setV(s => ({ ...s, send_invite_now: e.target.checked }))} />
            Skicka inbjudan via e-post direkt
          </label>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="flex-1 px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Check className="h-4 w-4" /> {submitting ? 'Skapar…' : 'Skicka inbjudan'}
          </button>
          <button onClick={onClose} disabled={submitting}
            className="px-4 py-2.5 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground">
            Avbryt
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2 font-semibold">{title}</div>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">{children}</div>;
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-md border border-border bg-background text-sm outline-none focus:border-primary/40"
      />
    </div>
  );
}

function PricingPicker({ active, onClick, title, desc }: { active: boolean; onClick: () => void; title: string; desc: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-4 rounded-md border transition-colors ${
        active ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-accent/30'
      }`}
    >
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <div className="text-xs text-muted-foreground mt-1">{desc}</div>
    </button>
  );
}
```

---

## 3.6 Backend — `POST /api/admin/customers` förändringar

Originalet (bundle 07 `app/api/admin/customers/route.ts`) tar emot ett
liknande payload men förmodligen utan `send_invite_now`. Justera:

```ts
// app/api/admin/customers/route.ts (utdrag)
import { withAuth } from '@/lib/auth/api-auth';
import { customerInsertSchema } from '@/lib/schemas/customer';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { sendCustomerInvite } from '@/lib/customers/invite';
import { logActivity } from '@/lib/activity/logger';

export const POST = withAuth(['admin'], async (req, { user }) => {
  const body = await req.json();
  const parsed = customerInsertSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message || 'Ogiltig data' }, { status: 400 });
  }

  const { send_invite_now, ...customerData } = parsed.data;

  // 1. Insert customer profile
  const { data: customer, error } = await supabaseAdmin
    .from('customer_profiles')
    .insert({
      ...customerData,
      status: send_invite_now ? 'invited' : 'pending',
    })
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // 2. (optional) send invite via existing helper
  let inviteSent = false;
  const warnings: string[] = [];
  if (send_invite_now) {
    try {
      await sendCustomerInvite({ customerId: customer.id, sendBy: user.id });
      inviteSent = true;
    } catch (e) {
      warnings.push(`Inbjudan kunde inte skickas: ${e instanceof Error ? e.message : 'okänt fel'}`);
    }
  }

  await logActivity({
    cm_email: user.email ?? null,
    type: 'customer_created',
    customer_profile_id: customer.id,
    metadata: { send_invite_now: inviteSent },
  });

  return Response.json({ customer, invite_sent: inviteSent, warnings }, { status: 201 });
});
```

Uppdatera `src/lib/schemas/customer.ts` (Zod) för att inkludera nya fält.
Behåll formen från bundle 03 men addera:

```ts
send_invite_now: z.boolean().default(false),
phone: z.string().nullable().optional(),
```

---

## 3.7 Acceptanskriterier för kapitel 03

- [ ] `useCustomers` och `useTeamMembers` finns och returnerar typade rader.
- [ ] `/admin/customers` renderar tabell enligt prototyp; sökning &
      filter fungerar.
- [ ] CM-avatar visar initial + DB-färg, faller tillbaka till brun-default.
- [ ] Klick på rad navigerar till `/admin/customers/[id]`.
- [ ] "Bjud in kund" öppnar shadcn `<Dialog>` (ej custom overlay).
- [ ] Modal har 3 sektioner (kontakt, pris, fakturering) i en enda vy.
- [ ] `calculateFirstInvoice` används för live-preview.
- [ ] Inline error-Alert visas vid fel, **inga toasts**.
- [ ] Submit kallar `POST /api/admin/customers` med fullständigt payload
      inklusive `send_invite_now`.
- [ ] Vid 201: modal stänger, lista refetchas, ny kund syns överst.
- [ ] Backend-route uppdaterad för `send_invite_now` och `phone`.
- [ ] Zod-schema utökat och validerar payload.

→ Fortsätt till `04_CUSTOMER_DETAIL_AND_MODALS.md`.
