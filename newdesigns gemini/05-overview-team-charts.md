# 05 — Overview, Team & Charts (v2)

> **Beroende:** 01 (chart-tokens, StatusPill, operator-glossary), 04 (PageHeader, AdminTable).
>
> **Mål:** Ge Översikten ett tydligt svar på *"vad måste jag göra nu?"* och *"är folk i fas?"*. Konsolidera CM-vyer. Ett enhetligt chart-API. Stryk allt som är dev-prat eller inte hjälper en operatör som inte byggt produkten.
>
> **Skala:** 30–80 kunder. Det betyder att Attention-listan kan ha 5–25 rader regelbundet och måste tåla det utan att bli en vägg. Det betyder också att CM-pulsen visar 5–15 rader — den får vara informativ utan att vara en jätte-tabell.

---

## 1. Översikt — ny prioriterad ordning (löser F10, F13)

Ersätt nuvarande sekvens (KPI → CM-puls → Top attention → Costs) med:

1. **`<AttentionList>`** — överst, *grupperad per typ* med count-pill. Försvinner helt när tomt.
2. **`<KpiGrid>`** — 4 standardiserade kort.
3. **`<CmPulseSection>`** — kompakt rad-per-CM, hover för detaljer.
4. **`<CostsGrid>`** — sist, ingen prioriterad åtgärd här.

Skälet: operatörens kärnfråga *"vad måste jag agera på?"* besvaras direkt vid sidladdning. Om svaret är "inget" så ser operatören det första som finns — KPI-grid:en.

### 1.1 Ny AttentionList-layout

Idag (`components/admin/AttentionList.tsx:701–771`): platt lista. Det fungerar för 0–5 ärenden. För 5–25 vid 30–80 kunder blir det en vägg av text.

Ny struktur — gruppering per typ med kollapsbara block:

```
┌─ Behöver hanteras (12) ──────────────────────────────────────[Sortera ▾]┐
│                                                                          │
│ Obetalda fakturor (4)                                          ▾         │
│   • Acme AB · 14 dagar försenad · 12 500 kr           [Öppna]            │
│   • Beta AB · 9 dagar försenad · 4 800 kr             [Öppna]            │
│   ...2 till                                                              │
│                                                                          │
│ Tysta CM-relationer (5)                                        ▾         │
│   • Alex K → Gamma AB · senaste interaktion 11d sen   [Öppna]            │
│   ...                                                                    │
│                                                                          │
│ Onboarding fastnat (2)   ▸                                               │
│ Demo besvarad (1)        ▸                                               │
└──────────────────────────────────────────────────────────────────────────┘
```

Implementation:

```tsx
// components/admin/AttentionList.tsx — refaktor

import { OPERATOR_COPY } from '@/lib/admin/copy/operator-glossary';

const GROUP_ORDER = [
  'invoice_unpaid',
  'customer_blocked',
  'cm_low_activity',
  'onboarding_stuck',
  'cm_change_due_today',
  'pause_resume_due_today',
  'demo_responded',
  'cm_notification',
] as const;

function groupItems(items: AttentionItem[]) {
  const map = new Map<AttentionItem['kind'], AttentionItem[]>();
  for (const item of items) {
    const arr = map.get(item.kind) ?? [];
    arr.push(item);
    map.set(item.kind, arr);
  }
  return GROUP_ORDER
    .filter((kind) => map.has(kind))
    .map((kind) => ({ kind, items: map.get(kind)! }));
}
```

Varje grupp renderas som en `<details open={group.items.length <= 3}>` så att grupper med färre än 4 ärenden är öppna by default, fler är kollapsade. Operatören kan se totalen direkt (count i parentes) utan att skrolla en jätte-lista.

### 1.2 Sortera-meny

Behåll dagens `?sort=` query-param men tillåt 3 lägen i en `<Select>`:
- **Standard** (severity desc, sedan tidsstämpel desc) — default
- **Äldst först** (oldest first) — för att rensa bort gamla ärenden
- **Per CM** — gruppera först per ansvarig CM, sedan per typ. Användbart när operatören vill prata med en specifik CM om allt på en gång.

### 1.3 Tom Attention = sektionen försvinner

```tsx
if (items.length === 0) return null;
```

