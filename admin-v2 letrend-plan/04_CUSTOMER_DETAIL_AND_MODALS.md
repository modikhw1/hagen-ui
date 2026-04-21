# Kapitel 04 — Customer Detail & Modals

**Förutsättning:** Kapitel 01–03 klara.

**Outcome:** `/admin/customers/[id]` är en två-kolumnsvy enligt prototypen
med TikTok-statistik (med smoothad SVG-graf), avtal/prissättning,
kommande faktura med pending line items, fakturahistorik, samt panelmodaler
för rabatt, manuell faktura, byte av CM. Alla mutationer går via
`/api/admin/customers/[id]/*` (bundle 07).

---

## 4.1 Vad som ska bort från originalet

Originalets `AdminCustomerDetail.tsx` (bundle 04) är ~580 rader inline-styled
gradient-ish komponenter. Det innehåller:
- Header-band med stora ikoner och Stripe-IDs
- Stora KPI-kort
- Tre kolumner i bredd
- Inline Stripe-actions (pause/resume/cancel) som popup-menyer
- Egen subscription edit-modal

**Tas bort:** Inline-styles, gradient, 3-kolumns layout, popup-menyer.

**Behålls:** All backend-koppling (PATCH actions, discount, invoice items,
manual invoice). Bara presentationen byts.

**Läggs till från prototypen:**
- TikTok-statistikpanel med 4 stat boxes + 2 SVG-grafer
  (`smoothData(data, 7)` moving average)
- Pending invoice items inline i "Nästkommande faktura"-sektionen
- Sidopanel: Content Manager-kort, Kontaktuppgifter (med inline edit),
  Åtgärder-knappar
- Modal-trio: Discount, ManualInvoice, ChangeCM (alla shadcn `<Dialog>`)

---

## 4.2 Datakontrakt

### Hämtning

```ts
// src/hooks/admin/useCustomerDetail.ts
'use client';
import { useQuery } from '@tanstack/react-query';

export type CustomerDetail = {
  id: string;
  business_name: string;
  contact_email: string;
  customer_contact_name: string | null;
  phone: string | null;
  account_manager: string | null;
  account_manager_profile_id: string | null;
  monthly_price: number | null;
  subscription_interval: 'month' | 'quarter' | 'year';
  pricing_status: 'fixed' | 'unknown';
  status: string;
  created_at: string;
  next_invoice_date: string | null;
  contract_start_date: string | null;
  billing_day_of_month: number | null;
  upcoming_price_change: { effective_date: string; price: number } | null;
  discount_type: 'none' | 'percent' | 'amount' | 'free_period' | null;
  discount_value: number | null;
  discount_duration_months: number | null;
  discount_ends_at: string | null;
  tiktok_handle: string | null;
  upload_schedule: string[] | null;
  last_upload_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

export function useCustomerDetail(id: string) {
  return useQuery({
    queryKey: ['admin', 'customer', id],
    queryFn: async (): Promise<CustomerDetail> => {
      const res = await fetch(`/api/admin/customers/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Kunde inte ladda kunden');
      return (await res.json()).customer;
    },
  });
}

