# Kapitel 02 — Overview-sidan (`/admin`)

**Förutsättning:** Kapitel 01 är klart. Tailwind-tokens, AdminLayout och
QueryClientProvider finns på plats.

**Outcome:** `/admin`-sidan ser ut och beter sig som prototypen:
- Minimal H1 + subtitle (ingen gradient-pulse)
- 4 metric-cards (MRR, Aktiva kunder, Demos skickade, Kostnad 30d)
- CM-aktivitetspuls med frequency bars + hover cards + tempo-indikator
- Inline attention-section för obetalda fakturor
- Kostnadsöversikt 30d (kort-grid)

---

## 2.1 Vad som ska bort från originalet

Originalets `app/admin/page.tsx` (bundle 02) renderar idag:
- Stor gradient-hero (Operativ puls + 3 stat-pills)
- 4 stora kort med ikoner och färgkodning (Koncept backlog, Aktiva
  abonnemang, Billing health, Speglade objekt)
- CM-aktivitetstabell med MRR/Backlog/Kunder per CM
- Billing snapshot-panel
- Kundstatus-fördelning
- "Adminverktyg"-länkar

**Behålls (men omkodat):** CM-aktivitet, attention-signaler (öppna fakturor),
metric-cards.

**Tas bort/flyttas:** Gradient-pulse, "Speglade objekt"-kortet (flyttas till
`/admin/billing` Health-tab), "Adminverktyg"-länkar (sidebaren räcker),
"Kundstatus-fördelning" (visas på `/admin/customers` istället).

**Läggs till från prototypen:**
- "Demos skickade" / "Demos konverterade" stat (kräver schema-add — se
  kapitel 06)
- "Kostnad 30d" stat (kräver `service_costs`-tabell — se kapitel 06; tills
  vidare visas placeholder-värden via en stub-fetcher)
- CM hover cards med tempo, kunder-senaste-upload (kräver `cm_activities`
  + `customer_profiles.last_upload_at` — se kapitel 06)

---

## 2.2 Datakontrakt — vad sidan behöver

Sidan ska göra **ett enda** anrop till en aggregerad route eller flera
parallella queries som batchas av React Query. Rekommendation: håll
client-side parallel-fetch, men flytta till React Query.

### Datakällor

| Vad | Källa | Form |
|-----|-------|------|
| Customers | `customer_profiles` (Supabase, RLS-skyddad) | `id, business_name, account_manager, account_manager_profile_id, monthly_price, status, created_at, last_upload_at, upload_schedule` |
| Concepts | `customer_concepts` | `customer_profile_id, status, created_at, created_by` |
| Team | `team_members` (eller `profiles WHERE role='content_manager'`) | `id, name, email, color, profile_id, is_active` |
| Activities | `cm_activities` (senaste 200) | `cm_email, cm_id, type, created_at, customer_profile_id` |
| Open invoices | `GET /api/admin/invoices?status=open&limit=8` | `{ invoices: [...] }` |
| Subscriptions | `GET /api/admin/subscriptions?limit=100` | `{ subscriptions: [...] }` |
| Billing health | `GET /api/admin/billing-health` | `{ environment, stats: {...} }` |
| Service costs (NYTT) | `GET /api/admin/service-costs?days=30` | `{ entries: [{ service, calls_30d, cost_30d, trend }], total: number }` |
| Demos (NYTT) | `GET /api/admin/demos?days=30` | `{ sent: number, converted: number }` |

> Demos- och service-costs-endpoints skapas i kapitel 06. Tills dess: stub
> dem och returnera nollor (UI ska inte krascha).

---

## 2.3 React Query-hook

Skapa `src/hooks/admin/useOverviewData.ts`:

```ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';

export type OverviewPayload = {
  customers: Array<{
    id: string;
    business_name: string;
    account_manager: string | null;
    account_manager_profile_id: string | null;
    monthly_price: number | null;
    status: string | null;
    created_at: string | null;
    last_upload_at: string | null;
    upload_schedule: string[] | null;
  }>;
  concepts: Array<{ customer_profile_id: string | null; status: string | null; created_at: string | null; created_by: string | null }>;
  team: Array<{ id: string; name: string; email: string | null; color: string | null; profile_id: string | null }>;
  activities: Array<{ cm_email: string | null; cm_id: string | null; type: string | null; created_at: string | null; customer_profile_id: string | null }>;
  invoices: Array<{ id: string; customer_name?: string; customer_id?: string; amount_due: number; due_date: string | null; status: string }>;
  subscriptions: Array<{ status: string; amount: number; cancel_at_period_end?: boolean | null; customer_name?: string; current_period_end?: string | null }>;
  billingHealth: { environment: 'test' | 'live'; stats: { failedSyncs: number; mirroredInvoices: number; mirroredSubscriptions: number; latestSuccessfulSyncAt: string | null } } | null;
  serviceCosts: { entries: Array<{ service: string; calls_30d: number; cost_30d: number; trend: number[] }>; total: number };
  demos: { sent: number; converted: number };
};

async function fetchOverview(): Promise<OverviewPayload> {
  const [customers, concepts, team, activities, invoicesRes, subsRes, healthRes, costsRes, demosRes] = await Promise.all([
    supabase.from('customer_profiles').select('id, business_name, account_manager, account_manager_profile_id, monthly_price, status, created_at, last_upload_at, upload_schedule').order('created_at', { ascending: false }),
    supabase.from('customer_concepts').select('customer_profile_id, status, created_at, created_by'),
    supabase.from('team_members').select('id, name, email, color, profile_id').eq('is_active', true).order('name'),
    supabase.from('cm_activities').select('cm_email, cm_id, type, created_at, customer_profile_id').order('created_at', { ascending: false }).limit(200),
    fetch('/api/admin/invoices?status=open&limit=8&page=1', { credentials: 'include' }),
    fetch('/api/admin/subscriptions?limit=100&page=1', { credentials: 'include' }),
    fetch('/api/admin/billing-health', { credentials: 'include' }),
    fetch('/api/admin/service-costs?days=30', { credentials: 'include' }),
    fetch('/api/admin/demos?days=30', { credentials: 'include' }),
  ]);

  const safeJson = async (r: Response, fallback: unknown) => (r.ok ? r.json() : fallback);

  return {
    customers: (customers.data ?? []) as OverviewPayload['customers'],
    concepts: (concepts.data ?? []) as OverviewPayload['concepts'],
    team: (team.data ?? []) as OverviewPayload['team'],
    activities: activities.error ? [] : ((activities.data ?? []) as OverviewPayload['activities']),
    invoices: ((await safeJson(invoicesRes, { invoices: [] })) as { invoices: OverviewPayload['invoices'] }).invoices,
    subscriptions: ((await safeJson(subsRes, { subscriptions: [] })) as { subscriptions: OverviewPayload['subscriptions'] }).subscriptions,
    billingHealth: (await safeJson(healthRes, null)) as OverviewPayload['billingHealth'],
    serviceCosts: (await safeJson(costsRes, { entries: [], total: 0 })) as OverviewPayload['serviceCosts'],
    demos: (await safeJson(demosRes, { sent: 0, converted: 0 })) as OverviewPayload['demos'],
  };
}

export function useOverviewData() {
  return useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: fetchOverview,
    staleTime: 60_000,
  });
}
```

---

## 2.4 Härledd data

Skapa `src/lib/admin/overview-derive.ts`:

```ts
import type { OverviewPayload } from '@/hooks/admin/useOverviewData';

const normalize = (v?: string | null) => (v || '').trim().toLowerCase();
const isActive = (s?: string | null) => s === 'active' || s === 'agreed';
const isPipeline = (s?: string | null) => s === 'pending' || s === 'invited';

export type DerivedOverview = ReturnType<typeof deriveOverview>;

export function deriveOverview(payload: OverviewPayload, now: Date = new Date()) {
  const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  const activeCustomers = payload.customers.filter(c => isActive(c.status));
  const pipelineCustomers = payload.customers.filter(c => isPipeline(c.status));
  const newActive = activeCustomers.filter(c => c.created_at && new Date(c.created_at).getTime() >= cutoff);

  const mrrSek = activeCustomers.reduce((s, c) => s + (c.monthly_price ?? 0), 0);
  const newMrrSek = newActive.reduce((s, c) => s + (c.monthly_price ?? 0), 0);

  // Per-CM aggregation
  const teamRows = payload.team.map(member => {
    const managed = payload.customers.filter(c => {
      if (member.profile_id && normalize(c.account_manager_profile_id) === normalize(member.profile_id)) return true;
      const mgr = normalize(c.account_manager);
      return mgr === normalize(member.email) || mgr === normalize(member.name);
    });
    const memberActivities = payload.activities.filter(a =>
      (a.cm_id && a.cm_id === member.id) ||
      normalize(a.cm_email) === normalize(member.email) ||
      normalize(a.cm_email) === normalize(member.name)
    );
    const recent7d = memberActivities.filter(a => a.created_at && new Date(a.created_at).getTime() >= weekAgo);

    // Tempo: actual vs expected. Expected = sum of upload_schedule.length per managed customer.
    const expectedPerWeek = managed.reduce((sum, c) => sum + (c.upload_schedule?.length ?? 0), 0);
    const actualConcepts = payload.concepts.filter(cc =>
      cc.customer_profile_id && managed.some(m => m.id === cc.customer_profile_id) &&
      cc.created_at && new Date(cc.created_at).getTime() >= weekAgo
    ).length;

    const customersLastUpload = managed.slice(0, 5).map(c => ({
      name: c.business_name,
      date: c.last_upload_at,
    }));

    return {
      id: member.id,
      name: member.name,
      color: member.color || '#6B4423',
      customers: managed,
      mrrSek: managed.filter(c => isActive(c.status)).reduce((s, c) => s + (c.monthly_price ?? 0), 0),
      activityCount: recent7d.length,
      latestActivityAt: memberActivities[0]?.created_at ?? null,
      expectedPerWeek,
      actualConcepts,
      customersLastUpload,
      backlog: payload.concepts.filter(cc =>
        cc.customer_profile_id && managed.some(m => m.id === cc.customer_profile_id) &&
        (cc.status === 'draft' || cc.status === 'active')
      ).length,
    };
  }).sort((a, b) => b.activityCount - a.activityCount);

  const maxActivity = Math.max(1, ...teamRows.map(r => r.activityCount));

  return {
    activeCount: activeCustomers.length,
    pipelineCount: pipelineCustomers.length,
    mrrSek,
    newMrrSek,
    newCustomerCount: newActive.length,
    teamRows,
    maxActivity,
    unpaidInvoices: payload.invoices.filter(i => i.status === 'open'),
  };
}
```

---

## 2.5 Sidkomponent

Ersätt **hela** `src/app/admin/page.tsx` med:

```tsx
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DollarSign, UserCheck, Send, TrendingUp, ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { useOverviewData } from '@/hooks/admin/useOverviewData';
import { deriveOverview } from '@/lib/admin/overview-derive';
import { timeAgoSv, shortDateSv } from '@/lib/admin/time';
import { formatSek } from '@/lib/admin/money';

const CM_PREVIEW_COUNT = 5;

export default function AdminOverviewPage() {
  const router = useRouter();
  const { data, isLoading, error } = useOverviewData();
  const [cmExpanded, setCmExpanded] = useState(false);
  const [sortByActivity, setSortByActivity] = useState(false);

  const derived = useMemo(() => (data ? deriveOverview(data) : null), [data]);

  const sortedCMs = useMemo(() => {
    if (!derived) return [];
    const rows = [...derived.teamRows];
    if (sortByActivity) rows.sort((a, b) => a.activityCount - b.activityCount);
    return rows;
  }, [derived, sortByActivity]);

  if (isLoading) return <div className="text-sm text-muted-foreground">Laddar översikt…</div>;
  if (error || !data || !derived) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        Kunde inte ladda översikten.
      </div>
    );
  }

  const visibleCMs = cmExpanded ? sortedCMs : sortedCMs.slice(0, CM_PREVIEW_COUNT);
  const hasMoreCMs = sortedCMs.length > CM_PREVIEW_COUNT;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold font-heading text-foreground">Översikt</h1>
        <p className="text-sm text-muted-foreground mt-1">Operativt tillstånd</p>
      </div>

      {/* Key metrics */}
      <section className="mb-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            icon={<DollarSign className="h-4 w-4" />}
            label="MRR"
            value={`${derived.mrrSek.toLocaleString('sv-SE')} kr`}
            badge={derived.newCustomerCount > 0 ? `+${derived.newCustomerCount} / +${derived.newMrrSek.toLocaleString('sv-SE')} kr` : undefined}
            badgeLabel="30d"
          />
          <MetricCard
            icon={<UserCheck className="h-4 w-4" />}
            label="Aktiva kunder"
            value={String(derived.activeCount)}
          />
          <MetricCard
            icon={<Send className="h-4 w-4" />}
            label="Demos skickade"
            value={String(data.demos.sent)}
            sub={`${data.demos.converted} konverterade`}
          />
          <MetricCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Kostnad 30d"
            value={`${data.serviceCosts.total.toFixed(0)} kr`}
          />
        </div>
      </section>

      {/* CM Activity Pulse */}
      <section className="mb-8">
        <div className="flex items-baseline gap-3 mb-3">
          <h2 className="text-sm font-semibold text-foreground">CM-aktivitet</h2>
          <span className="text-xs text-muted-foreground">Senaste 7 dagarna</span>
          <div className="flex-1" />
          <button
            onClick={() => setSortByActivity(v => !v)}
            className={`flex items-center gap-1 text-[11px] font-medium transition-colors ${
              sortByActivity ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Filter className="h-3 w-3" />
            {sortByActivity ? "Lägst aktivitet först" : "Sortera"}
          </button>
        </div>
        <div className="space-y-2">
          {visibleCMs.map(cm => (
            <CMRow key={cm.id} cm={cm} maxActivity={derived.maxActivity} />
          ))}
        </div>
        {hasMoreCMs && (
          <button
            onClick={() => setCmExpanded(v => !v)}
            className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {cmExpanded ? <>Visa färre <ChevronUp className="h-3 w-3" /></> : <>Visa alla {sortedCMs.length} CMs <ChevronDown className="h-3 w-3" /></>}
          </button>
        )}
      </section>

      {/* Requires attention */}
      {derived.unpaidInvoices.length > 0 && (
        <section className="mb-8">
          <SectionHeader title="Kräver uppmärksamhet" />
          <div className="space-y-2">
            {derived.unpaidInvoices.map(inv => (
              <div
                key={inv.id}
                className="flex items-center justify-between px-4 py-3 rounded-lg border border-warning/30 bg-warning/5 cursor-pointer hover:bg-warning/10 transition-colors"
                onClick={() => inv.customer_id && router.push(`/admin/customers/${inv.customer_id}`)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-warning shrink-0" />
                  <div>
                    <span className="text-sm font-medium text-foreground">{inv.customer_name || 'Obetald faktura'}</span>
                    <span className="text-sm text-muted-foreground ml-2">
                      Obetald · {((inv.amount_due || 0) / 100).toLocaleString('sv-SE')} kr
                    </span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">Förfaller {shortDateSv(inv.due_date)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Cost overview */}
      <section className="mb-8">
        <SectionHeader title="Kostnader" subtitle="30 dagar" />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {data.serviceCosts.entries.map(cost => (
            <div key={cost.service} className="flex flex-col justify-between p-4 bg-card rounded-lg border border-border">
              <div className="text-xs text-muted-foreground mb-2">{cost.service}</div>
              <div className="text-base font-bold text-foreground">
                {cost.cost_30d > 0 ? `${cost.cost_30d.toFixed(0)} kr` : 'Gratis'}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {cost.calls_30d.toLocaleString()} anrop
              </div>
            </div>
          ))}
          <div className="flex flex-col justify-center p-4 bg-secondary/50 rounded-lg border border-border">
            <div className="text-xs text-muted-foreground mb-2">Totalt</div>
            <div className="text-base font-bold text-foreground">{data.serviceCosts.total.toFixed(0)} kr</div>
          </div>
        </div>
      </section>
    </div>
  );
}

function CMRow({ cm, maxActivity }: { cm: ReturnType<typeof deriveOverview>['teamRows'][number]; maxActivity: number }) {
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className="flex items-center gap-4 p-4 bg-card rounded-lg border border-border cursor-pointer hover:bg-accent/20 transition-colors">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-primary-foreground shrink-0"
            style={{ backgroundColor: cm.color }}
          >
            {cm.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground">{cm.name}</div>
            <div className="text-xs text-muted-foreground">
              {cm.customers.length} kunder · Senast {cm.latestActivityAt ? timeAgoSv(cm.latestActivityAt) : 'ingen aktivitet'}
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-4">
            <TempoIndicator actual={cm.actualConcepts} expected={cm.expectedPerWeek} />
            <div className="flex flex-col items-end gap-1">
              <FrequencyBar count={cm.activityCount} max={maxActivity} />
              <div className="text-[11px] text-muted-foreground">{cm.activityCount} händelser</div>
            </div>
          </div>
        </div>
      </HoverCardTrigger>
      <HoverCardContent side="right" align="start" sideOffset={8} className="w-72 p-4">
        <div className="space-y-3">
          <div className="text-sm font-semibold text-foreground">{cm.name}</div>
          <div className="space-y-2 text-xs">
            <Row label="Koncept tillagda (7d)" value={String(cm.actualConcepts)} />
            <Row label="Förväntat tempo (7d)" value={`${cm.expectedPerWeek} koncept`} />
            <Row label="Backlog" value={String(cm.backlog)} />
            <Row label="MRR" value={formatSek(cm.mrrSek * 100)} />
          </div>
          {cm.customersLastUpload.length > 0 && (
            <div className="border-t border-border pt-2">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5">Senaste kunduppladdning</div>
              {cm.customersLastUpload.map(cu => (
                <div key={cu.name} className="flex justify-between text-xs py-0.5">
                  <span className="text-foreground">{cu.name}</span>
                  <span className="text-muted-foreground">{cu.date ? timeAgoSv(cu.date) : 'aldrig'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function FrequencyBar({ count, max }: { count: number; max: number }) {
  const pct = Math.min(100, (count / max) * 100);
  return (
    <div className="h-1.5 w-16 bg-accent rounded-full overflow-hidden">
      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function TempoIndicator({ actual, expected }: { actual: number; expected: number }) {
  if (expected === 0) return <span className="text-[10px] text-muted-foreground">—</span>;
  const ratio = actual / expected;
  let color = 'text-success';
  let label = 'I fas';
  if (ratio < 0.5) { color = 'text-destructive'; label = 'Släpar'; }
  else if (ratio < 0.9) { color = 'text-warning'; label = 'Något efter'; }
  return <span className={`text-[10px] font-medium ${color}`}>{label}</span>;
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-baseline gap-3 mb-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
    </div>
  );
}

function MetricCard({ icon, label, value, sub, badge, badgeLabel }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; badge?: string; badgeLabel?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-4 bg-card rounded-lg border border-border">
      <div className="text-muted-foreground">{icon}</div>
      <div className="flex-1">
        <div className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className="text-base font-bold text-foreground">{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
      </div>
      {badge && (
        <div className="shrink-0 text-right">
          <div className="text-[11px] font-semibold text-success">{badge}</div>
          {badgeLabel && <div className="text-[10px] text-muted-foreground">{badgeLabel}</div>}
        </div>
      )}
    </div>
  );
}
```

---

## 2.6 CM-pulsens logik — viktigt att förstå

Detta är hjärtat i översikten och är det som syns mest avvikande mellan
original och prototyp. Originalets motsvarande "CM-aktivitet"-panel
beräknar bara `activityCount` per CM och listar 6 stycken. Prototypen har:

1. **`activityCount`**: antal `cm_activities`-rader för CM:en de senaste
   7 dagarna. Färgad bar-bredd är `count / maxActivity * 100%`.
2. **`expectedPerWeek`**: summan av `upload_schedule.length` över alla
   *aktiva* kunder CM:en hanterar. (En kund som ska posta 3 dagar/vecka
   ger 3.) `upload_schedule` är ett `text[]`-fält (`['mon','wed','fri']`).
3. **`actualConcepts`**: antal *koncept* (`customer_concepts`) som
   skapades de senaste 7 dagarna för CM:ens kunder.
4. **Tempo**: `actual / expected`-kvot →
   - `>= 0.9`: "I fas" (success-grön)
   - `0.5 – 0.9`: "Något efter" (warning-orange)
   - `< 0.5`: "Släpar" (destructive-röd)
   - `expected === 0`: visar "—"
5. **`customersLastUpload`** (hover): topp-5 kunder + deras senaste upload
   (relativ tid). Källa: `customer_profiles.last_upload_at`.

> Detta kräver att DB faktiskt har kolumnerna `upload_schedule` och
> `last_upload_at` på `customer_profiles`, samt att `cm_activities` fylls
> löpande. Se kapitel 06 för migration och triggrar.

---

## 2.7 Acceptanskriterier för kapitel 02

- [ ] `useOverviewData`-hooken finns och React Query laddar utan fel.
- [ ] `deriveOverview`-funktionen finns och har **enhetstest** (lägg
      till `src/lib/admin/__tests__/overview-derive.test.ts` om vitest finns).
- [ ] `/admin`-sidan renderar de 4 metric cards utan style-prop på själva
      huvudkortet.
- [ ] CM-puls-rader är klickbara, hover öppnar HoverCard med statistik.
- [ ] Tempo-indikator visar rätt label baserat på ratio.
- [ ] Frequency bars renderar (kolla DOM `style.width`).
- [ ] Attention-sektion visas bara när `unpaidInvoices.length > 0`.
- [ ] Ingen `LeTrendColors`-import i `app/admin/page.tsx`.
- [ ] Sortera-knappen togglar mellan default och "lägst aktivitet först".
- [ ] "Visa alla X CMs" expanderar listan.
- [ ] Service-costs- och demos-endpoints är stubbade och returnerar
      `{entries:[],total:0}` resp. `{sent:0,converted:0}` utan att UI kraschar.
- [ ] Visuell jämförelse: rendering matchar prototyp-URLen för `/admin`.

→ Fortsätt till `03_CUSTOMERS_LIST_AND_INVITE.md`.
