# 04 — Billing & Health

> Beroende: 01 (env-band, status-system, sticky footer).
>
> Fokus: avdramatisera test/live, slå ihop fakturor + abonnemang till en sida med filter, separera Health till sub-nav.

---

## 1. Avdramatisera `Test/Live` (löser F2)

**Förändringar i `BillingShellTabs.tsx`:**

```diff
- <div className="flex gap-1 rounded-md border border-border bg-secondary p-1">
-   {envOptions.map((item) => (
-     <button ...>{envFilterLabel(item)}</button>
-   ))}
- </div>
- <nav className="mb-6 flex w-full justify-start rounded-none border-b border-border bg-transparent p-0">
+ <nav className="mb-6 flex w-full items-center justify-between border-b border-border">
+   <div className="flex">
+     {tabs.map(...)}
+   </div>
+   {/* Endast på health-tab eller när man uttryckligen behöver välja env: */}
+   {pathname === "/admin/billing/health" ? (
+     <EnvFilterChips value={effectiveEnv} onChange={updateEnv} options={['test','live']} />
+   ) : null}
+ </nav>
```

**Globalt env-band** (från 01) sköter signaleringen att man är i test. På fakturor- och abonnemangs-tabbarna är miljön implicit "all" och listas blandat med en liten `T`-tag bredvid Stripe-ID i tabellen istället för en filterpills-grupp.

```tsx
// I tabellrad, kolumn `customer`:
<div className="flex items-center gap-2">
  <span className="truncate font-medium">{invoice.customer_name}</span>
  {invoice.env === "test" ? (
    <span className="rounded-sm bg-env-test-bg px-1 py-0.5 text-[9px] font-bold uppercase text-env-test-fg">test</span>
  ) : null}
</div>
```

Detta håller miljön upptäckbar utan att vara den första saken man ser.

---

## 2. Slå ihop Subscriptions med Invoices till `/admin/billing`

Idag är `/admin/billing/invoices` och `/admin/billing/subscriptions` två routes med snarlika tabeller. De delar samma kunduniversum och delar de flesta filtren.

### Förslag

`/admin/billing` (default `?view=invoices`) blir en sida med:

```
┌─ <PageHeader> Billing ─ Stripe / fakturahantering ─────────┐
│                                                            │
│  ┌── Filtergrupp ────────────────────────────────────────┐ │
│  │ Visa: [Fakturor]  [Abonnemang]                        │ │
│  │ Status: [Alla][Obetalda][Betalda][Delvis krediterade] │ │
│  │ Sök: [_____________]    Per kund: [▾]                 │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌── Summary cards (matchar nuvarande view) ────────────┐ │
│  │ Obetalda: X kr   Betalda denna månad: X kr   Antal: N │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                            │
│  <AdminTable> (växlar mellan fakturarader och sub-rader)   │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

Health stannar på `/admin/billing/health` (en egen sida med specialregler för env).

### Routes efter

```
app/admin/billing/page.tsx              → BillingPage (?view=invoices|subscriptions)
app/admin/billing/health/page.tsx       → HealthPage (oförändrad)
app/admin/billing/invoices/page.tsx     → 308 redirect till /admin/billing?view=invoices
app/admin/billing/subscriptions/page.tsx → 308 redirect till /admin/billing?view=subscriptions
app/admin/invoices/page.tsx             → DELETE (orphan)
app/admin/subscriptions/page.tsx        → DELETE (orphan)
app/admin/billing-health/page.tsx       → DELETE (dubblett)
```

### Komponentkomposition

```
components/admin/billing/
├── BillingPageRoute.tsx          (NY — håller view-state, växlar barn)
├── invoices/InvoicesView.tsx     (gammal InvoicesRoute, oförändrad logik)
├── subscriptions/SubscriptionsView.tsx
├── shared/EnvTag.tsx             (NY — den lilla `test`/`live`-stamp)
├── shared/BillingFilterBar.tsx   (NY — view-toggle + status + sök)
└── HealthRoute.tsx
```

`view`-state hålls i URL via `useSearchParams` (nuvarande mönster i `BillingShellTabs`). Tabbar i headern är bara `Billing` resp. `Health` — view-toggle ligger i filterraden.

---

## 3. AdminTable-uppdateringar

Nuvarande `_shared/AdminTable.tsx` kommer flytta till `ui/data-display/AdminTable.tsx` (01).

Justeringar:

- **Sticky header** i tabellen (`sticky top-[topbar-höjd] bg-secondary/95 backdrop-blur`).
- **Höger-justerade belopp**: alla amount-celler tar `align: "right"`.
- **Kompakt vs. komfort**: ny prop `density="compact" | "comfortable"`. Default comfortable (var-row-y = 14 px). Compact = 8 px för listor med > 50 rader.
- **Skeleton-rader** matchar exakta kolumnbredder.

```tsx
<AdminTable<Invoice>
  density="comfortable"
  columns={invoiceColumns}
  rows={invoices}
  getHref={(inv) => `/admin/customers/${inv.customer_id}/billing/${inv.id}`}
  empty={<EmptyState icon={FileText} title="Inga fakturor matchar" hint="Justera filter eller miljö." />}
