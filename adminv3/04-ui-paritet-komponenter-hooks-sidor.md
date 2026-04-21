# 04 – UI-paritet (komponenter, hooks, sidor)

> Mål: Next.js-repots admin ska visuellt och funktionellt matcha
> Lovable-prototypen exakt. Bundlen har redan komponenter — denna fil
> beskriver per-fil-diffen som behövs för att nå paritet, plus full kod
> för moduler som saknar implementation.

## 1. Designtokens (måste matcha exakt)

Lovable-prototypens `src/index.css` definierar:

```
--background: 30 33% 97%;       /* #FAF8F5 */
--foreground: 25 14% 9%;        /* #1A1612 */
--primary: 24 53% 19%;          /* #4A2F18 */
--secondary: 28 16% 95%;
--muted-foreground: 27 13% 55%;
--accent: 30 20% 92%;
--success: 120 22% 46%;
--warning: 37 91% 55%;
--info: 217 91% 60%;
--destructive: 0 70% 48%;
--border: 24 53% 19% / 0.08;
--radius: 8px;
```

Body-typsnitt: **DM Sans** (400/500/600/700). Heading: **Georgia**.

Originalrepots `app/src/app/globals.css` har redan dessa tokens
inklusive LeTrend-specifika `--lt-*`-variabler — inga ändringar krävs
om `globals.css` kopieras från bundle 03.

`tailwind.config.ts` ska ha:

```ts
fontFamily: {
  heading: ['Georgia', 'Times New Roman', 'serif'],
  sans: ['DM Sans', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
},
```

och alla semantiska färger som `hsl(var(--xxx))`.

## 2. Layout

`components/admin/AdminLayout.tsx` (bundle 09) → matchar prototyp 1:1
(sidebar 240px, samma nav-items, footer med email + logout). **Ingen ändring**.

`app/admin/layout.tsx` (bundle 07) → ger auth-shell med rollkontroll
(`profile?.role !== 'admin'` ⇒ redirect). **Ingen ändring**.

## 3. Översiktssida (`app/admin/page.tsx`)

Bundle 08 har full implementation. Kontrollera att den läser:
- `useOverviewData()` från `hooks/admin/useOverviewData.ts` (bundle 07)
- Härleder via `deriveOverview()` från `lib/admin/overview-derive.ts`

### `lib/admin/overview-derive.ts` (komplett implementation)

> Bundlen importerar funktionen men visar inte fullständig kod. Här är
> en fullständig version som matchar prototypens beteende.

