# Kapitel 05 — Billing Hub & Team-sidan

**Förutsättning:** Kapitel 01–04 klara.

**Outcome:**
- `/admin/billing` är **en sida med tre tabs** (Fakturor, Abonnemang, Sync & Health) — ersätter originalets tre separata routes (`/admin/invoices`, `/admin/subscriptions`, `/admin/billing-health`).
- Stripe environment-toggle i headern (Alla/Test/Live) — segmented control.
- Manuell sync-knapp per tab (resync invoices, resync subscriptions).
- `/admin/team` visar CM-puls, kundlista per CM och en "Redigera CM"-modal med omfördelning.

---

## 5.1 `/admin/billing` — sammanslagen vy

### Konsolidering

Originalet har:
- `app/admin/billing/page.tsx` (Billing hub som redan har tabs men styled med inline gradients)
- `app/admin/invoices/page.tsx`
- `app/admin/subscriptions/page.tsx`
- `app/admin/billing-health/page.tsx`

**Plan:** behåll alla fyra routes som funktionella adresser (för deeplinks),
men låt alla rendera samma `<BillingHub initialTab={...}>`-komponent.

```tsx
// app/admin/billing/page.tsx
import BillingHub from '@/components/admin/billing/BillingHub';
export default function BillingPage() { return <BillingHub initialTab="invoices" />; }

// app/admin/invoices/page.tsx
import BillingHub from '@/components/admin/billing/BillingHub';
export default function InvoicesPage() { return <BillingHub initialTab="invoices" />; }

// app/admin/subscriptions/page.tsx → initialTab="subscriptions"
// app/admin/billing-health/page.tsx → initialTab="health"
```

> Detta gör att deep-links från externa system fortsätter fungera, men
> upplevelsen är en sammanhållen vy. Du kan senare ta bort de tre extra
> routes om du vill.

### `BillingHub.tsx`

```tsx
'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import InvoicesTab from './tabs/InvoicesTab';
import SubscriptionsTab from './tabs/SubscriptionsTab';
import HealthTab from './tabs/HealthTab';

type BillingTab = 'invoices' | 'subscriptions' | 'health';
type EnvFilter = 'all' | 'test' | 'live';

export default function BillingHub({ initialTab = 'invoices' }: { initialTab?: BillingTab }) {
  const [tab, setTab] = useState<BillingTab>(initialTab);
  const [env, setEnv] = useState<EnvFilter>('all');

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Billing</h1>
          <p className="text-sm text-muted-foreground mt-1">Fakturor, abonnemang och synkstatus</p>
        </div>
        <div className="flex gap-1 p-1 bg-secondary rounded-md border border-border">
          {(['all', 'test', 'live'] as const).map(e => (
            <button key={e} onClick={() => setEnv(e)}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                env === e ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}>
              {e === 'all' ? 'Alla miljöer' : e.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <Tabs value={tab} onValueChange={v => setTab(v as BillingTab)}>
        <TabsList className="mb-6 border-b border-border bg-transparent p-0 h-auto">
          {[
            { v: 'invoices', l: 'Fakturor' },
            { v: 'subscriptions', l: 'Abonnemang' },
            { v: 'health', l: 'Sync & Health' },
          ].map(({ v, l }) => (
            <TabsTrigger key={v} value={v}
              className="px-4 py-2.5 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:bg-transparent rounded-none">
              {l}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="invoices"><InvoicesTab env={env} /></TabsContent>
        <TabsContent value="subscriptions"><SubscriptionsTab env={env} /></TabsContent>
        <TabsContent value="health"><HealthTab /></TabsContent>
      </Tabs>
    </div>
  );
}
```

### `InvoicesTab.tsx`

