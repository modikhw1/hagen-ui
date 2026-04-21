# 09 – Beräkningslogik för UI-komponenter

> **Källor:** `01_LOGIC_overview.md`, `02_LOGIC_cm_pulse.md`, `03_LOGIC_demos_pipeline.md`, `04_LOGIC_customer_blocking.md`, `05_LOGIC_onboarding_status.md`, `06_LOGIC_team_flow.md`.
>
> Detta dokument ersätter `overview-derive.ts`-skissen i dokument 04. All visning av siffror, prickar, statusar och listor i admin-appen härleds härifrån.

Alla helpers placeras i originalrepot under `src/lib/admin-derive/`. Importera namespace-vis: `import * as overview from '@/lib/admin-derive/overview'`.

---

## 1. Översikt – metric-kort (`/admin`)

Fil: `src/lib/admin-derive/overview-cards.ts`.

```ts
import { addDays, subDays, startOfDay } from 'date-fns';

export type MetricCard = {
  label: string;
  value: string;
  delta?: { text: string; tone: 'success' | 'muted' | 'destructive' };
  sub?: string;
};

export type OverviewInput = {
  // Stripe-mirror
  activeSubscriptions: { mrr_ore: number; created_at: Date; canceled_at: Date | null }[];
  // Customers
  customers: { id: string; status: 'active'|'paused'|'churned'; activated_at: Date | null; churned_at: Date | null }[];
  // Demos
  demos: { id: string; status: 'draft'|'sent'|'opened'|'responded'|'won'|'lost'|'expired'; status_changed_at: Date; resolved_at: Date | null }[];
  // Costs (öre)
  costs30d_ore: number;
  now: Date;
};

const SEK = (ore: number) => `${Math.round(ore / 100).toLocaleString('sv-SE')} kr`;

export function monthlyRevenueCard(i: OverviewInput): MetricCard {
  const cutoff = subDays(i.now, 30);
  const mrrNow = i.activeSubscriptions
    .filter(s => !s.canceled_at || s.canceled_at > i.now)
    .reduce((a, s) => a + s.mrr_ore, 0);
  const mrr30dAgo = i.activeSubscriptions
    .filter(s => s.created_at <= cutoff && (!s.canceled_at || s.canceled_at > cutoff))
    .reduce((a, s) => a + s.mrr_ore, 0);
  const delta = mrrNow - mrr30dAgo;
  return {
    label: 'Månatliga intäkter',
    value: SEK(mrrNow),
    delta: {
      text: `${delta >= 0 ? '+' : ''}${SEK(delta)}`,
      tone: delta > 0 ? 'success' : delta < 0 ? 'destructive' : 'muted',
    },
    sub: '30d',
  };
}

export function activeCustomersCard(i: OverviewInput): MetricCard {
  const cutoff = subDays(i.now, 30);
  const active = i.customers.filter(c => c.status === 'active').length;
  const newWithin = i.customers.filter(c => c.activated_at && c.activated_at >= cutoff).length;
  const churnedWithin = i.customers.filter(c => c.churned_at && c.churned_at >= cutoff).length;
  const net = newWithin - churnedWithin;
  return {
    label: 'Aktiva kunder',
    value: String(active),
    delta: net !== 0 ? {
      text: `(${net > 0 ? '+' : ''}${net})`,
      tone: net > 0 ? 'success' : 'destructive',
    } : undefined,
    sub: '30d',
  };
}

export function demosCard(i: OverviewInput): MetricCard {
  const cutoff = subDays(i.now, 30);
  const sent = i.demos.filter(d =>
    ['sent','opened','responded','won','lost'].includes(d.status) && d.status_changed_at >= cutoff
  ).length;
  const won = i.demos.filter(d => d.status === 'won' && d.resolved_at && d.resolved_at >= cutoff).length;
  return { label: 'Demos skickade', value: String(sent), sub: `${won} konverterade` };
}

export function costsCard(i: OverviewInput): MetricCard {
  return { label: 'Kostnad 30d', value: SEK(i.costs30d_ore), sub: '30d' };
}
```

**UI-regler:**
- Ta bort "+N nya kunder"-badge från revenue-kortet (visas på Aktiva kunder).
- Demos-kortet är klickbart → `/admin/demos`.

---

## 2. Buffer-modellen (kund)

Fil: `src/lib/admin-derive/buffer.ts`.

