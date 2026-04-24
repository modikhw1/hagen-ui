# LeTrend Admin — Refactor Guide, Bundle 04 (v2, Next.js App Router)
## Supporting Flows: Demos, Settings, Payroll, Audit-log, Team-Add

> **Sekventiell guide för en Codex-agent.** Varje fas är atomär. Bocka av i ordning.
> **Stack:** Next.js (App Router) + Tailwind + Supabase + Stripe + TanStack Query.
> Designspråket från `app/admin/customers` är referens — använd `bg-card`, `border-border`,
> `font-heading`, `text-foreground/muted-foreground`, `text-success/warning/destructive`.
> Inga nya färger eller fonter. Inga nya UI-bibliotek.
>
> Fortsätter på namngivningskonventioner från Bundle 01–03:
> `lib/admin/queryKeys.ts`, `lib/admin/apiClient.ts`, `lib/admin-derive/*`, RBAC-scopes,
> `admin_audit_log`, server-side aggregering.

---

## ⚠️ Erratum mot v1 (vad som var fel i tidigare bundles)

Tidigare guider (Bundle 01–04 v1) blandade in **TanStack Start / TanStack Router**-primitiver
trots att appen är **Next.js App Router**. Det berodde på att verktyget som genererade guiderna
självt körs i en TanStack-miljö. Översättningen nedan gäller **alla fyra bundles** — applicera
dessa mappningar när du läser Bundle 01–03 också:

| TanStack-term i v1-guider | Next.js App Router-motsvarighet |
|---|---|
| `src/routes/admin/foo.tsx` | `app/admin/foo/page.tsx` |
| `src/routes/api/admin/foo/route.ts` | `app/api/admin/foo/route.ts` |
| `src/routes/api/admin/foo/$id/bar.ts` | `app/api/admin/foo/[id]/bar/route.ts` |
| `createFileRoute('/x')({ loader, validateSearch })` | Server Component i `page.tsx` + `searchParams`-prop, Zod-parsa server-side. För klient-state: `useSearchParams()` + `nuqs` eller egen helper. |
| `loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(...)` | Server Component fetch + `<HydrationBoundary>` (TanStack Query) eller direkt prop till Client Component. |
| `Route.useSearch().focus` | `useSearchParams().get('focus')` (Client) eller `searchParams.focus` (Server prop). |
| `useSuspenseQuery(opts)` | `useSuspenseQuery(opts)` — **samma**, TanStack Query fungerar identiskt under Next.js. |
| `createServerFn({ method: 'POST' })` | Antingen Server Action (`'use server'` i en separat fil) **eller** Route Handler (`app/api/.../route.ts`). Denna guide använder **Route Handlers** för konsistens med befintliga `app/api/admin/*`. |
| `router.preloadRoute({ to: '/x' })` | `<Link href="/x" prefetch>` (default på). Manuell: `router.prefetch('/x')` från `useRouter()` (next/navigation). |
| TanStack Router `parallel routes` | Next.js har **egna** Parallel Routes via `@slot`-mappar (`app/admin/billing/@panel/...`). Detta är Next-native; behåll konceptet, använd Next-syntaxen. |
| TanStack `<Outlet />` | Next.js `layout.tsx` med `{children}`-prop. |

**Vad som fortfarande är giltigt** från v1-guiderna oavsett ramverk:
- All SQL (views, RPC, idempotency-tabell, audit-log).
- Zod-DTO:er och valideringskontrakt.
- RBAC-scopes (`demos.write`, `settings.write`, …).
- `recordAdminAction`-helpern.
- TanStack **Query** (`qk`, hooks, `useInfiniteQuery`, `staleTime`).
- `apiClient.ts` (fetch-wrapper med abort + Zod-parse).
- `@tanstack/react-virtual` för virtualisering (fungerar i Next.js).
- Designtokens / klassnamn / komponentstruktur.

---

## Innehåll