```tsx
'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { invoiceStatusConfig } from '@/lib/admin/labels';
import { shortDateSv } from '@/lib/admin/time';

export default function InvoicesTab({ env }: { env: 'all' | 'test' | 'live' }) {
  const router = useRouter();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'invoices', env],
    queryFn: async () => {
      const url = `/api/admin/invoices?limit=200&page=1${env !== 'all' ? `&environment=${env}` : ''}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Kunde inte ladda fakturor');
      return (await res.json()) as { invoices: Array<{ id: string; customer_name: string; customer_id: string; amount_due: number; status: string; created_at: string; line_items?: Array<{ description: string; amount: number }>; }> };
    },
  });

  const sync = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/studio/stripe/sync-invoices', { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error('Sync misslyckades');
      return res.json();
    },
    onSuccess: () => refetch(),
  });

  const invoices = data?.invoices ?? [];
  const open = invoices.filter(i => i.status === 'open');
  const paid = invoices.filter(i => i.status === 'paid');

  return (
    <div>
      <div className="flex gap-3 mb-5">
        <SummaryCard label="Obetalda" value={`${(open.reduce((s, i) => s + i.amount_due, 0) / 100).toLocaleString('sv-SE')} kr`} className="text-warning" />
        <SummaryCard label="Betalda" value={`${(paid.reduce((s, i) => s + i.amount_due, 0) / 100).toLocaleString('sv-SE')} kr`} className="text-success" />
        <SummaryCard label="Totalt antal" value={String(invoices.length)} />
        <button onClick={() => sync.mutate()} disabled={sync.isPending}
          className="ml-auto self-start px-3 py-2 rounded-md border border-border text-sm flex items-center gap-1.5 hover:bg-accent disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${sync.isPending ? 'animate-spin' : ''}`} />
          {sync.isPending ? 'Synkar…' : 'Synka från Stripe'}
        </button>
      </div>

      {sync.isError && (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Sync misslyckades. Försök igen om en stund.
        </div>
      )}

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_120px] gap-4 px-5 py-3 bg-secondary/50 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          <div>Kund</div><div>Belopp</div><div>Rader</div><div>Skapad</div><div>Status</div>
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Laddar…</div>
        ) : invoices.map((inv, i) => {
          const sc = invoiceStatusConfig(inv.status);
          return (
            <div key={inv.id} onClick={() => router.push(`/admin/customers/${inv.customer_id}`)}
              className={`grid grid-cols-[2fr_1fr_1fr_1fr_120px] gap-4 px-5 py-3.5 items-center cursor-pointer hover:bg-accent/30 ${
                i < invoices.length - 1 ? 'border-b border-border' : ''
              }`}>
              <div className="text-sm font-medium text-foreground">{inv.customer_name}</div>
              <div className="text-sm font-semibold text-foreground">{(inv.amount_due / 100).toLocaleString('sv-SE')} kr</div>
              <div className="text-xs text-muted-foreground">
                {(inv.line_items?.length ?? 1)} rad{(inv.line_items?.length ?? 1) > 1 ? 'er' : ''}
              </div>
              <div className="text-xs text-muted-foreground">{shortDateSv(inv.created_at)}</div>
              <div><span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-semibold ${sc.className}`}>{sc.label}</span></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex-1 p-4 bg-card rounded-lg border border-border">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`text-xl font-bold mt-1 ${className || 'text-foreground'}`}>{value}</div>
    </div>
  );
}
```

### `SubscriptionsTab.tsx`

Analog till InvoicesTab. Hämta från `/api/admin/subscriptions`,
sync via `/api/studio/stripe/sync-subscriptions`. Radåtgärder
(pause/resume/cancel) går till `/api/admin/customers/[id]` med `action`.
Lägg till en högerklicks- eller dropdown-meny per rad om du vill exponera
dem från listan, men förenklast: rad är klickbar → kunddetaljen.

### `HealthTab.tsx`

Hämta från `/api/admin/billing-health` (bundle 08). Visa:
- Environment-badge (test/live)
- 4 summary cards: speglade fakturor, speglade subs, misslyckade syncar, senaste lyckade sync
- Lista över senaste 20 sync-events från `stripe_sync_log` (separat endpoint behövs — se kapitel 06)
- Lista över senaste failures med error-meddelande

```tsx
const { data: health } = useQuery({
  queryKey: ['admin', 'billing-health'],
  queryFn: async () => (await fetch('/api/admin/billing-health', { credentials: 'include' })).json(),
});
const { data: log } = useQuery({
  queryKey: ['admin', 'sync-log'],
  queryFn: async () => (await fetch('/api/admin/billing-health/log?limit=50', { credentials: 'include' })).json(),
});
```

Visning enligt prototypens `/admin/billing` Health-tab (cards + tabell med
CheckCircle/AlertTriangle/XCircle ikoner). Hela mönstret finns i
prototypen — kopiera det rakt av med Tailwind-tokens.

---

## 5.2 `/admin/team`

Originalets `app/admin/team/page.tsx` (bundle 06) är ~675 rader inline-styled
med flera lokala modaler. Refaktorera enligt prototypen:

### Sidstruktur

```
[h1: Team]                           [+ Lägg till]
Content Managers

┌─ CM-kort ───────────────────────────────────────┐
│ ●Alma Lindqvist      Stockholm                  │
│   Kunder: 3   MRR: 10 500 kr   [Aktivitetsbar]  │
│   ───────────────────────────────────────────   │
│   KUND          MRR        FÖLJARE   FLÖDE      │
│   Café Rosé    3 500 kr    2 340     ●●●        │
│   Bar Centrale 4 200 kr    5 120     ●●○        │
└─────────────────────────────────────────────────┘
```

### Datakontrakt

```ts
// src/hooks/admin/useTeam.ts
export function useTeamFull() {
  return useQuery({
    queryKey: ['admin', 'team-full'],
    queryFn: async () => {
      const [team, customers, activities, tiktokSummary] = await Promise.all([
        supabase.from('team_members').select('*').order('name'),
        supabase.from('customer_profiles').select('id, business_name, account_manager, monthly_price, status, last_upload_at, stripe_subscription_id'),
        supabase.from('cm_activities').select('cm_id, cm_email, type, created_at').order('created_at', { ascending: false }).limit(500),
        fetch('/api/admin/tiktok-summary', { credentials: 'include' }).then(r => r.ok ? r.json() : { byCustomer: {} }),
      ]);
      // ... assemble per CM
    },
  });
}
```

`/api/admin/tiktok-summary` är en ny aggregeringsroute (kapitel 06) som
returnerar `{ byCustomer: { [customerId]: { followers, videos_last_7d, engagement_rate } } }`.

### Sidkomponenten

Mappa rakt från prototypens `src/pages/admin/Team.tsx`. Behåll
`ActivityBar` (hue-rotation), `WorkflowDot` (success-grön / muted), och
`HoverCard` på MRR-värdet (visar "~20% ersättning"-uppskattning).

### `CMEditDialog.tsx`

Refaktorera prototypens lokala modal till shadcn `<Dialog>`:

```tsx
// src/components/admin/team/CMEditDialog.tsx
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Users, Check } from 'lucide-react';

type Props = {
  open: boolean;
  cm: { id: string; name: string; email: string; phone?: string | null; city?: string | null; bio?: string | null; color: string | null; role: string; customers: Array<{ id: string }> };
  allCMs: Array<{ id: string; name: string; is_active: boolean }>;
  onClose: () => void;
  onSaved: () => void;
};

export default function CMEditDialog({ open, cm, allCMs, onClose, onSaved }: Props) {
  const [name, setName] = useState(cm.name);
  const [email, setEmail] = useState(cm.email);
  const [phone, setPhone] = useState(cm.phone || '');
  const [city, setCity] = useState(cm.city || '');
  const [bio, setBio] = useState(cm.bio || '');
  const [reassignTo, setReassignTo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otherCMs = allCMs.filter(c => c.id !== cm.id && c.is_active);

  const handleSave = async () => {
    setSubmitting(true); setError(null);
    try {
      const res = await fetch(`/api/admin/team/${cm.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ name, email, phone, city, bio }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Misslyckades');

      if (reassignTo && cm.customers.length > 0) {
        await Promise.all(cm.customers.map(c =>
          fetch(`/api/admin/customers/${c.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({ account_manager_profile_id: reassignTo }),
          })
        ));
      }
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'Misslyckades'); }
    finally { setSubmitting(false); }
  };

  const handleArchive = async () => {
    if (!confirm(`Arkivera ${cm.name}?`)) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/team/${cm.id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error((await res.json()).error || 'Misslyckades');
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'Misslyckades'); }
    finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Redigera CM</DialogTitle>
          <DialogDescription>Uppdatera profil och hantera kunder</DialogDescription>
        </DialogHeader>

        {/* … field grid (Namn, E-post, Telefon, Ort, Bio) — kopiera från prototypens Team.tsx … */}

        {cm.customers.length > 0 && (
          <div className="border-t border-border pt-3">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2">Omfördela alla kunder</div>
            <div className="flex gap-2">
              <select value={reassignTo} onChange={e => setReassignTo(e.target.value)}
                className="flex-1 px-3 py-2 rounded-md border border-border bg-card text-sm">
                <option value="">Välj CM…</option>
                {otherCMs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button disabled={!reassignTo}
                className="px-3 py-2 rounded-md border border-border text-sm font-medium hover:bg-accent disabled:opacity-40 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> Flytta {cm.customers.length} kunder
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>
        )}

        <div className="flex gap-2 pt-2">
          <button onClick={handleSave} disabled={submitting}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5" /> Spara
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-md border border-border text-sm">Avbryt</button>
          <div className="flex-1" />
          <button onClick={handleArchive} disabled={submitting}
            className="px-4 py-2 rounded-md border border-destructive/30 text-sm text-destructive hover:bg-destructive/5">
            Arkivera CM
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### `AddCMDialog.tsx`

Ny modal för "+ Lägg till"-knappen. Fält: namn, e-post, ev. telefon, ort,
bio, färg-picker (välj bland `team_members.color`-paletten). POST mot
`/api/admin/team` (bundle 09). Routen ska:
1. Skapa rad i `team_members`
2. Skapa Supabase auth-användare via invite (`supabaseAdmin.auth.admin.inviteUserByEmail`)
3. Skapa motsvarande `profiles`-rad med `role='content_manager'`
4. Logga aktivitet

---

## 5.3 Acceptanskriterier för kapitel 05

- [ ] Alla fyra `/admin/billing*`-routes renderar samma `<BillingHub>` med rätt initialTab.
- [ ] Tabs använder shadcn `<Tabs>` (radix), inte handrullad knappgrupp.
- [ ] Environment-toggle (Alla/Test/Live) skickas som queryparam `environment` till backend.
- [ ] Manuell sync visar spinner och inline error vid fel.
- [ ] HealthTab visar sync-log med tidsstämpel + status; failures visas separat.
- [ ] `/admin/team` listar CM:er med ActivityBar, WorkflowDots, MRR-HoverCard.
- [ ] CMEditDialog är shadcn-baserad och PATCH:ar både CM-fält och eventuell omfördelning.
- [ ] AddCMDialog finns och POST:ar till `/api/admin/team`.
- [ ] Backend-endpoints respekterar `environment`-filter (kapitel 06).
- [ ] Inga inline LeTrendColors kvar.

→ Fortsätt till `06_BACKEND_SCHEMA_RLS_STRIPE_TIKTOK.md`.