```ts
export type CustomerBufferInput = {
  pace: 1|2|3|4|5;          // concepts_per_week
  latestPlannedPublishDate: Date | null; // max(planned_publish_date) where status in ('draft','ready')
  pausedUntil: Date | null;
  today: Date;
};

const REQ: Record<1|2|3|4|5, { min: number; goal: number }> = {
  1: { min: 3, goal: 7 },
  2: { min: 3, goal: 6 },
  3: { min: 3, goal: 5 },
  4: { min: 2, goal: 4 },
  5: { min: 2, goal: 4 },
};

export type CustomerBufferStatus = 'ok'|'thin'|'under'|'paused'|'blocked';

export function bufferDays(i: CustomerBufferInput): number {
  if (!i.latestPlannedPublishDate) return 0;
  const diff = Math.floor((+i.latestPlannedPublishDate - +i.today) / 86_400_000);
  return Math.max(0, diff);
}

export function customerBufferStatus(
  i: CustomerBufferInput,
  blockedDays: number, // current_date - max(published_at)::date; 0 if recent
): CustomerBufferStatus {
  if (i.pausedUntil && i.pausedUntil > i.today) return 'paused';
  const days = bufferDays(i);
  const req = REQ[i.pace];
  // Blockering: buffer ok men kund inte producerat ≥7d (se dok 04)
  if (blockedDays >= 7 && days >= req.min) return 'blocked';
  if (days >= req.goal) return 'ok';
  if (days >= req.min) return 'thin';
  return 'under';
}
```

`blockedDays` beräknas: `floor((today - max(tiktok_publications.published_at)) / 1d)`. Om det inte finns publikationer alls och kunden är `live` → räkna från `customers.activated_at`.

---

## 3. CM-puls (aggregat per CM)

Fil: `src/lib/admin-derive/cm-pulse.ts`.

```ts
import { differenceInCalendarDays, subDays } from 'date-fns';
import type { CustomerBufferStatus } from './buffer';

export type CmPulseInput = {
  cm: { id: string; name: string; avatarUrl: string | null };
  customers: {
    id: string;
    name: string;
    bufferStatus: CustomerBufferStatus;
    pace: 1|2|3|4|5;
    onboardingState: 'invited'|'cm_ready'|'live'|'settled';
  }[];
  interactions7d: { type: string; created_at: Date }[];
  lastInteractionAt: Date | null;
  now: Date;
};

export type CmStatus = 'in_phase' | 'watch' | 'needs_action';

export function cmAggregate(i: CmPulseInput) {
  const active = i.customers.filter(c => c.bufferStatus !== 'paused');
  const n_under = active.filter(c => c.bufferStatus === 'under').length;
  const n_thin  = active.filter(c => c.bufferStatus === 'thin').length;
  const n_blocked = active.filter(c => c.bufferStatus === 'blocked').length;
  const n_ok    = active.filter(c => c.bufferStatus === 'ok').length;
  const n_paused = i.customers.length - active.length;

  const last_interaction_days = i.lastInteractionAt
    ? differenceInCalendarDays(i.now, i.lastInteractionAt) : 999;

  const interaction_count_7d = i.interactions7d.length;
  const expected_concepts_7d = active.reduce((a, c) => a + c.pace, 0);

  // Status (första matchande vinner)
  let status: CmStatus;
  if (last_interaction_days >= 5 || n_under >= 2) status = 'needs_action';
  else if (n_under === 1 || n_thin >= 2 || last_interaction_days >= 3) status = 'watch';
  else status = 'in_phase';

  // Bar
  const fillPct = expected_concepts_7d === 0
    ? 100
    : Math.min(150, Math.round((interaction_count_7d / expected_concepts_7d) * 100));

  return {
    cmId: i.cm.id,
    status,
    counts: { n_under, n_thin, n_blocked, n_ok, n_paused },
    last_interaction_days,
    interaction_count_7d,
    expected_concepts_7d,
    fillPct,            // 0–150
    overflow: fillPct > 100,
    barLabel: `${interaction_count_7d}/${expected_concepts_7d} koncept`,
  };
}
```

**Sorterings-comparator** för översiktens CM-lista (top 5 + expandera):