```ts
import type { OverviewPayload } from '@/hooks/admin/useOverviewData';

export type CMRow = {
  id: string;
  name: string;
  color: string;
  email: string | null;
  customers: { id: string; business_name: string }[];
  customersLastUpload: { name: string; date: string | null }[];
  activityCount: number;
  latestActivityAt: string | null;
  actualConcepts: number;
  expectedPerWeek: number;
  backlog: number;
  mrrSek: number;
};

export function deriveOverview(d: OverviewPayload) {
  const activeStatuses = new Set(['active', 'agreed']);
  const newStatuses = new Set(['active', 'agreed', 'invited']);
  const now = Date.now();
  const cutoff30 = now - 30 * 86_400_000;
  const cutoff7 = now - 7 * 86_400_000;

  const activeCustomers = d.customers.filter((c) => activeStatuses.has(c.status ?? ''));
  const mrrSek = activeCustomers.reduce((s, c) => s + Number(c.monthly_price ?? 0), 0);

  const newCustomers = d.customers.filter(
    (c) => c.created_at && new Date(c.created_at).getTime() >= cutoff30 && newStatuses.has(c.status ?? '')
  );
  const newMrrSek = newCustomers.reduce((s, c) => s + Number(c.monthly_price ?? 0), 0);

  const teamRows: CMRow[] = d.team.map((tm) => {
    const myCustomers = d.customers.filter(
      (c) =>
        (tm.profile_id && c.account_manager_profile_id === tm.profile_id) ||
        c.account_manager?.toLowerCase() === tm.name.toLowerCase()
    );
    const myActivities = d.activities.filter(
      (a) =>
        a.cm_id === tm.id ||
        a.cm_email?.toLowerCase() === tm.email?.toLowerCase()
    );
    const recent = myActivities.filter((a) => a.created_at && new Date(a.created_at).getTime() >= cutoff7);
    const conceptsAdded = recent.filter((a) => a.type === 'concept_added' || a.type === 'concept_customized').length;
    const expectedPerWeek = myCustomers.reduce((s, c) => s + (c.upload_schedule?.length ?? 0), 0);

    return {
      id: tm.id,
      name: tm.name,
      color: tm.color || '#6B4423',
      email: tm.email,
      customers: myCustomers.map((c) => ({ id: c.id, business_name: c.business_name })),
      customersLastUpload: myCustomers
        .filter((c) => c.last_upload_at)
        .sort((a, b) => new Date(b.last_upload_at!).getTime() - new Date(a.last_upload_at!).getTime())
        .slice(0, 3)
        .map((c) => ({ name: c.business_name, date: c.last_upload_at })),
      activityCount: recent.length,
      latestActivityAt: myActivities[0]?.created_at ?? null,
      actualConcepts: conceptsAdded,
      expectedPerWeek,
      backlog: Math.max(0, expectedPerWeek - conceptsAdded),
      mrrSek: myCustomers
        .filter((c) => activeStatuses.has(c.status ?? ''))
        .reduce((s, c) => s + Number(c.monthly_price ?? 0), 0),
    };
  });

  const maxActivity = Math.max(1, ...teamRows.map((r) => r.activityCount));
  const unpaidInvoices = d.invoices.filter((i) => i.status === 'open').slice(0, 8);

  return {
    mrrSek,
    activeCount: activeCustomers.length,
    newCustomerCount: newCustomers.length,
    newMrrSek,
    teamRows,
    maxActivity,
    unpaidInvoices,
  };
}
```

### `lib/admin/money.ts`

```ts
export const sekToOre = (sek: number) => Math.round(sek * 100);
export const oreToSek = (ore: number) => ore / 100;
export const formatSek = (ore: number) =>
  `${Math.round(ore / 100).toLocaleString('sv-SE')} kr`;
```

### `lib/admin/time.ts` — finns i bundle 04, använd som-är.

### `lib/admin/labels.ts` — finns i bundle 04, använd som-är.

## 4. Kundlista (`app/admin/customers/page.tsx`)

Bundle 05 har full implementation som matchar prototyp 1:1 (sök,
filter-tabs, tabell med samma kolumner och status-pills). **Ingen
ändring** behövs förutom att säkerställa att `useCustomers()` och
`useTeamMembers()` finns (bundle 01).

## 5. Kunddetalj (`components/admin/customers/CustomerDetailView.tsx`)

Bundle 08 har implementation (3300 bytes — inte fullständigt visad,
men den är där). Den ska:

1. Använda `useCustomerDetail(id)` hook (bundle 10) som hämtar:
   - `/api/admin/customers/[id]` ⇒ profile
   - `/api/admin/invoices?customer_profile_id=...&includeLineItems=true`
   - `/api/admin/customers/[id]/tiktok-stats` ⇒ stats (kan vara null)
2. Rendera samma sektioner som prototypens `CustomerDetail.tsx`:
   - Header (namn, email, TikTok-handle, status-pill)
   - **TikTok-statistik** (om stats finns): KPI-kort + ViewsScatterChart + ChartSVG för followers
   - **Avtal & Prissättning** (med inline-edit via `ContractEditForm` — bundle 05)
   - **Nästkommande faktura** (visar `monthly_price` + `<PendingInvoiceItems customerId={id} />` från bundle 04)
   - **Fakturahistorik** (data från useCustomerDetail)
   - Höger kolumn: Content Manager, Kontaktuppgifter (`ContactEditForm` bundle 10), **Åtgärder** (`<SubscriptionActions>` bundle 07)