export function useCustomerInvoices(id: string) {
  return useQuery({
    queryKey: ['admin', 'customer', id, 'invoices'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/invoices?customer_profile_id=${id}&limit=50`, { credentials: 'include' });
      if (!res.ok) throw new Error('Kunde inte ladda fakturor');
      return ((await res.json()).invoices ?? []) as Array<{
        id: string; amount_due: number; status: string; created_at: string;
        line_items?: Array<{ description: string; amount: number }>;
        hosted_invoice_url?: string | null;
      }>;
    },
  });
}

export function useTikTokStats(id: string) {
  return useQuery({
    queryKey: ['admin', 'customer', id, 'tiktok'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/customers/${id}/tiktok-stats`, { credentials: 'include' });
      if (!res.ok) return null;
      return (await res.json()) as {
        followers: number;
        follower_delta_7d: number;
        follower_delta_30d: number;
        avg_views_7d: number;
        avg_views_30d: number;
        engagement_rate: number;
        total_videos: number;
        videos_last_7d: number;
        follower_history_30d: number[];
        views_history_30d: number[];
      } | null;
    },
  });
}
```

> `tiktok-stats`-routen skapas i kapitel 06 som en aggregering över
> `tiktok_stats` daily snapshots-tabellen. Tills dess: stub returnerar
> `null` så TikTok-sektionen göms.

### Mutationer

| Action | Endpoint | Body | Notes |
|--------|----------|------|-------|
| Uppdatera kontakt/kontrakt | `PATCH /api/admin/customers/[id]` | `{ business_name?, monthly_price?, subscription_interval?, ... }` | Existerar i bundle 07 |
| Pausa subscription | `PATCH /api/admin/customers/[id]` | `{ action: 'pause_subscription' }` | Existerar |
| Resume | `PATCH /api/admin/customers/[id]` | `{ action: 'resume_subscription' }` | |
| Cancel | `PATCH /api/admin/customers/[id]` | `{ action: 'cancel_subscription', at_period_end?: boolean }` | |
| Arkivera | `DELETE /api/admin/customers/[id]` | — | Sätter `status='archived'`, ev. cancel sub |
| Lägg till rabatt | `POST /api/admin/customers/[id]/discount` | `{ type, value, duration_months \| null, ongoing }` | Bundle 07 |
| Ta bort rabatt | `DELETE /api/admin/customers/[id]/discount` | — | |
| Lista pending items | `GET /api/admin/customers/[id]/invoice-items` | — | |
| Skapa pending item | `POST /api/admin/customers/[id]/invoice-items` | `{ description, amount, currency }` | `amount` i SEK |
| Ta bort pending item | `DELETE /api/admin/customers/[id]/invoice-items/[itemId]` | — | |
| Skapa manuell faktura | `POST /api/admin/invoices/create` | `{ customer_profile_id, items, days_until_due, auto_finalize }` | Bundle 08 |

---

## 4.3 SVG-graf med moving average

Detta är en signaturkomponent från prototypen. Lägg i
`src/components/admin/customers/ChartSVG.tsx`:

```tsx
'use client';

export function smoothData(data: number[], windowSize: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(data.length, i + Math.ceil(windowSize / 2));
    const slice = data.slice(start, end);
    result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return result;
}