```ts
export type SortMode = 'standard' | 'lowest_activity';

export function sortCmRows(rows: ReturnType<typeof cmAggregate>[], mode: SortMode) {
  const order = { needs_action: 0, watch: 1, in_phase: 2 } as const;
  if (mode === 'standard') {
    return [...rows].sort((a, b) =>
      order[a.status] - order[b.status]
      || b.last_interaction_days - a.last_interaction_days);
  }
  return [...rows].sort((a, b) => a.interaction_count_7d - b.interaction_count_7d);
}
```

**Hover-payload** (renderas i `CmPulseHover.tsx`): se layouten i `02_LOGIC_cm_pulse.md` §5. Sektioner: status-pill, veckans tempo (interaction_count_7d / expected_concepts_7d), kundportfölj-räknare, top-3 senaste tiktok-publiceringar, "nya kunder" (om någon har `onboardingState ∈ {invited, cm_ready}`).

---

## 4. Kräver uppmärksamhet (attention list)

Fil: `src/lib/admin-derive/attention.ts`.

```ts
export type AttentionItem =
  | { kind: 'cm_notification'; id: string; priority: 'normal'|'urgent'; createdAt: Date; from: string; message: string; customerId: string|null }
  | { kind: 'invoice_unpaid'; id: string; customerId: string; daysPastDue: number; amount_ore: number }
  | { kind: 'onboarding_stuck'; id: string; customerId: string; daysSinceCmReady: number }
  | { kind: 'demo_responded'; id: string; respondedAt: Date; companyName: string }
  | { kind: 'customer_blocked'; id: string; customerId: string; daysBlocked: number };

const RANK: Record<AttentionItem['kind'], number> = {
  cm_notification: 0,        // urgent först (se sortering nedan)
  invoice_unpaid: 1,
  onboarding_stuck: 2,
  demo_responded: 3,
  customer_blocked: 4,
};

export function sortAttention(items: AttentionItem[]) {
  return [...items].sort((a, b) => {
    // 1. urgenta CM-notiser allra först
    const aUrgent = a.kind === 'cm_notification' && a.priority === 'urgent' ? 0 : 1;
    const bUrgent = b.kind === 'cm_notification' && b.priority === 'urgent' ? 0 : 1;
    if (aUrgent !== bUrgent) return aUrgent - bUrgent;
    // 2. fakturor >14d past_due före övriga
    const aOld = a.kind === 'invoice_unpaid' && a.daysPastDue > 14 ? 0 : 1;
    const bOld = b.kind === 'invoice_unpaid' && b.daysPastDue > 14 ? 0 : 1;
    if (aOld !== bOld) return aOld - bOld;
    // 3. övrig kategori-ranking
    return RANK[a.kind] - RANK[b.kind];
  });
}
```

**Filtrering mot snooze:** querya `attention_snoozes where released_at is null and (snoozed_until is null or snoozed_until > now())`. Filtrera bort items där `(subject_type, subject_id)` matchar. Detalj-sidan hämtar däremot snoozen och visar gul varning *"Hanteras av {admin} sedan {datum} — '{not}'"*.

**Eskalering** (auto-release):
- Snooze utgår → `release_reason='expired'`, posten dyker upp igen.
- Faktura blir 14d äldre / ny faktura för samma kund / onboarding 14d gammal → `release_reason='escalated'` via cron.

Tom lista: liten muted text *"Inget kräver uppmärksamhet just nu."*. **Inte stor empty-state.**

---

## 5. Demo-pipeline (`/admin/demos`)

Fil: `src/lib/admin-derive/demos.ts`.

Kanban-kolumner: `draft | sent | opened | responded | won/lost (kollapserad)`.

```ts
export type DemoCard = {
  id: string; companyName: string; tiktokHandle: string|null;
  proposedPace: number|null; proposedPriceSek: number|null;
  status: 'draft'|'sent'|'opened'|'responded'|'won'|'lost'|'expired';
  statusChangedAt: Date; ownerName: string|null;
};

export function groupDemos(cards: DemoCard[]) {
  return {
    draft:     cards.filter(c => c.status === 'draft'),
    sent:      cards.filter(c => c.status === 'sent'),
    opened:    cards.filter(c => c.status === 'opened'),
    responded: cards.filter(c => c.status === 'responded'),
    closed:    cards.filter(c => ['won','lost','expired'].includes(c.status)),
  };
}
```

Auto-transition `sent → expired` efter 30d utan svar — körs i samma cron som `attention_snoozes` auto-release:

```sql
update public.demos
set status = 'expired'
where status = 'sent' and sent_at < now() - interval '30 days';
```

Konvertering `won → invite`: i route handler `POST /api/admin/demos/:id/convert` — skapar `customers`-rad med `from_demo_id` satt, kopierar `tiktok_handle`, `concepts_per_week = proposed_concepts_per_week`, triggar befintliga invite-flödet.

**Demos-kort i översikten:**
```
demos_30d   = count(demos where status_changed_at within 30d AND status in (sent,opened,responded,won,lost))
converted_30d = count(demos where status='won' AND resolved_at within 30d)
```

---

## 6. Kundblockering (separation från CM-släp)

Fil: `src/lib/admin-derive/blocking.ts`.

```ts
export type BlockingState = 'none' | 'blocked' | 'escalated';

export function customerBlocking(input: {
  lastPublishedAt: Date | null;
  pausedUntil: Date | null;
  today: Date;
}): { state: BlockingState; daysSincePublish: number } {
  if (input.pausedUntil && input.pausedUntil > input.today) {
    return { state: 'none', daysSincePublish: 0 };
  }
  if (!input.lastPublishedAt) return { state: 'escalated', daysSincePublish: 999 };
  const days = Math.floor((+input.today - +input.lastPublishedAt) / 86_400_000);
  if (days >= 10) return { state: 'escalated', daysSincePublish: days };
  if (days >= 7) return { state: 'blocked', daysSincePublish: days };
  return { state: 'none', daysSincePublish: days };
}
```

**Visning:**
- CM-puls hover: rad `⛔ {n_blocked} blockerad av kund` (räknas inte som CM:ens släp).
- Kundkort: pill `⛔ Blockerad – väntar på kund {days} dagar`. Kontextmeny *"Markera som planerad paus"* → set `paused_until`.
- Översikt → Kräver uppmärksamhet: bara om `state === 'escalated'`.

Återhämtning: rensas auto när kund publicerar minst 1 nytt klipp eller sätts `paused`. Ingen manuell handling.

---

## 7. Onboarding-status (`invited → cm_ready → live → settled`)

Fil: `src/lib/admin-derive/onboarding.ts`.

```ts
export type OnboardingState = 'invited'|'cm_ready'|'live'|'settled';

export type OnboardingChecklist = {
  contractSigned: boolean;          // alltid true om kunden finns i customers
  contentPlanSet: boolean;          // concepts_per_week satt + non-default? -> behandla "satt av CM" via separat audit
  startConceptsLoaded: boolean;     // ≥1 feedplan_concept med status in ('draft','ready')
  tiktokHandleConfirmed: boolean;   // tiktok_handle != null
  firstPublication: boolean;        // ≥1 tiktok_publication
};

export function deriveOnboardingState(c: OnboardingChecklist): OnboardingState {
  if (c.firstPublication) return 'live';
  if (c.contentPlanSet && c.startConceptsLoaded && c.tiktokHandleConfirmed) return 'cm_ready';
  return 'invited';
}

// Settled efter 14 dagar i 'live'
export function settleIfDue(state: OnboardingState, liveSince: Date|null, today: Date): OnboardingState {
  if (state === 'live' && liveSince && (+today - +liveSince) >= 14*86_400_000) return 'settled';
  return state;
}
```

Auto-transitions körs i edge function (eller DB-trigger när `tiktok_publications` får insert / `feedplan_concepts` ändras). Skriv tillbaka `customers.onboarding_state`. Triggern i §1 i dokument 08 sätter `onboarding_state_changed_at`.

**Var det visas** — strikt:
- CM-puls hover: sektionen "Nya kunder" — bara om CM har kund i `invited|cm_ready`. Försvinner 14d efter sista `live`.
- Customers-listan: liten "Ny"-pill, bort vid `settled`.
- Kunddetalj: checklista (mappar 1:1 mot fälten ovan).
- Kräver uppmärksamhet: **endast** om `cm_ready` ≥7d utan `live`. (Inte `invited` — det är CM:ens jobb.)

---

## 8. Team-vyn – flödesprickar (relativ baseline)

Fil: `src/lib/admin-derive/team-flow.ts`.