3. Modaler: `<DiscountModal>` (bundle 10), `<ManualInvoiceModal>` (bundle 06), `<ChangeCMModal>` (bundle 01)

### `components/admin/customers/ChartSVG.tsx`

Bundle 09 har basversion med `smoothData()` och `ChartSVG`. **Lägg till**
`ViewsScatterChart` från prototypens `CustomerDetail.tsx` (rad 75–179)
exakt som-är (det är rent SVG, inga beroenden).

### `lib/customer-detail/success.ts` (NY — flyttar logik från prototyp)

```ts
export function getSuccessThresholds(followers: number) {
  if (followers < 500)   return { hit: 8000,   viral: 15000,  expected_min: 3000,  expected_max: 8000 };
  if (followers < 2000)  return { hit: 15000,  viral: 25000,  expected_min: 5000,  expected_max: 15000 };
  if (followers < 10000) return { hit: 50000,  viral: 100000, expected_min: 15000, expected_max: 50000 };
  if (followers < 50000) return { hit: 100000, viral: 200000, expected_min: 30000, expected_max: 100000 };
  return                       { hit: 250000, viral: 500000, expected_min: 75000, expected_max: 250000 };
}

export type LikeRateTier = 'poor' | 'ok' | 'good' | 'great';
export function getLikeRateTier(rate: number): LikeRateTier {
  if (rate < 2) return 'poor';
  if (rate < 4) return 'ok';
  if (rate < 7) return 'good';
  return 'great';
}
```

## 6. Billing-tabbar

Alla tre tabbar (`InvoicesTab` bundle 06, `SubscriptionsTab` bundle 04,
`HealthTab` bundle 07) matchar prototypens `Billing.tsx` 1:1.
**Ingen ändring** förutom att säkerställa att miljö-filtret skickas
korrekt och att `RefreshCw`-knappen anropar rätt sync-route.

`BillingHub.tsx` (bundle 04) hanterar tab-routing och env-filter.

## 7. Team-sidan

`app/admin/team/page.tsx` (bundle 10) matchar prototyp. Använder:
- `useTeam()` hook (bundle 06) som joinar team_members + customer_profiles + cm_activities + tiktok-summary
- `<AddCMDialog>` (bundle 03) och `<CMEditDialog>` (bundle 02)

## 8. Modaler — sammanfattning

| Modal | Bundle | Använder route |
|-------|--------|----------------|
| InviteCustomerModal | 09 | POST /api/admin/customers |
| DiscountModal | 10 | POST /api/admin/customers/[id]/discount |
| ManualInvoiceModal | 06 | POST /api/admin/invoices/create |
| ChangeCMModal | 01 | PATCH /api/admin/customers/[id] |
| AddCMDialog | 03 | POST /api/admin/team |
| CMEditDialog | 02 | PATCH /api/admin/team/[id], PATCH per kund |

## 9. Borttagning av mock-data

Originalrepot använder inte `mock-admin.ts`. Kontrollera att inga
komponenter importerar det (om kopierat från Lovable-prototypen).

## 10. Inline-fel (per LeTrend-konvention — inga toasts)

Originalkomponenterna i bundles följer redan detta. Verifiera att inga
nya toaster införs.

## Checklista

- [ ] Verifiera designtokens i `globals.css` + `tailwind.config.ts`
- [ ] Skriv `lib/admin/overview-derive.ts`, `money.ts` (om saknas)
- [ ] Skriv `lib/customer-detail/success.ts`
- [ ] Lägg `ViewsScatterChart` i `components/admin/customers/ChartSVG.tsx`
- [ ] Verifiera att `CustomerDetailView.tsx` renderar alla sektioner som prototypen
- [ ] Smoke-test varje sida visuellt mot prototyp-screenshot
- [ ] Inga toaster — bara inline-fel/varningar

Klart? Gå till `05-tiktok-integration.md`.