Om allt är ok är det starkare signal än ett grönt "allt bra"-kort. Operatören flyttar blicken nedåt till KPI:erna.

---

## 2. CM-puls — kompakt, *utan* "buffer", utan 14-prick-graf (löser F5, F6)

Det finns två CM-puls-lägen som ofta blandas ihop. Vi tydliggör dem:

- **Översiktens `<CmPulseSection>`** — en rad per CM, för admin att skanna teamet.
- **Customer-listans aktivitetsindikator** — en signal per kund, för admin att skanna kunder.

### 2.1 Översiktens CmPulseRow — uppdatera språk + minska bulk

`components/admin/CmPulseRow.tsx` (bundle 2, rad 971–1041):

**Ändring 1 — språk:** se 01 §2.3 (status-text via `cmStatusLabel`, sub-text utan "buffer").

**Ändring 2 — visuell vikt:** dagens rad har avatar (lg) + namn + sub + frequency-bar + pill. Det blir 5 visuella element per rad. För 5–15 CMs är det ok men kan stramas:

- Avatar förblir lg.
- `frequency-bar` blir tunnare (h-1 istället för h-1.5) och **bara synlig om CM har >0 kunder**.
- `pill` (status) flyttar till slutet av raden, blir den enda högertonen.
- Sub-text blir en rad: `${n_ok} i fas · ${attentionCount} att kolla in · ${customerCount} kunder`.

```tsx
// Ny sub-rad (ersätter rad 1003–1006):
<div className="text-xs text-muted-foreground">
  {aggregate.counts.n_ok} i fas
  {aggregate.counts.n_thin + aggregate.counts.n_under > 0
    ? ` · ${aggregate.counts.n_thin + aggregate.counts.n_under} att kolla in`
    : ''}
  {' · '}
  {aggregate.totalCustomers} {aggregate.totalCustomers === 1 ? 'kund' : 'kunder'}
</div>
```

**Ändring 3 — hover-card:** behåll, det är *bra* (det är användarens egna ord). Två justeringar i `CmPulseHover.tsx`:

- Stryk hela `recentPublications`-blocket (rad 927–941) på Översiktens hover. Det är detaljer som hör hemma på CM-detaljvyn, inte i en preview.
- Behåll `newCustomers`, `activeAbsence`, `Veckans tempo`, `Senaste interaktion`, och de tre count-raderna (med nya etiketter).

### 2.2 Customer-listans aktivitetsindikator — ersätt 14-prick-grafen (löser F6)

Idag: en GitHub-style 14-prick-graf per kund-rad. För 30+ kunder samtidigt blir det en vägg av prickar utan tydligt svar.

**Ny komponent:** `<CustomerPulsePill>` — en kompakt pill med tre tillstånd som besvarar "är det här ok?":

```
[ I fas ]            grön, default
[ Kolla in ]         orange, klickas för att se detaljer
[ Bör ses över ]     röd
```

Implementation:

```tsx
// components/admin/customers/CustomerPulsePill.tsx (NY)
'use client';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { StatusPill } from '@/components/admin/ui/StatusPill';
import { cmStatusLabel, cmStatusTone } from '@/lib/admin/labels';

export function CustomerPulsePill({ status, detail }: {
  status: 'ok' | 'watch' | 'needs_action' | 'away';
  detail: { lastPublishedAt: string | null; lastCmActionAt: string | null; pendingConcepts: number };
}) {
  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        <span className="inline-flex">
          <StatusPill label={cmStatusLabel(status)} tone={cmStatusTone(status)} size="xs" />
        </span>
      </HoverCardTrigger>
      <HoverCardContent side="right" className="w-72 p-3 text-xs">
        <Row label="Senaste publicering" value={detail.lastPublishedAt ?? 'Ingen ännu'} />
        <Row label="Senaste CM-åtgärd"   value={detail.lastCmActionAt ?? 'Ingen registrerad'} />
        <Row label="Inplanerade koncept" value={String(detail.pendingConcepts)} />
      </HoverCardContent>
    </HoverCard>
  );
}
```

I `CustomersPageClient.tsx`-rendreringen av kund-rader: **ta bort 14-prick-grafen** och ersätt cellen med `<CustomerPulsePill ... />`. Tabellen blir bredare (mer plats för kundnamn + CM + MRR) och statusen är direkt läsbar för 30+ rader.