```ts
export type DailyDot = {
  date: Date;
  count: number;
  level: 'empty'|'low'|'mid'|'high'|'peak';
  isWeekend: boolean;
};

export function baseline90d(daily: { date: Date; count: number }[]): number {
  const nonZero = daily.filter(d => d.count > 0).map(d => d.count).sort((a,b)=>a-b);
  if (!nonZero.length) return 0;
  const mid = Math.floor(nonZero.length / 2);
  return nonZero.length % 2 ? nonZero[mid] : (nonZero[mid-1] + nonZero[mid]) / 2;
}

export function classifyDay(count: number, baseline: number, isWeekend: boolean): DailyDot['level'] {
  if (baseline === 0) return count > 0 ? 'mid' : 'empty';
  const adj = isWeekend ? 0.4 : 1;          // helger: 60% lägre tröskel
  const b = baseline * adj;
  if (count === 0) return 'empty';
  if (count > 3 * b) return 'peak';
  if (count > 1.5 * b) return 'high';
  if (count >= 0.5 * b) return 'mid';
  return 'low';
}

export function summarize(dots: DailyDot[]) {
  const active = dots.filter(d => d.count > 0);
  const nonZeroCounts = active.map(d => d.count).sort((a,b)=>a-b);
  const median = nonZeroCounts.length
    ? nonZeroCounts[Math.floor(nonZeroCounts.length / 2)] : 0;
  let longestRest = 0, run = 0;
  for (const d of dots) { if (d.count === 0) { run++; longestRest = Math.max(longestRest, run); } else run = 0; }
  return { activeDays: active.length, total: dots.length, median, longestRest };
}
```

**Färgmappning (semantiska tokens):**
| level | klass |
|---|---|
| empty | `bg-muted` (tom cirkel, border) |
| low | `bg-primary/20` |
| mid | `bg-primary/50` |
| high | `bg-primary` |
| peak | `bg-primary ring-2 ring-primary/40` |

**Sortering "Avvikande aktivitet först":** sortera CMs på `abs(7d_avg − baseline) / baseline desc`.

**Kundbalans-pill** bredvid CM-namn:
| n_customers | bar | varning |
|---|---|---|
| 1–4 | `w-1/4` | – |
| 5–7 | `w-1/2` | – |
| 8–10 | `w-full` | – |
| 11+ | `w-full` + `border-destructive` | "överbelastad" |

Tröskel (10) är konfigurerbar i admin-inställningar (utanför scope nu — hårdkoda men samla i `src/lib/admin-derive/constants.ts`).

---

## 9. Var helpers anropas (mapping)

| Komponent (origrepo) | Helper |
|---|---|
| `app/admin/page.tsx` (Overview) | `overview-cards.*`, `cm-pulse.cmAggregate`, `cm-pulse.sortCmRows`, `attention.sortAttention` |
| `components/admin/CmPulseRow.tsx` + `.../CmPulseHover.tsx` | `cm-pulse.cmAggregate` |
| `components/admin/AttentionList.tsx` | `attention.sortAttention` + snooze-filter |
| `app/admin/demos/page.tsx` | `demos.groupDemos` |
| `app/admin/customers/page.tsx` & `.../[id]/page.tsx` | `buffer.customerBufferStatus`, `blocking.customerBlocking`, `onboarding.deriveOnboardingState` |
| `app/admin/team/page.tsx` | `team-flow.classifyDay`, `team-flow.summarize`, `team-flow.baseline90d` |

---

## 10. Källfrågor (SQL) för helpers

För att hålla edge functions/route handlers tunna — view:a det som upprepas:

```sql
-- views/v_customer_buffer.sql
create or replace view public.v_customer_buffer as
select
  c.id as customer_id,
  c.assigned_cm_id,
  c.concepts_per_week,
  c.paused_until,
  (select max(planned_publish_date)
     from public.feedplan_concepts fc
     where fc.customer_id = c.id and fc.status in ('draft','ready')) as latest_planned_publish_date,
  (select max(published_at)
     from public.tiktok_publications tp
     where tp.customer_id = c.id) as last_published_at
from public.customers c
where c.status <> 'churned';

-- views/v_cm_interactions_7d.sql
create or replace view public.v_cm_interactions_7d as
select cm_id, count(*)::int as cnt
from public.cm_interactions
where created_at >= now() - interval '7 days'
group by cm_id;
```

API-routes hämtar från views, mappar till helper-input, returnerar derive:at JSON till UI.
