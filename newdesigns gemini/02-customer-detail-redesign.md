# 02 — Customer Detail Redesign (v2)

> **Beroende:** `01-design-system-tokens.md` måste vara mergat först (StatusPill, AdminFormDialog, InlineEditField, operator-glossary).
>
> **Mål:** Från 6 tabbar → 4. Beslut samlas. Ingen info dubbleras. Studio-länken är synlig på alla tabbar. Ingen sektion är längre än ett viewport-höjd när den är primärfokus.
>
> **Skala:** 30–80 kunder. Det betyder att en kund öppnas ofta, men *bredvid en lista*. Headern måste klara att operatören snabbt kan svara: *"vem är detta, hur går det, vem äger den, vad är näst på gång?"* — utan scroll.

---

## 1. Ny tab-struktur (löser F1, F8)

| Ny tab | Route | Innehåll | Tar över från |
|--------|-------|----------|----------------|
| **Pulse** (default) | `/admin/customers/[id]` | TikTok-stats, profilkoppling, operativ status (komprimerad), Studio-genväg | Översikt |
| **Operations** | `/admin/customers/[id]/operations` | Avtal & pris, abonnemang, kontakt, CM (med temporary coverage), riskåtgärder | Avtal + Abonnemang + Team |
| **Billing** | `/admin/customers/[id]/billing` | Fakturor, kommande faktura, **Väntande poster**, krediteringar | Fakturor (oförändrad placering, ny modal — se 03) |
| **Aktivitet** | `/admin/customers/[id]/activity` | Audit-logg, snooze-historik, CM-handover, system-events | Aktivitet |

### 1.1 Routerändring (Next.js App Router)

```
app/admin/customers/[id]/
├── page.tsx                       → CustomerPulseRoute (var: CustomerOverviewPage)
├── operations/page.tsx            → CustomerOperationsRoute (NY)
├── operations/@modal/...          → kopiera mönster från subscription/@modal
├── billing/                       (oförändrad route, ny modal i 03)
├── activity/                      (oförändrad)
├── contract/page.tsx              → ersätt med 308-redirect till /operations#contract
├── subscription/page.tsx          → ersätt med 308-redirect till /operations#subscription
├── subscription/price/page.tsx    → flytta till /operations/price (eller behåll under /operations/@modal/(.)price/)
├── team/page.tsx                  → ersätt med 308-redirect till /operations#cm
├── team/change/page.tsx           → flytta till /operations/change-cm
└── layout.tsx                     → uppdaterad header + ny tab-bar
```

### 1.2 Redirects (Next.js)

I varje gammal sida (`contract/page.tsx`, `subscription/page.tsx`, `team/page.tsx`):

```tsx
import { redirect } from 'next/navigation';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/customers/${id}/operations#contract`); // resp. #subscription / #cm
}
```

Sätt `permanent: true` (308) först när PR är levd i 2+ veckor utan rapporterade bookmark-problem.

### 1.3 Uppdatera focus-map

I `app/admin/customers/[id]/page.tsx` (eller wherever focus-map lever) ersätt mappningen:

```ts
const focusMap: Record<string, string> = {
  contract:           `/admin/customers/${id}/operations#contract`,
  invoices:           `/admin/customers/${id}/billing`,
  "upcoming-invoice": `/admin/customers/${id}/billing#upcoming`,
  pending:            `/admin/customers/${id}/billing#pending`,
  operations:         `/admin/customers/${id}/operations`,
  cm:                 `/admin/customers/${id}/operations#cm`,
  activity:           `/admin/customers/${id}/activity`,
  contact:            `/admin/customers/${id}/operations#contact`,
  "tiktok-profile":   `/admin/customers/${id}#tiktok`,
  studio:             `/admin/customers/${id}#studio`,
  subscription:       `/admin/customers/${id}/operations#subscription`,
};
```

---

## 2. Ny header — kompakt, en sanning, Studio synlig (löser F3, F7, F13)

Befintlig `components/admin/customers/routes/CustomerDetailHeader.server.tsx` (rad 1152–1189) ersätts. Ny version består av:

- Rad 1: identitet (namn + status-pill + Studio-länk + högsta attention).
- Rad 2: fakta-strip (MRR, CM, nästa faktura, kund sedan, onboarding).
- Rad 3: tabbar.

`CustomerStatusPill` används från `01 §3`. `OperationalStatusSection` får **inte** längre rendera onboarding/buffer/blocking-pills i toppen av Pulse-tabben (de bor nu i headern).

### 2.1 Ny CustomerDetailHeader (server component)

```tsx
// components/admin/customers/routes/CustomerDetailHeader.server.tsx
import { ExternalLink, Sparkles } from 'lucide-react';
import { customerStatusConfig } from '@/lib/admin/labels';
import { loadAdminCustomerHeader } from '@/lib/admin/customer-detail/load';
import { formatPriceSEK } from '@/lib/admin/money';
import { shortDateSv } from '@/lib/admin/time';
import { StatusPill } from '@/components/admin/ui/StatusPill';
import { studioUrlForCustomer } from '@/lib/studio/urls';
import CustomerBackButton from './CustomerBackButton';
import CustomerHeaderAttention from './CustomerHeaderAttention';