- [Översikt & problem](#0-översikt--problem)
- [Filkarta (Old → New)](#filkarta-old--new)
- [Fas 1 — Hookar för supporting domains](#fas-1--hookar-för-supporting-domains)
- [Fas 2 — Centraliserade dialog-primitiver](#fas-2--centraliserade-dialog-primitiver)
- [Fas 3 — Demos: domain-derivering server-side](#fas-3--demos-domain-derivering-server-side)
- [Fas 4 — Demos: API-dekomposition + RBAC](#fas-4--demos-api-dekomposition--rbac)
- [Fas 5 — Demos: page → dumb shell](#fas-5--demos-page--dumb-shell)
- [Fas 6 — Convert/Create demo: transaktionell kontrakt](#fas-6--convertcreate-demo-transaktionell-kontrakt)
- [Fas 7 — Settings: schema, persist, audit](#fas-7--settings-schema-persist-audit)
- [Fas 8 — Payroll: server-side aggregering + view](#fas-8--payroll-server-side-aggregering--view)
- [Fas 9 — Payroll: page-dekomposition + virtualisering](#fas-9--payroll-page-dekomposition--virtualisering)
- [Fas 10 — Audit-log: filter, paginering, export](#fas-10--audit-log-filter-paginering-export)
- [Fas 11 — AddCMDialog: harmonisering med team-domänen](#fas-11--addcmdialog-harmonisering-med-team-domänen)
- [Fas 12 — IA: vad blir toppnivå, vad flyttas till /ops](#fas-12--ia-vad-blir-toppnivå-vad-flyttas-till-ops)
- [Fas 13 — Performance, prefetch, latency](#fas-13--performance-prefetch-latency)
- [Fas 14 — Säkerhet, audit & migrations](#fas-14--säkerhet-audit--migrations)
- [Per-fas testchecklista](#per-fas-testchecklista)

---

## 0. Översikt & problem

### Vad bundle 04 innehåller
Sekundära admin-flöden som lever vid sidan av kund-/billing-/team-domänerna men har
samma anti-patterns som Bundle 01–03:

| Fil | Linjer | Problem |
|---|---|---|
| `app/admin/demos/page.tsx` | ~346 | Egen fetcher, egen mapper (`grouped`), egen QK, scroll-state, två inline-komponenter, `searchParams.get('focus')` driver scroll |
| `app/admin/audit-log/page.tsx` | ~98 | Direkt `fetch`, ingen filter/paginering, schemaWarnings inline, ingen export |
| `app/admin/payroll/page.tsx` | ~228 | Stor `MetricCard`-grid, breakdown-tabell utan virtualisering, `period`-state lokal, ingen URL-binding |
| `app/admin/settings/page.tsx` | ~186 | 4 lokala draft-states + en mutation som mergar `?? data`, ingen Zod-validering, ingen audit-log på spar |
| `components/admin/demos/CreateDemoDialog.tsx` | ~231 | Egen `FormState`, egen Field, egen submit, ingen Zod på klient |
| `components/admin/demos/ConvertDemoDialog.tsx` | ~200 | Samma mönster, plus implicit kontrakt mot `convert/route.ts` |
| `components/admin/team/AddCMDialog.tsx` | ~288 | Egen Field, egen reset, role-betingade fält, egen färg-palett konstant |
| `app/api/admin/demos/route.ts` | ~99 | OK separation men POST/GET delar ingen schema/owner-resolver med convert |
| `app/api/admin/demos/[id]/convert/route.ts` | ~153 | Multi-step skriv (insert customer → update demo → invite) UTAN transaktion eller idempotency |

### Tre genomgående anti-patterns

1. **Form-dialogerna är duplicerad infrastruktur.** Tre dialogar (Create demo, Convert demo, AddCM) har var sin egen `Field`, `submitting`-state, `error`-state, `warning`-state, `reset()`. Ingen delar kontrakt.
2. **Multi-step writes utan transaktion.** `convert/route.ts` gör `customer insert` → `demo update` → `invite send`. Om steg 2 failar är kunden skapad utan giltig demo-koppling. Om steg 3 failar finns det ingen retry.
3. **Page-state istället för URL-state.** `period` (payroll), `focusedColumn` (demos), `billingInterval`/draft-states (settings) — allt borde vara URL-drivet via `searchParams` eller server-state.

### Mål för Bundle 04
- Ingen ny färg/font/komponent. Återanvänd `bg-card`, `border-border`, `font-heading`.
- Alla supporting flows får **samma datalayer** som customers/billing/team (Bundle 01–03): `apiClient`, kanoniska QK, Zod-DTO, server-side aggregering där det ger latensvinst.
- Alla dialogs ärver från en gemensam `<AdminFormDialog>`-primitive.
- Alla mutations skrivs till `admin_audit_log`.
- Multi-step writes blir transaktionella via Postgres RPC eller advisory lock.

---

## Filkarta (Old → New) — Next.js App Router

| Old | New | Anteckning |
|---|---|---|
| `app/admin/demos/page.tsx` (client, allt-i-ett) | `app/admin/demos/page.tsx` (Server Component, prefetch + `<HydrationBoundary>`) + `components/admin/demos/DemosBoard.tsx` (Client) + `DemoColumn.tsx` + `DemoCard.tsx` + `DemoSummaryStrip.tsx` | Fas 5 |
| `components/admin/demos/CreateDemoDialog.tsx` | Samma sökväg, refactor över `<AdminFormDialog>` | Fas 6 |
| `components/admin/demos/ConvertDemoDialog.tsx` | Samma sökväg, refactor över `<AdminFormDialog>` | Fas 6 |
| `app/admin/audit-log/page.tsx` | `app/admin/(ops)/audit-log/page.tsx` (Server Shell) + `components/admin/audit/AuditLogTable.tsx` + `AuditLogFilters.tsx` (båda Client) | Fas 10 |
| `app/admin/payroll/page.tsx` | `app/admin/(ops)/payroll/page.tsx` (Server) + `PayrollTotalsStrip.tsx` + `PayrollHandoverList.tsx` + `PayrollMemberSection.tsx` + `PayrollCustomerRows.tsx` | Fas 9 |
| `app/admin/settings/page.tsx` | `app/admin/(ops)/settings/page.tsx` (Server Shell) + `SettingsForm.tsx` (Client, react-hook-form + Zod) | Fas 7 |
| `components/admin/team/AddCMDialog.tsx` | Samma sökväg, refactor över `<AdminFormDialog>` | Fas 11 |
| `app/api/admin/demos/route.ts` | Samma sökväg (GET list + POST create, smalare) | Fas 4 |
| `app/api/admin/demos/[id]/convert/route.ts` | Samma sökväg (POST, transaktionell RPC) | Fas 6 |
| `app/api/admin/demos/[id]/route.ts` (PATCH status) | Samma sökväg (PATCH single-action) | Fas 4 |
| (saknas) | `app/api/admin/settings/route.ts` (GET + PATCH med audit) | Fas 7 |
| (saknas) | `app/api/admin/payroll/route.ts` (GET, view-baserad) | Fas 8 |
| (saknas) | `app/api/admin/audit-log/route.ts` (GET med filter/paginering) | Fas 10 |
| (saknas) | `app/api/admin/audit-log/export/route.ts` (GET, streamad CSV) | Fas 10 |
| `lib/admin-derive/demos.ts` (klient) | Behåll endast `demoStatusLabel` på klient. Flytta `groupDemos`/`nextDemoStatus`-logik till server-DTO. | Fas 3 |

> **Notera:** `(ops)` är en **Next.js Route Group** — parenteser betyder att segmentet *inte*
> påverkar URL:en. URL blir `/admin/audit-log` etc, men allt under `(ops)` delar `layout.tsx`
> (sub-nav). Se Fas 12 om vi i stället vill att URL:en ska vara `/admin/ops/audit-log`.

### Nya delade primitiver (skapas i Fas 1–2)

| Fil | Roll |
|---|---|
| `components/admin/shared/AdminFormDialog.tsx` (Client) | Wrappar `<Dialog>` + felband + warning-band + submit-row |
| `components/admin/shared/AdminField.tsx` (Client) | Ersätter de 4 olika `Field`-implementationerna |
| `components/admin/shared/StatBlock.tsx` (Server-safe) | Ersätter `MetricCard`/`SummaryCard` |
| `components/admin/shared/SchemaWarningBanner.tsx` (Server-safe) | Konsolidera `schemaWarnings[0]`-mönstret |
| `lib/admin/queryKeys.ts` | Lägg till nycklar (se Fas 1) |
| `lib/admin/audit.ts` (server-only) | `recordAdminAction(supabase, { actorId, action, entityType, entityId, metadata })` |
| `lib/admin-schemas/demos.ts` | Zod-schemas (delas client/server) |
| `lib/admin-schemas/settings.ts` | Zod-schemas |
| `lib/admin-schemas/team.ts` | Zod-schema för AddCM (Bundle 02 har redan team — utöka) |

> Filer som **bara** används i Route Handlers eller Server Components ska markeras
> med `import 'server-only'` på första raden för att förhindra läckage till klientbundle.

---

## Fas 1 — Hookar för supporting domains

**Mål:** Ge demos / settings / payroll / audit / team-add **samma datalayer** som customers/billing.

### 1.1 Utöka `lib/admin/queryKeys.ts`

```ts
export const qk = {
  // ... från Bundle 01–03
  demos: {
    board:    (days = 30) => ['admin', 'demos', 'board', days] as const,
    detail:   (id: string) => ['admin', 'demos', 'detail', id] as const,
  },
  settings: {
    root: () => ['admin', 'settings'] as const,
  },
  payroll: {
    period: (key: string | null) => ['admin', 'payroll', key ?? 'current'] as const,
  },
  auditLog: {
    list: (filter: { actor?: string; entity?: string; limit: number; cursor?: string | null }) =>
      ['admin', 'audit-log', filter] as const,
  },
} as const;
```

### 1.2 Skapa hooks (alla Client-side, `'use client'`)

| Hook | Använder | Returnerar |
|---|---|---|
| `useDemosBoard(days)` | `apiClient.get<DemosBoardDTO>('/api/admin/demos', { days })` | `useQuery` |
| `useUpdateDemoStatus()` | `apiClient.patch('/api/admin/demos/' + id, { status })` | `useMutation`, invalidate `qk.demos.board()` + `qk.overview()` |
| `useConvertDemo()` | `apiClient.post('/api/admin/demos/' + id + '/convert')` | `useMutation`, invalidate demos + customers |
| `useCreateDemo()` | `apiClient.post('/api/admin/demos')` | `useMutation` |
| `useAdminSettings()` | `apiClient.get<SettingsDTO>('/api/admin/settings')` | `useQuery` |
| `useUpdateAdminSettings()` | `apiClient.patch('/api/admin/settings', payload)` | `useMutation`, invalidate settings + payroll |
| `usePayroll(periodKey)` | `apiClient.get<PayrollDTO>('/api/admin/payroll', { period })` | `useQuery`, `staleTime: 60_000` |
| `useAuditLog(filter)` | `apiClient.get<AuditLogDTO>('/api/admin/audit-log', filter)` | `useInfiniteQuery` |
| `useCreateTeamMember()` | `apiClient.post('/api/admin/team', payload)` | `useMutation`, invalidate team list |

**Princip från Bundle 03:** ingen klient-side mapping. Hooks returnerar exakt vad servern skickar (Zod-validerat).

### 1.3 SSR-prefetch i Server Components (Next.js-mönster)

För varje route ovan, primea cachen i `page.tsx` med TanStack Query's hydration:

```tsx
// app/admin/demos/page.tsx (Server Component)
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { DemosBoard } from '@/components/admin/demos/DemosBoard';
import { fetchDemosBoardServer } from '@/lib/admin/server/demos';
import { qk } from '@/lib/admin/queryKeys';

export const dynamic = 'force-dynamic';   // admin = personlig data, ingen SSG

export default async function DemosPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; focus?: string; action?: string; convert?: string }>;
}) {
  const sp = await searchParams;
  const days = Number(sp.days ?? 30);

  const qc = new QueryClient();
  await qc.prefetchQuery({
    queryKey: qk.demos.board(days),
    queryFn: () => fetchDemosBoardServer({ days }),
  });

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <DemosBoard days={days} focus={sp.focus} action={sp.action} convert={sp.convert} />
    </HydrationBoundary>
  );
}
```

> `fetchDemosBoardServer` ligger i `lib/admin/server/*` med `import 'server-only'` och
> går direkt mot Supabase (ingen HTTP-hop). Klient-hooken `useDemosBoard` använder
> `apiClient` mot Route Handler. Båda returnerar **samma** Zod-validerade DTO.

---

## Fas 2 — Centraliserade dialog-primitiver

**Mål:** Eliminera duplicerad form-infrastruktur. Tre dialogs (Create demo, Convert demo, AddCM) ska dela:
`<AdminFormDialog>`, `<AdminField>`, error-band, warning-band, submit-row.

### 2.1 `components/admin/shared/AdminFormDialog.tsx` (Client)

```tsx
'use client';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  submitLabel: string;
  submittingLabel?: string;
  onSubmit: () => void | Promise<void>;
  submitting: boolean;
  canSubmit: boolean;
  error?: string | null;
  warning?: string | null;
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
};
```

- Använder `<Dialog>` / `<DialogContent>` / `<DialogHeader>` från `@/components/ui/dialog`.
- `size` mappar till `sm:max-w-md | sm:max-w-lg | sm:max-w-xl`.
- Renderar error- och warning-band med exakt samma klasser som dagens implementationer:
  - error: `rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive`
  - warning: `rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning`
- Footer: `Avbryt`-knapp + primär-knapp.

### 2.2 `AdminField.tsx` (Client)

```tsx
<AdminField label="Bolag *" htmlFor="company_name">
  <input ... />
</AdminField>
```

Ersätter de 4 lokala `Field`-funktionerna i `CreateDemoDialog`, `ConvertDemoDialog`, `AddCMDialog`, `settings/page.tsx`.

### 2.3 `StatBlock.tsx` (Server-safe — inga hooks)

```tsx
<StatBlock label="Aktiva CMs" value="12" compact />
```

Ersätter `MetricCard` (payroll), `SummaryCard` (demos), och de inline `<div className="rounded-lg border bg-card p-4">`-blocken i overview/billing.

### 2.4 `SchemaWarningBanner.tsx` (Server-safe)

```tsx
<SchemaWarningBanner warnings={data.schemaWarnings} />
```

Renderar bara om `warnings?.length > 0`, visar första (samma beteende som idag).

> ⚠️ **Viktigt för Codex:** Ändra **inte** klassnamnen på error/warning/success-banden när du
> centraliserar — designspråket är redan etablerat. Centralisering = samma DOM, en källa.

---

## Fas 3 — Demos: domain-derivering server-side

**Problem idag:** `page.tsx` mappar `DemoApiRow → DemoCard`-shape via `groupDemos()` på klient. Servern returnerar rådata, klienten gör beräkning.

**Mål:** Servern returnerar färdig `DemosBoardDTO` med `columns` redan grupperade.

### 3.1 Skapa Zod-schema `lib/admin-schemas/demos.ts`

```ts
import { z } from 'zod';

export const DemoStatus = z.enum(['draft','sent','opened','responded','won','lost','expired']);

export const DemoCardDTO = z.object({
  id: z.string().uuid(),
  companyName: z.string(),
  contactEmail: z.string().email().nullable(),
  tiktokHandle: z.string().nullable(),
  proposedConceptsPerWeek: z.number().int().nullable(),
  proposedPriceOre: z.number().int().nullable(),
  status: DemoStatus,
  statusChangedAt: z.string().datetime(),
  ownerName: z.string().nullable(),
  lostReason: z.string().nullable(),
  nextStatus: DemoStatus.nullable(),  // serverberäknat
});

export const DemosBoardDTO = z.object({
  sentLast30: z.number().int(),
  convertedLast30: z.number().int(),
  totalOnBoard: z.number().int(),
  columns: z.object({
    draft:     z.array(DemoCardDTO),
    sent:      z.array(DemoCardDTO),
    opened:    z.array(DemoCardDTO),
    responded: z.array(DemoCardDTO),
    closed:    z.array(DemoCardDTO),  // won + lost + expired
  }),
});
```

### 3.2 Behåll endast i `lib/admin-derive/demos.ts`

- `demoStatusLabel(status)` — pure label-mapping, säker att köra på klient.
- Allt annat (`groupDemos`, `nextDemoStatus`) flyttas till servern och konsumeras via DTO.

---

## Fas 4 — Demos: API-dekomposition + RBAC

### 4.1 `app/api/admin/demos/route.ts`

```ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  // RBAC: demos.read
  // Returnera DemosBoardDTO (Fas 3)
}

export async function POST(req: NextRequest) {
  // RBAC: demos.write
  // Validera body med CreateDemoSchema (Zod)
  // Insert + audit('demo.create')
  // Returnera DemoCardDTO
}
```

- POST validerar med samma Zod som klienten använder (delas via `lib/admin-schemas/demos.ts`).
- Skriv `admin_audit_log` (`recordAdminAction`).

### 4.2 `app/api/admin/demos/[id]/route.ts`

```ts
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Validera UpdateDemoStatusDTO { status: DemoStatus, lostReason?: string }
  // Uppdatera demos + status_changed_at + (om won/lost/expired) resolved_at
  // recordAdminAction('demo.status_change', { from, to })
}
```

- En enda action per request (samma princip som Bundle 01: handlers per action, inte if-else-grenade megaroutes).

### 4.3 `app/api/admin/demos/[id]/convert/route.ts`

Egen fas (Fas 6) — transaktionell.

> **Next.js 15-not:** I Next.js 15 är `params` och `searchParams` `Promise<...>` — alltid
> `await`:a innan du läser. Detta gäller alla Route Handlers och Server Component pages
> i hela bundle 04.

---

## Fas 5 — Demos: page → dumb shell

**Mål:** `app/admin/demos/page.tsx` blir <80 rader och innehåller bara prefetch + layout.

### 5.1 Ny struktur

```
app/admin/demos/page.tsx               # Server Component, prefetch + HydrationBoundary
components/admin/demos/
  DemosBoard.tsx              # 'use client', drar useDemosBoard()
  DemoColumn.tsx              # ren presentation
  DemoCard.tsx                # ren presentation, actions delegeras upp
  DemoSummaryStrip.tsx        # 3x StatBlock
  DemoActions.tsx             # advance / convert / lose
  CreateDemoDialog.tsx        # över AdminFormDialog
  ConvertDemoDialog.tsx       # över AdminFormDialog
```

### 5.2 URL-state istället för local state

| Idag | Nytt |
|---|---|
| `useState(showCreateDialog)` | `?action=create` läses via Server Component prop ELLER `useSearchParams()` i Client |
| `useState(selectedForConvert)` | `?convert=<demoId>` |
| `searchParams.get('focus')` | `?focus=responded` (Client: `useSearchParams()`, Server: prop) |
| `useState(feedback)` | toast (`sonner`) — bort med inline-band efter mutation |

**Mönster för URL-mutation i Client Component:**

```tsx
'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

function openCreate() {
  const params = new URLSearchParams(searchParams);
  params.set('action', 'create');
  router.replace(`${pathname}?${params}`, { scroll: false });
}
```

> **Tips:** Om vi vill ha typad URL-state utan boilerplate, lägg till `nuqs`
> (`useQueryState('action')`). Men inför inte ett nytt bibliotek bara för det här —
> vanlig `useSearchParams` räcker.

### 5.3 Scroll-into-view för fokus-kolumn
Behåll `requestAnimationFrame` + `data-demo-column={key}` — det är redan rätt mönster.
Flytta logiken in i `DemosBoard.tsx` (inte page-shell). Läs `focus` via `useSearchParams()`.

---

## Fas 6 — Convert/Create demo: transaktionell kontrakt

### 6.1 Convert: nuvarande problem
`app/api/admin/demos/[id]/convert/route.ts` gör 3 sekventiella skrivar utan transaktion:

1. `INSERT customer_profiles` (kan lyckas)
2. `UPDATE demos SET status='won'` (kan faila → kund finns utan demo-koppling)
3. `sendCustomerInvite()` (extern Stripe + email — kan faila → orphan customer)

### 6.2 Lösning: Postgres RPC + idempotency

```sql
-- migration: convert_demo_to_customer.sql
create or replace function admin_convert_demo_to_customer(
  p_demo_id uuid,
  p_owner_admin_id uuid,
  p_billing_day int,
  p_contract_start_date date,
  p_idempotency_key text
) returns table(customer_id uuid, demo_id uuid, was_idempotent_replay boolean)
language plpgsql security definer
set search_path = public
as $$
declare
  v_existing_customer uuid;
  v_demo demos%rowtype;
  v_customer uuid;
begin
  -- idempotency check via admin_idempotency_keys
  select customer_id into v_existing_customer
    from admin_idempotency_keys
    where key = p_idempotency_key and operation = 'demo.convert';
  if v_existing_customer is not null then
    return query select v_existing_customer, p_demo_id, true;
    return;
  end if;

  -- advisory lock per demo
  perform pg_advisory_xact_lock(hashtext('demo.convert:' || p_demo_id::text));

  select * into v_demo from demos where id = p_demo_id for update;
  if not found then raise exception 'demo_not_found'; end if;

  -- prevent double convert
  if exists (select 1 from customer_profiles where from_demo_id = p_demo_id) then
    raise exception 'demo_already_converted';
  end if;

  insert into customer_profiles(...)
    values (...)
    returning id into v_customer;

  update demos set
    status = 'won',
    owner_admin_id = coalesce(owner_admin_id, p_owner_admin_id),
    status_changed_at = now(),
    responded_at = coalesce(responded_at, now()),
    resolved_at = now()
  where id = p_demo_id;

  insert into admin_idempotency_keys(key, operation, customer_id, created_at)
    values (p_idempotency_key, 'demo.convert', v_customer, now());

  insert into admin_audit_log(actor_id, action, entity_type, entity_id, metadata)
    values (p_owner_admin_id, 'demo.convert', 'demo', p_demo_id,
            jsonb_build_object('customer_id', v_customer));

  return query select v_customer, p_demo_id, false;
end $$;
```

### 6.3 Route Handler

```ts
// app/api/admin/demos/[id]/convert/route.ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const ConvertDemoSchema = z.object({ /* ... */ });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: demoId } = await params;
  const body = ConvertDemoSchema.parse(await req.json());

  // 1. Idempotency-key från header eller derivera
  const idemKey = req.headers.get('idempotency-key')
    ?? `${demoId}:${userId}:${body.contract_start_date}`;

  // 2. Anropa RPC (atomär)
  const { data, error } = await supabase.rpc('admin_convert_demo_to_customer', {
    p_demo_id: demoId,
    p_owner_admin_id: userId,
    p_billing_day: body.billing_day,
    p_contract_start_date: body.contract_start_date,
    p_idempotency_key: idemKey,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { customer_id, was_idempotent_replay } = data[0];

  // 3. OM send_invite=true OCH skapad-nu (inte replay): skicka invite UTANFÖR transaktionen
  let warning: string | null = null;
  if (body.send_invite && !was_idempotent_replay) {
    try { await sendCustomerInvite(customer_id); }
    catch (e) { warning = 'Kund skapad men invite kunde inte skickas. Försök igen.'; }
  }

  return NextResponse.json({
    customer: { id: customer_id },
    demo: { id: demoId },
    invite_sent: body.send_invite && !warning,
    warning,
  });
}
```

> ⚠️ **Viktigt:** Invite-sändningen ligger UTANFÖR transaktionen. Om mailen failar
> har vi fortfarande en korrekt kund + uppdaterad demo, och vi visar warning till
> admin som kan retry:a via en ny "Skicka invite"-knapp på kundkortet (finns redan
> från Bundle 01).

### 6.4 Create demo

`POST /api/admin/demos` — enklare, men:
- Validera Zod på server (`CreateDemoSchema`).
- Skriv `admin_audit_log` action `demo.create`.
- Returnera `DemoCardDTO` (samma shape som board) — så att klienten kan använda
  `queryClient.setQueryData(qk.demos.board(30), draft => ...)` utan extra refetch.

---

## Fas 7 — Settings: schema, persist, audit

### 7.1 Problem idag
- 4 lokala `useState`-draftar med `?? data.settings.X`-fallback i submit.
- Ingen Zod på client. `Number(...)` med tysta `Number.isFinite`-fallbacks.
- Ingen audit på spar.
- "Settings sparades"-band kvar permanent tills nästa render.

### 7.2 Lösning

**Schema** `lib/admin-schemas/settings.ts`:
```ts
import { z } from 'zod';

export const AdminSettingsDTO = z.object({
  default_billing_interval: z.enum(['month','quarter','year']),
  default_payment_terms_days: z.number().int().min(1).max(120),
  default_currency: z.string().regex(/^[A-Z]{3}$/),
  default_commission_rate: z.number().min(0).max(1),
  updated_at: z.string().datetime().nullable(),
});

export const UpdateAdminSettingsInput = AdminSettingsDTO
  .pick({ default_billing_interval: true, default_payment_terms_days: true,
          default_currency: true, default_commission_rate: true })
  .extend({
    default_commission_rate_percent: z.number().min(0).max(100).optional(),
  });
```

**Form** `components/admin/settings/SettingsForm.tsx`:
```tsx
'use client';
// react-hook-form + zodResolver (redan via shadcn <Form>)
```
- Inga lokala `useState`-draftar.
- Submit → `useUpdateAdminSettings()` → toast (`sonner`) istället för inline success-band.
- Inline-error-band stannar vid fält (via `<FormMessage>`).

**Server** `app/api/admin/settings/route.ts`:
```ts
import 'server-only';

export async function GET() {
  // Returnera AdminSettingsDTO
}

export async function PATCH(req: NextRequest) {
  // Validera UpdateAdminSettingsInput
  // Skriv
  // recordAdminAction(actor, 'settings.update', 'admin_settings', null, { changed_fields: diff })
  // Returnera ny AdminSettingsDTO
}
```

- RBAC: `settings.read` / `settings.write`.
- Audit-log innehåller diff (gamla → nya värden) — viktigt för commission_rate-ändringar.

### 7.3 Effekt på payroll
- `useUpdateAdminSettings.onSuccess` → invalidate `qk.payroll.period(...)`.

---

## Fas 8 — Payroll: server-side aggregering + view

### 8.1 Problem idag
- Servern returnerar redan rätt aggregat (bra). Men klienten gör ingen ny logik.
- Page är 228 rader för layout. Behöver dekomponeras (Fas 9).
- `period`-state är lokal `useState(null)` — bör ligga i URL (`?period=YYYY-MM`).
- Inga query-cancellation-mönster (Bundle 03 `apiClient` löser detta).

### 8.2 SQL view (om inte redan finns)

```sql
create or replace view v_admin_payroll_period as
select
  ilm.period_key,
  ilm.period_label,
  ilm.period_start,
  ilm.period_end,
  cm.id   as cm_id,
  cm.name as cm_name,
  cm.email as cm_email,
  cm.commission_rate,
  count(distinct cp.id) filter (where cp.status = 'active') as active_customers,
  count(distinct cp.id) as assigned_customers,
  coalesce(sum(ili.amount_ore), 0) as billed_ore,
  coalesce(sum(ili.amount_ore * cm.commission_rate)::int, 0) as payout_ore,
  coalesce(sum(ili.billable_days), 0) as billable_days
from invoice_line_items_monthly ilm
join team_members cm on cm.id = ilm.cm_id
left join customer_profiles cp on cp.assigned_cm_id = cm.id
left join invoice_line_items ili
  on ili.cm_id = cm.id
 and ili.period_key = ilm.period_key
group by ilm.period_key, ilm.period_label, ilm.period_start, ilm.period_end,
         cm.id, cm.name, cm.email, cm.commission_rate;
```

(Anpassa kolumner mot faktisk schema.)

### 8.3 API

`app/api/admin/payroll/route.ts` GET:
- Query-param `?period=YYYY-MM`.
- Default = pågående period.
- Använd `v_admin_payroll_period` istället för att aggregera i Node.
- Hämta `scheduled_changes` separat från `customer_profile_handovers`-tabell.
- `Cache-Control: private, max-age=30, stale-while-revalidate=60` — sätt via `NextResponse`:
  ```ts
  const res = NextResponse.json(data);
  res.headers.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=60');
  return res;
  ```

### 8.4 Klient-DTO

`PayrollDTO` — Zod-validerad, ingen `any`. Ta bort `source: 'invoice_line_items' | 'customer_profiles_fallback'` från publik DTO — fallback elimineras med migration som faktiskt skapar `invoice_line_items`-tabellen om den saknas. Ingen runtime-fallback i klient.

---

## Fas 9 — Payroll: page-dekomposition + virtualisering

### 9.1 Ny struktur

```
app/admin/(ops)/payroll/page.tsx        # Server Component, prefetch, ~50 rader
components/admin/payroll/
  PayrollHeader.tsx                     # title + period select + link to team
  PayrollTotalsStrip.tsx                # 5x StatBlock
  PayrollHandoverList.tsx               # scheduled_changes
  PayrollMemberSection.tsx              # per-CM card
  PayrollCustomerRows.tsx               # per-customer breakdown
```

### 9.2 URL-binding för period (Next.js)

```tsx
// app/admin/(ops)/payroll/page.tsx (Server Component)
import { z } from 'zod';

const SearchSchema = z.object({ period: z.string().optional() });

export const dynamic = 'force-dynamic';

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = SearchSchema.parse(await searchParams);
  const periodKey = sp.period ?? null;

  const qc = new QueryClient();
  await qc.prefetchQuery({
    queryKey: qk.payroll.period(periodKey),
    queryFn: () => fetchPayrollServer({ period: periodKey }),
  });

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <PayrollScreen periodKey={periodKey} />
    </HydrationBoundary>
  );
}
```

I `PayrollHeader.tsx` (Client):
```tsx
'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

function onPeriodChange(nextKey: string) {
  const params = new URLSearchParams(searchParams);
  params.set('period', nextKey);
  router.replace(`${pathname}?${params}`, { scroll: false });
}
```

Ingen lokal state.

### 9.3 Virtualisering

Om `data.rows.length > 20` ELLER om `customer_breakdown.length > 50`: använd `@tanstack/react-virtual` på `PayrollCustomerRows.tsx`. Behåll exakt samma DOM-struktur per rad så designen inte ändras.

---

## Fas 10 — Audit-log: filter, paginering, export

### 10.1 Problem idag
- Hämtar 100 senaste utan paginering.
- Inga filter (actor, action, entity_type, datumintervall).
- Ingen CSV-export.
- `metadata.summary || metadata.action || 'Ingen extra metadata'` är svår att skala.

### 10.2 Lösning

**API** `app/api/admin/audit-log/route.ts`:
```ts
// GET ?actor=&action=&entity=&from=&to=&limit=50&cursor=<opaque>
// →
// {
//   entries: AuditEntryDTO[],
//   nextCursor: string | null,
//   facets: { actors: [...], actions: [...], entities: [...] }
// }
```

- Cursor-paginering på `(created_at desc, id desc)`.
- RBAC: `audit.read` (admin only).

**Export** `app/api/admin/audit-log/export/route.ts`:
```ts
export async function GET(req: NextRequest) {
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(new TextEncoder().encode('created_at,actor,action,entity_type,entity_id,metadata\n'));
      // Iterera i chunks om 500 rader, enqueue per rad.
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="audit-log.csv"',
    },
  });
}
```

**UI** `app/admin/(ops)/audit-log/page.tsx`:
- `<AuditLogFilters>` — Combobox för actor, action, entity. Range picker för datum.
- `<AuditLogTable>` — virtualiserad, infinite-scroll via `useInfiniteQuery`.
- Knapp "Exportera CSV" → `<a href="/api/admin/audit-log/export?<samma filter>" download>`.
- Filter-state lever i URL via `useSearchParams()`.
- Behåll **exakt samma rad-layout** som idag (`grid-cols-[180px_1.2fr_1fr_1fr]`, samma färger).

### 10.3 Metadata-rendering

Skapa `formatAuditMetadata(entry: AuditEntryDTO): string` i `lib/admin-derive/audit.ts`:
- Per-action-mappers (`demo.convert` → "Konverterade demo X till kund Y").
- Default fallback samma som idag.

---

## Fas 11 — AddCMDialog: harmonisering med team-domänen

### 11.1 Problem idag
- 288 rader, mestadels duplicerad `Field`-infrastruktur.
- `TEAM_COLORS`-konstant inline (borde vara i `lib/admin/teamPalette.ts`, delas med `EditCMDialog`).
- `role`-betingade fält visas/döljs men ingen Zod-validering.
- `onSaved()` triggar inte refresh av team-listan på rätt QK (Bundle 02 introducerade `qk.team.list()`).

### 11.2 Lösning

**Skapa** `lib/admin/teamPalette.ts`:
```ts
export const TEAM_COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'] as const;
export type TeamColor = (typeof TEAM_COLORS)[number];
```

Använd från både `AddCMDialog`, `EditCMDialog` (Bundle 02), och `TeamMemberCard`.

**Refactor** `AddCMDialog.tsx`:
- Bygg över `<AdminFormDialog>` + `<AdminField>`.
- Schema:
  ```ts
  export const AddTeamMemberInput = z.object({
    role: z.enum(['admin', 'content_manager']),
    name: z.string().trim().min(1).max(120),
    email: z.string().email(),
    phone: z.string().trim().max(40).optional().default(''),
    city: z.string().trim().max(80).optional().default(''),
    bio: z.string().trim().max(2000).optional().default(''),
    avatar_url: z.string().url().optional().or(z.literal('')),
    color: z.enum(TEAM_COLORS),
    commission_rate: z.number().min(0).max(1),
    sendInvite: z.literal(true).or(z.boolean()).default(true),
  }).refine(d => d.role === 'admin' ? d.commission_rate === 0 : true,
            { message: 'Admin ska ha commission_rate = 0', path: ['commission_rate'] });
  ```
- Bind till `react-hook-form`.
- `commission_rate`-fält visas bara när `role === 'content_manager'`.

**Mutation:**
```ts
useCreateTeamMember() → onSuccess:
  qc.invalidateQueries({ queryKey: qk.team.list() });
  qc.invalidateQueries({ queryKey: qk.payroll.period(null) });
```

---

## Fas 12 — IA: vad blir toppnivå, vad flyttas till /ops

**Frågan från README:** "ska audit och payroll förbli separata toppnivåer eller flyttas under ops?"

### 12.1 Förslag — två varianter

**Variant A (rekommenderad): Route Group `(ops)` — ingen URL-förändring**

```
app/admin/(ops)/layout.tsx          # sub-nav: Settings / Payroll / Audit-log
app/admin/(ops)/settings/page.tsx
app/admin/(ops)/payroll/page.tsx
app/admin/(ops)/audit-log/page.tsx
```

URL förblir `/admin/settings`, `/admin/payroll`, `/admin/audit-log`. Inga redirects behövs. Sub-nav delas via grupp-layouten.

**Variant B: Faktisk URL-förändring `/admin/ops/*`**

```
app/admin/ops/layout.tsx
app/admin/ops/settings/page.tsx
app/admin/ops/payroll/page.tsx
app/admin/ops/audit-log/page.tsx
```

Kräver redirects i `next.config.js`:
```js
async redirects() {
  return [
    { source: '/admin/settings', destination: '/admin/ops/settings', permanent: true },
    { source: '/admin/payroll', destination: '/admin/ops/payroll', permanent: true },
    { source: '/admin/audit-log', destination: '/admin/ops/audit-log', permanent: true },
  ];
}
```

> **Codex: använd Variant A** om inget annat anges. Det är mindre rörligt och bevarar bookmarks.

### 12.2 Topp-nav i `app/admin/layout.tsx`

| Nuvarande | Nytt |
|---|---|
| Översikt | Översikt |
| Kunder | Kunder |
| Billing | Billing |
| Team | Team |
| Demos | Demos |
| Settings | **Ops** (dropdown: Settings / Payroll / Audit-log) |
| Payroll | (flyttad) |
| Audit-log | (flyttad) |

> 🎯 **Designprincip:** Topp-IA reflekterar **frekvens**, inte funktion. Demos är sales-flöde
> som CM/admin tittar på dagligen → toppnivå. Ops-grejer är kvartalsvis → samlade.

---

## Fas 13 — Performance, prefetch, latency

### 13.1 Prefetch (Next.js)

`<Link href>` har `prefetch=true` som default — Next.js prefetchar automatiskt när länken
är synlig i viewport (i prod-build). Inget manuellt arbete behövs för länkar i nav.

För hover-prefetch utöver default:
```tsx
'use client';
import { useRouter } from 'next/navigation';
const router = useRouter();
<button onMouseEnter={() => router.prefetch('/admin/payroll')}>...</button>
```

Speciellt viktigt för `/admin/payroll` (server-aggregering, ~200ms cold).

### 13.2 Cache-Control (sätts i Route Handler via `NextResponse.headers.set`)

| Endpoint | Cache-Control |
|---|---|
| `/api/admin/demos` | `private, max-age=10, stale-while-revalidate=30` |
| `/api/admin/settings` | `private, max-age=60, stale-while-revalidate=300` |
| `/api/admin/payroll` | `private, max-age=30, stale-while-revalidate=120` |
| `/api/admin/audit-log` | `private, no-cache` |

> **Var medveten om Next.js fetch-cache:** I Server Components sätter du `cache: 'no-store'`
> eller `next: { revalidate: 30 }` på `fetch()`-anrop till externa tjänster. För Supabase-klient
> (som inte går via `fetch()`) styrs detta inte av Next-cachen — använd `export const dynamic = 'force-dynamic'` på admin-pages.

### 13.3 staleTime-defaults i hooks (TanStack Query)
| Hook | staleTime |
|---|---|
| `useDemosBoard` | `15_000` |
| `useAdminSettings` | `60_000` |
| `usePayroll` | `60_000` |
| `useAuditLog` | `10_000` |

### 13.4 Demos board: virtualisera bara om kolumn > 30 kort
Annars är DOM-kostnaden lägre än virtualiserings-overhead.

### 13.5 Settings: ta bort `setQueryData` + `invalidate`
Det är redundant. Behåll bara `setQueryData` för settings, `invalidate` för payroll (där datan beror på).

### 13.6 Server Component vs Client Component-gränsen
- `page.tsx` = Server Component (default). Endast prefetch + `<HydrationBoundary>` + statisk wrapper.
- `XxxBoard.tsx`, `XxxForm.tsx`, `XxxFilters.tsx` = `'use client'` (interaktivitet/hooks).
- Säkerställ att inga server-only-imports (`lib/admin/server/*`, `audit.ts`) hamnar i client-bundle. Markera med `import 'server-only'` på toppen av varje server-fil.

---

## Fas 14 — Säkerhet, audit & migrations

### 14.1 RBAC-scopes (utöka från Bundle 01–03)

| Scope | Funktion |
|---|---|
| `demos.read` | GET demos board, GET enskild demo |
| `demos.write` | POST create, PATCH status, POST convert |
| `settings.read` | GET settings |
| `settings.write` | PATCH settings |
| `payroll.read` | GET payroll |
| `audit.read` | GET audit-log + export |
| `team.write` | POST create CM/admin (Bundle 02 redan) |

Default: `admin`-roll har alla scopes. `content_manager` har bara `demos.read` + `demos.write`, inget annat.

Implementera via en helper i Route Handlers:
```ts
// lib/admin/server/rbac.ts
import 'server-only';
export async function requireScope(req: Request, scope: AdminScope) { /* ... */ }
```

### 14.2 Audit-log obligatoriskt på alla writes

Skapa `lib/admin/audit.ts`:
```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function recordAdminAction(
  supabase: SupabaseClient,
  args: {
    actorId: string;
    actorEmail: string | null;
    actorRole: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void>;
```

Anrop från **alla** mutations i Bundle 04. Ingen direkt insert till `admin_audit_log` utanför denna helper.

### 14.3 Idempotency-tabell

```sql
create table admin_idempotency_keys (
  key text primary key,
  operation text not null,
  customer_id uuid,
  demo_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index on admin_idempotency_keys(operation, created_at desc);
```

Används av:
- `demo.convert` (Fas 6)
- `team.invite_resend` (Bundle 02 — uppdatera)
- `customer.invite_resend` (Bundle 01 — uppdatera)
- alla Stripe-syncar (Bundle 02)

TTL: 30 dagar (enkel cron-job via `pg_cron` eller Vercel Cron mot `/api/cron/...`).

### 14.4 Migrations som blockerar deploy

Innan Bundle 04 deployas:
1. `admin_idempotency_keys` (tabell)
2. `admin_convert_demo_to_customer` (RPC)
3. `v_admin_payroll_period` (view)
4. `admin_audit_log` har kolumner: `actor_email`, `actor_role`, `metadata jsonb`.
5. Permissions: `grant execute on function admin_convert_demo_to_customer to authenticated;`

Removear runtime-fallbacks i `app/api/admin/payroll/route.ts` (`source: 'customer_profiles_fallback'`) — kräver migration first.

### 14.5 Schema-warnings i UI
`schemaWarnings`-arrayen från servern är en runtime-canary för dåligt synkad migration-state. När alla migrations är applicerade ska arrayen alltid vara tom. Behåll renderingen via `<SchemaWarningBanner>` som safety-net men logga `warn`-event till Sentry/Logflare när någon visas.

---

## Per-fas testchecklista

### Fas 1 — Hooks
- [ ] Alla hooks returnerar `apiClient`-resultat utan klient-mappning
- [ ] QK matchar exakt mellan invalidate och `useQuery`
- [ ] AbortSignal kopplas via `apiClient`
- [ ] Server Component prefetchar via `<HydrationBoundary>` utan dubbel-fetch på klient

### Fas 2 — Dialog-primitiver
- [ ] `<AdminFormDialog>` rendrar identisk DOM som dagens dialogs (visuell diff = 0)
- [ ] Tre dialogs (Create/Convert/AddCM) använder den
- [ ] Inga lokala `Field`-funktioner kvar i de tre filerna

### Fas 3 — Demos derivering
- [ ] `groupDemos` exporteras inte längre från klientbundle
- [ ] DTO innehåller `nextStatus` per kort
- [ ] Klienten kan inte längre beräkna status-transitions

### Fas 4 — Demos API
- [ ] `POST /api/admin/demos` validerar med Zod, skriver audit
- [ ] `PATCH /api/admin/demos/[id]` är single-action
- [ ] RBAC blockerar non-admin från `demos.write`
- [ ] `params` awaitas (Next.js 15-konvention)

### Fas 5 — Demos page
- [ ] `app/admin/demos/page.tsx` < 80 rader
- [ ] Open-dialog-state ligger i URL (`?action=create`, `?convert=<id>`)
- [ ] Scroll-into-view fungerar med `?focus=responded`
- [ ] Server Component prefetchar; klient hydrerar utan loading-flash

### Fas 6 — Convert transaktionell
- [ ] Replay av samma idempotency-key returnerar samma customer utan dubbel insert
- [ ] Avbruten invite returnerar 200 + warning, kund finns kvar
- [ ] Concurrency-test: 2 samtidiga POST → bara 1 lyckas, 1 får `demo_already_converted`
- [ ] Audit-rad skapad

### Fas 7 — Settings
- [ ] React-hook-form + Zod validering
- [ ] Inga lokala `useState`-draftar
- [ ] PATCH skriver audit med diff
- [ ] Toast vid success, ingen permanent inline-banner
- [ ] Payroll-cache invalidateras efter spar

### Fas 8 — Payroll API
- [ ] `v_admin_payroll_period` returnerar samma värden som tidigare Node-aggregering
- [ ] Inga `customer_profiles_fallback`-rader i prod
- [ ] Cache-Control headers satta via `NextResponse`

### Fas 9 — Payroll page
- [ ] Period i URL (`?period=2026-04`)
- [ ] `<select>` triggar `router.replace`, inte setState
- [ ] Per-CM card layout identisk visuellt med tidigare

### Fas 10 — Audit-log
- [ ] Filter (actor/action/entity/datum) fungerar och persisterar i URL
- [ ] Infinite-scroll virtualiserad
- [ ] CSV-export streamar utan att ladda allt i minnet
- [ ] Rad-layout identisk visuellt

### Fas 11 — AddCMDialog
- [ ] Använder `<AdminFormDialog>` + `<AdminField>` + `TEAM_COLORS` från shared
- [ ] Zod-validering
- [ ] Invalidate `qk.team.list()` + `qk.payroll.period(null)` vid success
- [ ] `commission_rate`-fält gömt när role=admin

### Fas 12 — IA
- [ ] Settings/Payroll/Audit grupperade under `(ops)/layout.tsx` (Variant A)
- [ ] Sub-nav delas via grupp-layout
- [ ] Topp-nav uppdaterad med Ops-dropdown

### Fas 13 — Performance
- [ ] `<Link prefetch>` verifierad i Network tab
- [ ] Manuell `router.prefetch` på hover för payroll
- [ ] Cache-Control headers verifierade
- [ ] StaleTime per hook satt
- [ ] Inga server-only-moduler i client-bundle (verifiera via build output)

### Fas 14 — Säkerhet
- [ ] Alla writes går genom `recordAdminAction`
- [ ] `admin_idempotency_keys` skapad och används
- [ ] RBAC blockerar fel scope (test via Postman/curl med non-admin token)
- [ ] Schema-warnings rapporteras till logging
- [ ] Server-only-filer markerade med `import 'server-only'`

---

## Slutnot för Codex

**Kör i ordning.** Fas 1 + 2 är fundamentet — utan dem blir resten en parallell omskrivning
istället för en konvergens. Fas 6 (transaktionell convert) har **högst risk i prod**
om den slarvas — testa concurrency-fallet manuellt innan release.

**Inga nya designdecisions.** Allt visuellt finns redan i `app/admin/customers` (Bundle 01),
`app/admin` overview (Bundle 02), och `app/admin/team` (Bundle 02). Återanvänd, dela inte upp i nya
varianter.

**Inget data tappas.** Alla migrations är additiva (nya tabeller, nya views, nya RPCs).
Inga DROP eller ALTER på befintliga kolumner i denna bundle.

**Stack-bekräftelse:** Hela bundle 04 är **Next.js App Router** + Tailwind + Supabase + Stripe + TanStack Query. Inga TanStack Router / TanStack Start-primitiver används. Server Components för shells/prefetch, Client Components (`'use client'`) för interaktivitet, Route Handlers för API.