export function ChartSVG({ data, smoothed, height = 80, color = 'hsl(var(--primary))', smoothColor = 'hsl(var(--muted-foreground))' }: {
  data: number[];
  smoothed?: number[];
  height?: number;
  color?: string;
  smoothColor?: string;
}) {
  const w = 400;
  const h = height;
  const all = [...data, ...(smoothed || [])];
  const max = Math.max(...all, 1);
  const min = Math.min(...all);
  const range = max - min || 1;
  const pad = 4;

  const toPoints = (arr: number[]) =>
    arr.map((v, i) => {
      const x = (i / (arr.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - pad * 2) - pad;
      return `${x},${y}`;
    }).join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
      {smoothed && (
        <polyline points={toPoints(smoothed)} fill="none" stroke={smoothColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 3" opacity={0.5} />
      )}
      <polyline points={toPoints(data)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
```

**Logik bakom smoothing:**
`smoothData([...], 7)` skapar en symmetrisk centrerad rörlig medelvärdesserie
med fönsterbredd 7. För varje punkt `i` summeras värden i intervallet
`[i-3, i+4)` och delas med antalet ingående element. Detta gör att toppar
och dalar i den faktiska serien dämpas och trendlinjen blir tydlig.
Den streckade smoothed-linjen renderas under den heldragna faktiska linjen,
båda i samma SVG-viewport för perfekt alignment.

> Använd alltid samma `min`/`max` för båda serierna (inte separat per serie),
> annars skär smoothed och raw varandra felaktigt. Detta är vad
> `const max = Math.max(...all, 1)` säkerställer.

---

## 4.4 Sidkomponenten

Skapa `src/app/admin/customers/[id]/page.tsx`:

```tsx
'use client';

import { useParams } from 'next/navigation';
import CustomerDetailView from '@/components/admin/customers/CustomerDetailView';

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <CustomerDetailView id={id} />;
}
```

Skapa `src/components/admin/customers/CustomerDetailView.tsx` (förkortad —
fyll på från prototypens `src/pages/admin/CustomerDetail.tsx`, ~990 rader,
men byt mock-data mot riktiga hooks och inline-styles mot Tailwind):

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Pencil, X, Plus } from 'lucide-react';
import { useCustomerDetail, useCustomerInvoices, useTikTokStats } from '@/hooks/admin/useCustomerDetail';
import { useTeamMembers } from '@/hooks/admin/useCustomers';
import { customerStatusConfig, intervalLong } from '@/lib/admin/labels';
import { shortDateSv } from '@/lib/admin/time';
import { ChartSVG, smoothData } from './ChartSVG';
import DiscountModal from './modals/DiscountModal';
import ManualInvoiceModal from './modals/ManualInvoiceModal';
import ChangeCMModal from './modals/ChangeCMModal';
import PendingInvoiceItems from './PendingInvoiceItems';
import ContractEditForm from './ContractEditForm';
import ContactEditForm from './ContactEditForm';

export default function CustomerDetailView({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: customer, isLoading, error } = useCustomerDetail(id);
  const { data: invoices = [] } = useCustomerInvoices(id);
  const { data: tiktok } = useTikTokStats(id);
  const { data: team = [] } = useTeamMembers();

  const [editContact, setEditContact] = useState(false);
  const [editPricing, setEditPricing] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [showManualInvoice, setShowManualInvoice] = useState(false);
  const [showChangeCM, setShowChangeCM] = useState(false);

  const followerSmoothed = useMemo(() => tiktok ? smoothData(tiktok.follower_history_30d, 7) : [], [tiktok]);
  const viewsSmoothed = useMemo(() => tiktok ? smoothData(tiktok.views_history_30d, 7) : [], [tiktok]);

  const cm = customer?.account_manager
    ? team.find(t => t.email === customer.account_manager || t.name === customer.account_manager)
    : undefined;

  if (isLoading) return <div className="text-sm text-muted-foreground">Laddar kund…</div>;
  if (error || !customer) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        Kunden hittades inte.
      </div>
    );
  }

  const status = customerStatusConfig(customer.status);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'customer', id] });
    qc.invalidateQueries({ queryKey: ['admin', 'customers'] });
  };

  return (
    <div>
      <button onClick={() => router.push('/admin/customers')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Tillbaka till kunder
      </button>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">{customer.business_name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {customer.contact_email}
            {customer.customer_contact_name && ` · ${customer.customer_contact_name}`}
            {customer.tiktok_handle && <span className="ml-2 text-primary">{customer.tiktok_handle}</span>}
          </p>
        </div>
        <span className={`inline-flex px-3 py-1.5 rounded-full text-xs font-semibold ${status.className}`}>
          {status.label}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {tiktok && (
            <Section title="TikTok-statistik">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
                <StatBox label="Följare" value={tiktok.followers.toLocaleString()} delta={tiktok.follower_delta_7d} sub="7d" />
                <StatBox label="Snitt visningar" value={tiktok.avg_views_7d.toLocaleString()} sub="7d" />
                <StatBox label="Engagement" value={`${tiktok.engagement_rate}%`} />
                <StatBox label="Publicerade" value={String(tiktok.videos_last_7d)} sub="senaste 7d" />
              </div>

              <ChartBlock title="Följare (30d)" data={tiktok.follower_history_30d} smoothed={followerSmoothed} />
              <ChartBlock title="Visningar (30d)" data={tiktok.views_history_30d} smoothed={viewsSmoothed} color="hsl(var(--info))" height={60} />
            </Section>
          )}

          <Section
            title="Avtal & Prissättning"
            action={
              <button onClick={() => setEditPricing(v => !v)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                {editPricing ? <X className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                {editPricing ? 'Avbryt' : 'Redigera'}
              </button>
            }
          >
            {editPricing
              ? <ContractEditForm customer={customer} onSaved={() => { setEditPricing(false); invalidate(); }} />
              : <ContractView customer={customer} />}
          </Section>

          {customer.next_invoice_date && (customer.monthly_price ?? 0) > 0 && (
            <Section
              title="Nästkommande faktura"
              action={<span className="text-xs text-muted-foreground">{shortDateSv(customer.next_invoice_date)}</span>}
            >
              <NextInvoicePreview customerId={id} basePriceSek={customer.monthly_price ?? 0} />
            </Section>
          )}

          <Section title="Fakturahistorik">
            {invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">Inga fakturor ännu.</p>
            ) : (
              <div className="space-y-3">
                {invoices.map(inv => (
                  <InvoiceRow key={inv.id} inv={inv} />
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Section title="Content Manager">
            {cm ? (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-primary-foreground"
                  style={{ backgroundColor: cm.color || '#6B4423' }}>
                  {cm.name.charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">{cm.name}</div>
                  <div className="text-xs text-muted-foreground">{cm.email}</div>
                </div>
              </div>
            ) : <p className="text-sm text-muted-foreground">Ingen CM tilldelad</p>}
          </Section>

          <Section title="Kontaktuppgifter" action={
            <button onClick={() => setEditContact(v => !v)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              {editContact ? <X className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
              {editContact ? 'Avbryt' : 'Redigera'}
            </button>
          }>
            {editContact
              ? <ContactEditForm customer={customer} onSaved={() => { setEditContact(false); invalidate(); }} />
              : <div className="space-y-2">
                  <Field label="E-post" value={customer.contact_email} />
                  <Field label="Kontaktperson" value={customer.customer_contact_name || '—'} />
                  <Field label="Telefon" value={customer.phone || '—'} />
                </div>}
          </Section>

          <Section title="Åtgärder">
            <div className="space-y-2">
              <ActionButton onClick={() => setShowChangeCM(true)}>Ändra Content Manager</ActionButton>
              <ActionButton onClick={() => setShowDiscount(true)}>Lägg till rabatt</ActionButton>
              <ActionButton onClick={() => setShowManualInvoice(true)}>Skapa manuell faktura</ActionButton>
              <SubscriptionActions customerId={id} customer={customer} onChanged={invalidate} />
            </div>
          </Section>
        </div>
      </div>

      <DiscountModal open={showDiscount} customerId={id} customerName={customer.business_name}
        onClose={() => setShowDiscount(false)} onApplied={() => { setShowDiscount(false); invalidate(); }} />
      <ManualInvoiceModal open={showManualInvoice} customerId={id} customerName={customer.business_name}
        onClose={() => setShowManualInvoice(false)} onCreated={() => { setShowManualInvoice(false); invalidate(); }} />
      <ChangeCMModal open={showChangeCM} customerId={id} currentCM={customer.account_manager} team={team}
        onClose={() => setShowChangeCM(false)} onChanged={() => { setShowChangeCM(false); invalidate(); }} />
    </div>
  );
}

// Helper subcomponents (Section, StatBox, ChartBlock, Field, InvoiceRow, ActionButton,
// SubscriptionActions, ContractView, NextInvoicePreview) — se prototypens
// CustomerDetail.tsx för exakta render-mönster, byt bara mock mot riktiga props.
```

> **Splittra ut** alla undersub-komponenter (`StatBox`, `Field`, `Section`,
> `InvoiceRow`, etc.) i samma fil eller separata `_components.tsx` så
> filen inte växer över ~400 rader. Behåll prototypens render-pattern
> exakt: gradient/färger via Tailwind-tokens, datum via `shortDateSv`,
> belopp via `formatSek`.

---

## 4.5 Modaler — alla via shadcn `<Dialog>`

### `DiscountModal.tsx`

Originalets fil i bundle 04 har samma logik men inline-styled. Refaktorera:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

type Props = {
  open: boolean; customerId: string; customerName: string;
  onClose: () => void; onApplied: (profile: Record<string, unknown>) => void;
};

export default function DiscountModal({ open, customerId, customerName, onClose, onApplied }: Props) {
  const [type, setType] = useState<'percent' | 'amount' | 'free_period'>('percent');
  const [value, setValue] = useState(0);
  const [durationMonths, setDurationMonths] = useState(3);
  const [ongoing, setOngoing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setType('percent'); setValue(0); setDurationMonths(3); setOngoing(false); setError(null);
  }, [open]);

  const submit = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/admin/customers/${customerId}/discount`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          type,
          value: type === 'free_period' ? 100 : value,
          duration_months: ongoing ? null : durationMonths,
          ongoing,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Kunde inte lägga till rabatt');
      onApplied(payload.profile);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Kunde inte lägga till rabatt');
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lägg till rabatt</DialogTitle>
          <DialogDescription>För {customerName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 block">Typ</label>
            <select value={type} onChange={e => setType(e.target.value as typeof type)}
              className="w-full px-3 py-2.5 rounded-md border border-border bg-background text-sm">
              <option value="percent">Procent</option>
              <option value="amount">Fast belopp</option>
              <option value="free_period">Gratis period</option>
            </select>
          </div>

          {type !== 'free_period' && (
            <div>
              <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 block">
                Värde {type === 'percent' ? '(%)' : '(kr)'}
              </label>
              <input type="number" min={0} value={value}
                onChange={e => setValue(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-3 py-2.5 rounded-md border border-border bg-background text-sm" />
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={ongoing} onChange={e => setOngoing(e.target.checked)} />
            Rabatt tills vidare
          </label>

          {!ongoing && (
            <div>
              <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 block">Varaktighet (månader)</label>
              <input type="number" min={1} max={36} value={durationMonths}
                onChange={e => setDurationMonths(Math.max(1, Math.min(36, Number(e.target.value) || 1)))}
                className="w-full px-3 py-2.5 rounded-md border border-border bg-background text-sm" />
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-2">
          <button onClick={onClose} disabled={loading}
            className="px-4 py-2 rounded-md border border-border text-sm">Avbryt</button>
          <button onClick={submit} disabled={loading}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
            {loading ? 'Sparar…' : 'Spara rabatt'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### `ManualInvoiceModal.tsx`

Mappa direkt från bundle 04:s `CreateManualInvoiceModal.tsx`. Samma fält
(`items[]`, `daysUntilDue`, `autoFinalize`), samma POST mot
`/api/admin/invoices/create`. Wrappa i shadcn `<Dialog>`.

### `ChangeCMModal.tsx`

Ny — finns inte i originalet som modal (där sköts via PATCH-action).
Visa lista av aktiva CM:er, radio-val, "Spara" → `PATCH /api/admin/customers/[id]`
med `{ account_manager: <new email/name>, account_manager_profile_id: <id> }`.

### `PendingInvoiceItems.tsx`

Inline-sektion som listar items från `GET /api/admin/customers/[id]/invoice-items`,
låter admin lägga till/ta bort. Mappa från bundle 04:s
`PendingInvoiceItemsSection.tsx`. Belopp lagras i Stripe som öre — UI visar SEK.

### `ContractEditForm.tsx` & `ContactEditForm.tsx`

Inline-formulär (inte modaler) som visas inuti respektive Section när
"Redigera" klickas. PATCH:ar `/api/admin/customers/[id]`. Validera via
samma Zod-schema som `customerInsertSchema.partial()`.

---

## 4.6 SubscriptionActions

Liten knappgrupp i höger sidopanel. Visa olika knappar baserat på status:

```tsx
function SubscriptionActions({ customerId, customer, onChanged }: { ... }) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: string) => {
    setPending(action); setError(null);
    try {
      const res = await fetch(`/api/admin/customers/${customerId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Misslyckades');
      onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : 'Misslyckades'); }
    finally { setPending(null); }
  };

  return (
    <>
      {customer.status === 'active' && (
        <ActionButton onClick={() => run('pause_subscription')} disabled={pending !== null}>
          {pending === 'pause_subscription' ? 'Pausar…' : 'Pausa abonnemang'}
        </ActionButton>
      )}
      {/* resume/cancel/archive analogt */}
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive mt-2">
          {error}
        </div>
      )}
    </>
  );
}
```

---

## 4.7 Acceptanskriterier för kapitel 04

- [ ] `/admin/customers/[id]` laddar via React Query och visar loading/empty/error inline.
- [ ] TikTok-sektion göms helt om `useTikTokStats` returnerar `null`.
- [ ] `ChartSVG` + `smoothData(_, 7)` renderar med solid + dashed linje.
- [ ] "Avtal & Prissättning" toggle:ar mellan view & edit utan side-effects.
- [ ] "Nästkommande faktura" listar pending items från riktig endpoint.
- [ ] Rabattmodal POST:ar och stänger; React Query invaliderar och UI uppdateras.
- [ ] Manuell faktura skapas och visas direkt i fakturahistoriken efter refetch.
- [ ] Byte av CM uppdaterar header och sidopanel.
- [ ] Subscription-actions (pause/resume/cancel) fungerar och visar inline-fel om Stripe svarar med fel.
- [ ] Inga `LeTrendColors`-imports kvar i hela `customers/[id]/`.
- [ ] Alla modaler stängs på ESC och overlay-click (shadcn default).

→ Fortsätt till `05_BILLING_AND_TEAM_PAGES.md`.