export default async function CustomerDetailHeader({ customerId }: { customerId: string }) {
  const customer = await loadAdminCustomerHeader(customerId);
  const statusCfg = customerStatusConfig(customer.status);
  const studioHref = studioUrlForCustomer(customer); // NY helper, se §2.3

  return (
    <>
      <CustomerBackButton />

      {/* Rad 1 — identitet */}
      <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="truncate font-heading text-2xl font-bold text-foreground">
              {customer.business_name || 'Kunddetalj'}
            </h1>
            <StatusPill label={statusCfg.label} tone={statusCfg.tone} />
            {studioHref ? (
              <a
                href={studioHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                <Sparkles className="h-3 w-3 text-primary" />
                Öppna Studio
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </a>
            ) : null}
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {customer.contact_email || 'Inga kontaktuppgifter ännu'}
            {customer.customer_contact_name ? ` · ${customer.customer_contact_name}` : ''}
            {customer.tiktok_handle ? (
              <>
                {' · '}
                <a
                  href={`https://www.tiktok.com/@${customer.tiktok_handle}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >@{customer.tiktok_handle}</a>
              </>
            ) : ''}
          </p>
        </div>

        {/* Höger: enbart **högst** prioriterade attention. Inget om allt är ok. */}
        <CustomerHeaderAttention customerId={customerId} />
      </div>

      {/* Rad 2 — fakta-strip */}
      <dl className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1.5 text-xs">
        <Fact label="MRR"           value={formatPriceSEK(customer.monthly_price, { fallback: '—' })} />
        <Fact label="CM"            value={customer.account_manager_name ?? 'Ingen'} />
        <Fact label="Nästa faktura" value={shortDateSv(customer.next_invoice_date) ?? '—'} />
        <Fact label="Kund sedan"    value={shortDateSv(customer.created_at) ?? '—'} />
      </dl>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
```

### 2.2 `<CustomerHeaderAttention>` (NY, client)

Visar **endast** högst prioriterade aktiva signal. Om inget — renderas inte alls.

Prioritet (högst först): `escalated blocking` > `customer_blocked >= 3 days` > `invoice_unpaid (>0 days past due)` > `onboarding_stuck` > `cm_low_activity` > `pause_resume_due_today`.

```tsx
'use client';
import Link from 'next/link';
import { useCustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { deriveCustomerHeaderAlert } from '@/lib/admin-derive/customer-alert'; // NY
import { StatusPill } from '@/components/admin/ui/StatusPill';

export default function CustomerHeaderAttention({ customerId }: { customerId: string }) {
  const { data: customer } = useCustomerDetail(customerId);
  const alert = customer ? deriveCustomerHeaderAlert(customer) : null;
  if (!alert) return null;
  return (
    <Link
      href={alert.href}
      className="inline-flex shrink-0 items-center gap-2 rounded-md border border-status-warning-fg/20 bg-status-warning-bg px-3 py-1.5 text-xs font-semibold text-status-warning-fg hover:opacity-90"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-status-warning-fg" />
      {alert.label}
    </Link>
  );
}
```

`deriveCustomerHeaderAlert` returnerar `{ label, href, tone } | null`. Implementation: läs `customer.attention_snoozes` + derived signaler från `lib/admin-derive/index.ts`. Tone kan eskaleras till `danger` när blocking är `escalated`.

### 2.3 Studio-URL helper

```ts
// lib/studio/urls.ts (NY)
import type { CustomerHeader } from './types'; // adapt to existing CustomerDetail type

export function studioUrlForCustomer(c: { id: string; status: string }): string | null {
  // Studio är inte tillgängligt för pre-onboarding statusar.
  if (['archived', 'invited'].includes(c.status)) return null;
  return `/studio/customers/${c.id}`; // anpassa till faktisk Studio-route när den finns
}
```

Om Studio-routen inte är klar än: returnera `null` så att knappen göms automatiskt. Inga tomma länkar.

### 2.4 Ny CustomerDetailTabs

Ersätt `components/admin/customers/routes/CustomerDetailTabs.tsx` rad 1198–1205:

```tsx
const customerTabs = [
  { suffix: '',           label: 'Pulse' },
  { suffix: '/operations', label: 'Operations' },
  { suffix: '/billing',   label: 'Billing' },
  { suffix: '/activity',  label: 'Aktivitet' },
] as const;
```

Stilen byts från "rounded-full pill" till **underline-tabs** (mindre visuellt brus, känns som en panel):

```tsx
<nav className="mt-4 -mb-px flex gap-1 border-b border-border">
  {tabs.map((tab) => (
    <Link
      key={tab.href}
      href={tab.href}
      scroll={false}
      aria-current={tab.isActive ? 'page' : undefined}
      className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
        tab.isActive
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {tab.label}
    </Link>
  ))}
</nav>
```

---

## 3. Pulse-tab (default vy)

```
┌─ TikTokStatsSection (1.6fr) ──────────────────┬─ Operationspaneler (1fr) ────────┐
│ KPI-rad: 7d snitt | 30d snitt | Engage | Like │  • Onboarding-checklist          │
│ Scatter (videor 30d) | Linje (följare 30d)    │  • Senaste publicering           │
├─ TikTokProfileSection (komprimerad, wizard) ──┤  • Planerad paus / kö-status     │
│ status-rad om kopplad, wizard om inte         │  • AttentionPanel (snooze etc.)  │
└───────────────────────────────────────────────┴──────────────────────────────────┘
```

`OperationalStatusSection` (`components/admin/customers/sections/OperationalStatusSection.tsx`) ändras:

- **Stryk** raden med 3 status-pills (rad 738–767). De finns nu i headern.
- Behåll onboarding-checklistan (rad 769–789).
- Behåll publicerings-/paus-info (rad 791–800), men ersätt orden via `operator-glossary`:
  - `Senaste publicering: ... - blockerad sedan aktivering` → `Senaste publicering: ... - väntar på första publicering`.
  - `Planerad buffer till: ...` → `Planerad innehållskö till: ...`.

### 3.1 TikTokProfileSection — wizard (löser F12)

Ersätt 3-knapp-mönstret (rad 814–1057) med ett två-tillstånd:

```tsx
{customer.tiktok_handle ? (
  <ProfileLinkedRow handle={customer.tiktok_handle} linkedAt={customer.tiktok_linked_at} onUnlink={...} />
) : (
  <ProfileWizard customerId={customer.id} initialInput="" />
)}
```

`ProfileWizard` är en linjär 3-stegs-vy: **Skriv** → **Verifiera** → **Spara**. Knapparna är inte tre likvärdiga åtgärder; nästa knapp visas först när föregående steg är klart. Vid kopplad profil visas en kompakt status-rad + en låg-prio "Hämta full historik"-knapp, ingen primär CTA.

---

## 4. Operations-tab (det stora vinstdraget — löser F1, F8, F11)

Allt operativt om en kund i en sida, två kolumner.

```
┌─ Vänster (1.6fr) ────────────────┬─ Höger (1fr) ──────────────────────┐
│ ① Avtal & pris    #contract       │ ④ Content Manager     #cm           │
│   Inline-edit på pris, intervall  │   Avatar + namn + e-post            │
│   Rabatt (om finns)               │   Kommissionssats                   │
│   Nästa faktura-datum             │   [Byt CM] (öppnar @modal)/(.)cm)   │
│                                   │   Aktiv coverage (om finns)         │
│ ② Abonnemang      #subscription   │                                     │
│   Stripe-status + period          │ ⑤ Status & innehållskö              │
│   cancel_at_period_end-flagga     │   Onboarding-checklista (4 rader)   │
│   [Hantera] (öppnar drawer)       │   Senaste publicering               │
│                                   │   Planerad innehållskö / paus       │
│ ③ Kontaktuppgifter #contact       │                                     │
│   Inline-edit e-post, telefon,    │ ⑥ Riskåtgärder                      │
│   kontaktperson                   │   Pausa kund                        │
│                                   │   Arkivera                          │
│                                   │   Avsluta abonnemang nu             │
│                                   │     (rödmarkerade, kräver confirm)  │
└───────────────────────────────────┴─────────────────────────────────────┘
```

### 4.1 Skapa `app/admin/customers/[id]/operations/page.tsx`

```tsx
import { Suspense } from 'react';
import CustomerOperationsPage from '@/components/admin/customers/routes/CustomerOperationsPage.server';
import { CustomerSectionSkeleton } from '@/components/admin/customers/routes/shared';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<CustomerSectionSkeleton blocks={6} />}>
      <CustomerOperationsPage customerId={id} />
    </Suspense>
  );
}
```

### 4.2 Skapa `components/admin/customers/routes/CustomerOperationsPage.server.tsx`

Mönstra efter `CustomerSubscriptionPage.server.tsx` (bundle 8, rad 3–105). Hydrera customer + subscription + team-medlemmar via QueryClient. Rendera `<CustomerOperationsRoute customerId={id} />`.

### 4.3 Skapa `components/admin/customers/routes/CustomerOperationsRoute.tsx`

```tsx
'use client';
import { CustomerSection } from './shared';
import ContractSection         from '@/components/admin/customers/sections/ContractSection';        // NY
import SubscriptionSection     from '@/components/admin/customers/sections/SubscriptionSection';     // ersätter delar av CustomerSubscriptionActionsPanel
import ContactSection          from '@/components/admin/customers/sections/ContactSection';          // NY (extraktion från ContactEditForm)
import CmAssignmentSection     from '@/components/admin/customers/sections/CmAssignmentSection';     // NY
import ContentQueueSection     from '@/components/admin/customers/sections/ContentQueueSection';     // omdöpning av OperationalStatus delar
import RiskActionsSection      from '@/components/admin/customers/sections/RiskActionsSection';      // NY (extraktion från SubscriptionActions variant="danger")

export default function CustomerOperationsRoute({ customerId }: { customerId: string }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-6">
        <ContractSection customerId={customerId} />
        <SubscriptionSection customerId={customerId} />
        <ContactSection customerId={customerId} />
      </div>
      <div className="space-y-6">
        <CmAssignmentSection customerId={customerId} />
        <ContentQueueSection customerId={customerId} />
        <RiskActionsSection customerId={customerId} />
      </div>
    </div>
  );
}
```

### 4.4 Inline-edit för Avtal & Kontakt

Använd `<InlineEditField>` från 01 §6.

`ContractSection`:

```tsx
import { InlineEditField } from '@/components/admin/ui/form/InlineEditField';
import { useCustomerMutation } from '@/hooks/admin/useCustomerMutation';
import { oreToSek, sekToOre } from '@/lib/admin/money';

const update = useCustomerMutation(customerId, 'update_contract');

<InlineEditField
  label="Månadspris"
  value={oreToSek(customer.monthly_price ?? 0)}
  inputType="number"
  format={(v) => v == null || v === '' ? '—' : `${Number(v).toLocaleString('sv-SE')} kr`}
  parse={(raw) => sekToOre(Number(raw) || 0)}
  onSave={async (next) => { await update.mutateAsync({ monthly_price: next }); }}
  validate={(raw) => Number(raw) < 0 ? 'Priset kan inte vara negativt' : null}
/>
```

För `ContactSection`: e-post med email-validering, telefon utan strikt format, kontaktperson som ren text.

### 4.5 CM-sektionen ersätter `team`-tabben

`CmAssignmentSection` använder samma underliggande `useTeamMembers` + `useCustomerMutation` som dagens `team/page.tsx` men renderas som ett **kort** (inte hel sida). Knappen `[Byt CM]` öppnar `<ChangeCMModal>` direkt — inte en separat route. Behåll `@modal`-routen `(.)operations/change-cm/page.tsx` för deep-links.

### 4.6 SubscriptionSection — slå ihop "Snabbåtgärder" och pris-ändring

`CustomerSubscriptionActionsPanel.tsx` (bundle 7, rad 1370–1492) splittas:

- **"Ändra abonnemangspris"-länkknappen** (rad 1438–1446) ersätts av en knapp `[Hantera abonnemang]` som öppnar en `<SubscriptionManageDrawer>` (en `<Sheet>` från höger). Inuti finns: pris-ändring, cancel_at_period_end-toggle, paus-planering.
- **"Skicka ny invite"** (rad 1448–1465) flyttas in i `RiskActionsSection` när det är relevant (status `pending_*`), eftersom det är en återupplivning, inte ett vardagligt val.

Skälet: dagens "Ändra abonnemangspris" är en separat länk som öppnar en separat sida för en separat modal. För 30–80 kunder och regelbundna prisändringar är det 3 onödiga klick. Med drawern: 1 klick.

---

## 5. Billing-tabben — extra-rader och Pending charges (löser F9, F14)

Inga route-ändringar. **Två förändringar:**

### 5.1 Flytta `<PendingInvoiceItems>` till en synlig position

I `components/admin/customers/routes/CustomerBillingRoute.tsx` (bundle 7, rad 778–911) — hitta sektionen "Kommande faktura" och placera `<PendingInvoiceItems>` **direkt under** den, med ny rubrik från `OPERATOR_COPY.pendingItems`:

```tsx
<CustomerSection
  title={OPERATOR_COPY.pendingItems.sectionTitle}
  action={<AddPendingItemButton />}
>
  <p className="mb-3 text-xs text-muted-foreground">
    {OPERATOR_COPY.pendingItems.sectionSubtitle(items.length, nextInvoiceDateLabel)}
  </p>
  <PendingInvoiceItems customerId={customerId} />
</CustomerSection>
```

Visualisering i `<PendingInvoiceItems>` (`components/admin/customers/PendingInvoiceItems.tsx`): byt `EmptyState`-strängen till `OPERATOR_COPY.pendingItems.emptyTitle` + `emptyHint`, och var rad ska visa **belopp till höger, beskrivning + valfri intern not under**.

### 5.2 Lägg till "Intern anteckning" per pending-item

API-ändring krävs (se 03 §6 för krediteringsflödet — samma not-fält). I UI:

```tsx
<input placeholder="Beskrivning"  value={description} onChange={...} />
<input placeholder="Belopp (kr)"  value={amount}      onChange={...} type="number" />
<input placeholder="Intern not (visas inte för kunden)" value={note} onChange={...} />
```

Note-fältet lagras i `pending_invoice_items.internal_note` och visas under raden i grå small-text. Detta löser användarens påpekande att "en rad - pris" inte alltid är allt: ibland behövs en kort förklaring som lever med posten utan att hamna på fakturan.

### 5.3 "Skapa manuell faktura" får tydligare kontext

I `<ManualInvoiceModal>` (bundle 7, rad 404–649) lägg en informationsrad högst upp i body:

```tsx
<div className="mb-4 rounded-md bg-status-info-bg px-3 py-2 text-xs text-status-info-fg">
  Använd manuell faktura för engångsärenden som inte hör till abonnemanget.
  Behöver du lägga till en post som ska följa med nästa månadsfaktura, använd
  <strong> Väntande poster</strong> istället.
</div>
```

---

## 6. Aktivitet-tabben

Ingen strukturell ändring. Två polish:

- Använd `OPERATOR_COPY.attention.*` för att översätta `entity_type` till mänskliga namn.
- Lägg till filter "Visa endast åtgärder från CM" (för operatörens "är folk i fas?"-fråga).

---

## 7. Acceptanskriterier

- [ ] `CustomerDetailTabs` renderar exakt 4 tabbar: Pulse, Operations, Billing, Aktivitet.
- [ ] Studio-länken syns i headern på alla 4 tabbar (om `studioUrlForCustomer` returnerar non-null).
- [ ] `OperationalStatusSection` renderar **inte** längre status-pill-raden (rad 738–767 i bundle).
- [ ] Headern visar exakt **en** attention-signal (eller ingen) — inte tre pills.
- [ ] Att klicka `Operations > Hantera abonnemang` öppnar en sheet/drawer som innehåller pris, cancel, paus i en yta.
- [ ] Inline-edit fungerar på MRR och kontakt-e-post: blur eller Esc avbryter, Enter eller check-knapp sparar, fel visas under fältet.
- [ ] Routes `/contract`, `/subscription`, `/team` redirectar 308 till `/operations#...`.
- [ ] `<PendingInvoiceItems>` är synlig i Billing-tabben med rubriken "Väntande poster på nästa faktura" och stödjer intern not per rad.
- [ ] Manuell test: öppna 5 olika kunder i sekvens, mät klick från `Översikt → kund → ändra pris`. Mål: 3 klick (Översikt → kund → Operations → inline-edit pris-värde → Enter).