/>
```

---

## 4. `HealthRoute` — sluta dubbla felmeddelanden

Idag visas Stripe-fel både på `/billing/health` och inne i `OperationalStatusSection` på kunddetaljen. Det är ofta inkonsekvent (cache).

### Sanning på en plats

- `/billing/health` är källan för **systemnivå-fel** (webhook-fail, signature-mismatch, rate-limit).
- Customer detail visar **kund-specifika** sync-fel (en kunds Stripe customer-id saknas, en kunds TikTok-token utgått).

I `HealthRoute`:

```tsx
<div className="grid gap-stack">
  <SummaryCards />
  <Section title="Senaste misslyckade events" subtitle="Webhooks, jobs, retries">
    <RecentFailuresList />
  </Section>
  <Section title="Sync-status per kund" subtitle="Kunder med aktuella problem">
    <AdminTable rows={customersWithErrors} density="compact" ... />
  </Section>
  <Section title="Sync-logg" subtitle="Senaste 100 körningarna">
    <SyncLogList />
  </Section>
</div>
```

Per kund finns en länk `Visa kund →` i raden som hoppar till `/admin/customers/[id]?focus=cm` (eller wherever rätt åtgärd ligger).

---

## 5. Faktura-listans rader — minska bloat

Tabellen har idag 5 kolumner (`Kund | Belopp | Rader | Skapad | Status`) + actions. `Rader: 1 rad`-kolumnen är nästan alltid `1 rad` och tillför lite värde i listan.

### Ny kolumnuppsättning

| Kolumn | Width | Innehåll |
|--------|-------|----------|
| Kund | `2fr` | Namn + (om test) `<EnvTag>` |
| Belopp | `1fr` | Belopp + (om partial) `· -X kr kreditat` som xs muted |
| Period | `1fr` | "Apr 2026" (period_start eller created_at) |
| Förfaller | `1fr` | due_date · röd om passerat |
| Status | `120px` | StatusPill |
| `aktion` | `40px` | `⋯`-meny: Kopiera ID, Öppna i Stripe, Visa kund |

`Rader`-kolumnen tas bort. När fakturan har > 1 rad visas en liten "+2 rader"-tag bredvid beloppet.

---

## 6. Subscriptions-vy — komprimera dubbeltinformation

Nuvarande tabell har `Belopp · Period slutar · Avslutas · Status`. `Avslutas: Ja/Nej` och `Status: Aktiv/Trialing` säger ofta överlappande saker. Slå ihop till en *enda* statuskolumn med rik etikett:

| Status (visas) | Bakomliggande |
|----------------|---------------|
| Aktiv | active && !cancel_at_period_end |
| Aktiv · slutar 1 maj | active && cancel_at_period_end |
| Provperiod till 20 maj | trialing |
| Förfallet · 12d | past_due (visa ageing) |
| Avslutat | canceled |
| Ofullständig | incomplete |

Sätt all logik i `lib/admin/labels.ts:subscriptionStatusRich(sub)` så ingen render-kod gör om beräkningen.

---

## 7. Page-header (`PageHeader`)

Skapa en delad komponent i `ui/layout/PageHeader.tsx`:

```tsx
export function PageHeader({
  title, subtitle, actions, breadcrumbs,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  breadcrumbs?: Array<{ label: string; href?: string }>;
}) {
  return (
    <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div>
        {breadcrumbs ? <Breadcrumbs items={breadcrumbs} /> : null}
        <h1 className="font-heading text-2xl font-bold text-foreground">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
```

Använd överallt i `app/admin/**/page.tsx`. Ersätter den nuvarande adhoc-headern i `BillingShellHeader.server.tsx`, `Customers.tsx`, `Team.tsx`, `Overview`, `Demos`, `Notifications`.

---

## 8. Acceptanstest för dokument 04

- [ ] `BillingShellTabs.tsx` har inga env-knappar kvar (alla flyttade till `<EnvBand>` eller `<EnvFilterChips>` inom Health-tab).
- [ ] `/admin/billing/invoices` och `/admin/billing/subscriptions` returnerar 308.
- [ ] `/admin/billing` växlar `view` via URL-param utan tab-byte i URL.
- [ ] `RecentFailuresList` är den enda källan till systemfel (grep verifierar inom `customers/`).
- [ ] Inga `text-warning` eller `bg-warning` används direkt i komponenter — endast via `StatusPill`.
- [ ] Subscriptions-tabellen visar 4 kolumner (`Kund | Belopp | Status (rich) | aktion`) — inte 5.
- [ ] `<PageHeader>` används i alla 9 admin-toppsidor.