### 2.3 Sorteringsalternativ för Customer-listan

Lägg till en sort-knapp `[Sortera: Behöver åtgärd först ▾]` med 3 lägen:

- **Standard** — alfabetisk på namn
- **Behöver åtgärd först** — sortera på `status` (needs_action > watch > ok)
- **Tystast först** — sortera på `lastCmActionAt` ascending

Detta är operatörens primära fråga: *vilka kunder behöver jag titta på idag?*

---

## 3. `<Chart>` — ett gemensamt API (löser F15)

Idag finns:
- `customers/ChartSVG.tsx` (linje + smoothed)
- `customers/ChartSVG.tsx:ViewsScatterChart`
- KPI-sparklines saknas

Skapa:

```
components/admin/ui/chart/
├── Chart.tsx              (huvudfacade — viewBox, padding, axes)
├── LineSeries.tsx
├── AreaSeries.tsx
├── ScatterSeries.tsx
├── Sparkline.tsx          (ingen axel, fast höjd 28px, för KpiCard)
├── Threshold.tsx          (horisontell baseline, t.ex. hit/viral)
└── chart-utils.ts         (smoothData, niceTicks, scale)
```

### 3.1 API

```tsx
<Chart height={120} xDomain={[start, end]} yDomain="auto" padding={{l:32,r:8,t:8,b:20}}>
  <LineSeries data={followers} smoothed />
  <AreaSeries data={followers} fill="chart-area-primary" />
  <Threshold y={hitThreshold} label="Hit" />
  <ScatterSeries
    points={videos}
    color={(v) => v.views >= viral ? 'chart-point-viral' : v.views >= hit ? 'chart-point-hit' : 'chart-point-default'}
    radius={(v) => Math.max(3, Math.min(10, v.views / 1000))}
    onHover={(v) => setHovered(v)}
  />
</Chart>
```

### 3.2 Visuella regler

| Aspekt | Regel |
|--------|-------|
| Bakgrund | `bg-secondary/30 rounded-lg p-3` (alla diagram-containrar) |
| Gridlinjer | `stroke="hsl(var(--chart-grid))" strokeWidth={1} strokeDasharray="2 4"` |
| Axeltext | `font-size:10` `fill="hsl(var(--chart-axis))"` |
| Linje | `stroke="hsl(var(--chart-line-primary))" strokeWidth={2} strokeLinecap="round"` |
| Smooth | samma färg, `opacity=0.4`, `strokeDasharray="4 3"` |
| Punkter | radie skalar med värde, `fill` via tone-token |
| Tooltip | popover via `floating-ui`, dark-card med xs text |
| Padding-axel | minst 8 px från kant så kvistar inte syns |

### 3.3 Sparkline (för KpiCard)

```tsx
<Sparkline data={cost.trend} height={28} className="opacity-60" />
```

Inga axlar, ingen padding, ingen tooltip. Konsumenten av KpiCard kan välja om sparkline ska visas.

### 3.4 Migrering — borttagning av `customers/ChartSVG.tsx`

1. Inventera call-sites: `grep -rEn "from .*customers/ChartSVG|ChartSVG|smoothData|ViewsScatterChart" components/ app/`.
2. Ersätt varje call med motsvarande `<Chart>` + `<LineSeries>`/`<ScatterSeries>`-komposition.
3. Ta bort `customers/ChartSVG.tsx`.

---

## 4. KPI-grid — standardiserade kort

Idag fyra kort med olika information per kort (badge bara på MRR, sub bara på Demos). Standardisera:

```tsx
<KpiCard
  icon={<DollarSign className="h-4 w-4" />}
  label="MRR"
  value={formatSek(stats.mrr * 100)}
  delta={{ value: growth.mrr * 100, label: '30d' }}
  trend={mrrTrend30d}
  href="/admin/billing/subscriptions"
/>
```

Renderingsregler:

```
┌─ icon  LABEL                     ┐
│        VALUE                      │
│        delta · sub                │
│        ───────  sparkline ─────── │
└──────────────────────────────────┘
```

Inga badges i hörnet. `delta` ligger på en egen rad, färgad via `text-status-success-fg` / `text-status-danger-fg`. Sparkline tar full bredd nederst.

---

## 5. CostsGrid — totalrad blir summary-strip

Idag: 6 service-kort + en totalrad i samma `grid-cols-3`. Totalkortet skiljer sig visuellt men placeras inkonsekvent (sista cellen).

```tsx
<Section title="Kostnader" subtitle="30 dagar">
  <div className="grid gap-3 lg:grid-cols-3">
    {costs.entries.map((cost) => (
      <CostCard key={cost.service} cost={cost} />
    ))}
  </div>
  <div className="mt-3 flex items-center justify-between rounded-md border border-border bg-secondary/40 px-4 py-3">
    <span className="text-xs uppercase tracking-wider text-muted-foreground">Totalt 30d</span>
    <span className="text-lg font-bold text-foreground">{formatSek(costs.totalOre)}</span>
  </div>
</Section>
```

Totalen blir en fristående summary-strip i full bredd nederst. `<CostCard>` får sparkline (tokens från §3).

---

## 6. Team-page

Bevara nuvarande layout (en CM per kort, kunder under). Justeringar:

### 6.1 CM-kort header

Idag har den 3 kluster: `Kunder/MRR/aktivitetsbar`. Lägg till:

- **Coverage-status** chip i headern: om CM täcker upp för någon eller är frånvarande.
- **Payroll-preview**: hover-card från MRR ska visa även denna månads förväntade payout, inte bara `~20% ersättning`.

### 6.2 Kundrader

`<TeamCustomerRow>` har idag `[2fr_1fr_1fr_1fr]` (`Kund | MRR | Följare | Flöde`). Lägg till en kolumn `Senast publicerat` (sortbar):

`Kund | MRR | Följare | Senast pub | Flöde`

`Flöde` är 3 dots — bra grafiskt språk för att visa publicerings-konsistens. Lägg till tooltip per dot: "Senaste upload: ...", "Aktiva klipp: ...", "Engagement över snitt: ...".

### 6.3 Tomma states i Team

Om en CM har 0 kunder: rendera en strikt komprimerad version (bara header, ingen kundtabell, en "Tilldela kunder"-CTA).

---

## 7. CM-färger ut till tokens

Som beskrivet i 01 §7. Konkret:

```diff
- style={{ backgroundColor: cm.color }}
+ style={{ backgroundColor: `hsl(var(--${cmColorVar(cm.id)}))` }}
```

Och i `mock-admin.ts` ta bort `color`-fältet från `TeamMember`.

---

## 8. Demos & Notifications

Båda är listor utan komplexa modaler. Justera till `<PageHeader>` + `<AdminTable>` + `<EmptyState>` mönstret. Demos-sidan får en `<KpiCard>`-rad: skickade / öppnade / konverterade.

---

## 9. Acceptanskriterier för 05

- [ ] `<AttentionList>` på Översikt grupperar per typ med count-pill; sektionen försvinner när 0 items.
- [ ] Customer-listan har **inte längre** 14-prick-grafen per rad. `<CustomerPulsePill>` har ersatt den.
- [ ] `<CmPulseRow>` använder `cmStatusLabel`/`cmStatusTone`. Sub-text säger "X i fas · Y att kolla in · N kunder" — inte "behöver mer buffer".
- [ ] `<CmPulseHover>` säger "Behöver fler koncept", "Under planerat tempo", "Väntar på kunden". Inga "Tunna kunder", "Under mal", "Blockerad av kund".
- [ ] `customers/ChartSVG.tsx` är borttagen, ersatt av `ui/chart/Chart.tsx` med `<LineSeries>`/`<ScatterSeries>`/`<Sparkline>`.
- [ ] Alla diagram delar `--chart-*`-tokens.
- [ ] KpiGrid renderar 4 strukturellt identiska kort (samma slots: icon, label, value, delta?, trend?).
- [ ] Sortera-knappen på Översikt har tre alternativ: Standard / Äldst först / Per CM.
- [ ] Customer-listan har sortering "Behöver åtgärd först".
- [ ] `mock-admin.ts:TeamMember.color` är borttagen; alla CM-avatarer använder `cmColorVar(id)`.
- [ ] Team-kort har en ny kolumn `Senast pub` och tooltip på `WorkflowDot`.
- [ ] Sparkline-höjd är 28 px överallt.
- [ ] Totalkort under Kostnader är full bredd, inte sista grid-cell.
