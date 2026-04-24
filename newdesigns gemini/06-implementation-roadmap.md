# 06 — Implementation Roadmap (v2)

> Hur en agentisk AI (eller ett team) tar dokumenten 00–05 och faktiskt levererar dem i kontrollerade PRs utan att bryta produktionen.
>
> **Förändring från v1:** Krediteringsflödet är nu hel-faktura-primärt (PR-6 omformulerad). Test/Live blir en switch i settings + EnvBand (PR-3 omformulerad). Studio-länk i header (PR-8). PR-9 explicit Operations-tab. Inga "buffer"-strängar kvar efter PR-1/PR-2.

---

## 1. PR-sekvens

Varje PR är liten nog att granskas, stor nog att märkas. Risk-kolumnen avgör hur noggrant test krävs.

| PR | Titel | Beroenden | Filer som rörs (ungefär) | Risk |
|----|-------|------------|---------------------------|------|
| **PR-1** | Tokens, glossar & utility-mappar | — | `src/index.css`, `tailwind.config.ts`, `lib/admin/copy/operator-glossary.ts` (NY), `components/admin/ui/**` (skapas tom + re-exports) | Låg — additivt |
| **PR-2** | StatusPill + labels.ts läser från glossar | PR-1 | `components/admin/ui/StatusPill.tsx`, `lib/admin/labels.ts`, alla `statusConfig`-konsumenter, `CmPulseRow.tsx`, `CmPulseHover.tsx`, `OperationalStatusSection.tsx`, `AttentionList.tsx (SeverityPill)` | Medel — touch i många filer, men bara `className`/copy-byten |
| **PR-3** | EnvBand + nedmontering av Test/Live-toggle i Billing | PR-1 | `app/admin/layout.tsx`, `components/admin/billing/BillingShellTabs.tsx`, `components/admin/ui/EnvBand.tsx` (NY), `app/admin/(ops)/settings/page.tsx`, `hooks/admin/useEnv.ts` | Medel — global UX, men semantik är oförändrad |
| **PR-4** | AdminFormDialog (sticky footer, max-höjd, inre scroll) | PR-1 | `components/admin/ui/feedback/AdminFormDialog.tsx` (NY), opt-in migrering av små modaler (`CreateDemoDialog`, `DiscountModal`, `ConfirmActionDialog` lämnas) | Låg — komponent-nivå |
| **PR-5** | LineItemEditor + ManualInvoiceModal redesign + PendingInvoiceItems polish | PR-4 | `components/admin/ui/form/LineItemEditor.tsx` (NY), `components/admin/customers/modals/ManualInvoiceModal.tsx`, `components/admin/customers/PendingInvoiceItems.tsx` + ny `internal_note`-kolumn (DB) | Medel — DB-migration för note-fält |
| **PR-6** | **Ny krediteringsmodal: hel-faktura-primärt** | PR-4, PR-5 | `components/admin/billing/InvoiceDetailModal.tsx` (NY, ren read-vy + actions), `components/admin/billing/InvoiceCreditModal.tsx` (NY, hel-faktura primärt + "Avancerat"), borttagning av `InvoiceOperationsModal.tsx`, route-uppdatering i `CustomerInvoiceModalRoute.tsx` | **Hög** — pengaflöde, kräver e2e |
| **PR-7** | InlineEditField + Operations-tab-grund | PR-2, PR-4 | `components/admin/ui/form/InlineEditField.tsx` (NY), `app/admin/customers/[id]/operations/page.tsx` (NY), `components/admin/customers/routes/CustomerOperationsPage.server.tsx` (NY), `CustomerOperationsRoute.tsx` (NY), nya section-komponenter under `customers/sections/` | Medel — additivt, inga gamla routes flyttas än |
| **PR-8** | Customer detail header med Studio-länk + ny Pulse-tab | PR-2, PR-7 | `components/admin/customers/routes/CustomerDetailHeader.server.tsx`, `CustomerDetailTabs.tsx`, `CustomerOverviewRoute.tsx` → `CustomerPulseRoute.tsx`, `OperationalStatusSection.tsx` (stryk pill-rad), `TikTokProfileSection.tsx` (wizard-mönster), `lib/studio/urls.ts` (NY), `components/admin/customers/routes/CustomerHeaderAttention.tsx` (NY), `lib/admin-derive/customer-alert.ts` (NY) | Medel — IA-förändring för default-vyn |
| **PR-9** | Konsolidera Operations-tab (slå ihop Avtal+Abonnemang+Team) + redirects | PR-7, PR-8 | Skapa fulla section-implementationer (`ContractSection`, `SubscriptionSection`, `ContactSection`, `CmAssignmentSection`, `ContentQueueSection`, `RiskActionsSection`); ersätt `app/admin/customers/[id]/{contract,subscription,team}/page.tsx` med 308-redirects; flytta `team/change/page.tsx` till `operations/change-cm/page.tsx`; flytta pris-modalen | **Hög** — IA-förändring, breakar bookmarks (mitigeras via 308). Kommunicera internt 1 vecka innan. |
| **PR-10** | Customer-listans CustomerPulsePill ersätter 14-prick-grafen | PR-2 | `components/admin/customers/CustomersPageClient.tsx`, `components/admin/customers/CustomerPulsePill.tsx` (NY), sortering "Behöver åtgärd först" | Medel — visuellt mest synligt på Customers-sidan |
| **PR-11** | Chart-API + KPI-grid + Översikt-prio | PR-1 | `components/admin/ui/chart/**` (NY), `components/admin/overview/KpiGrid.tsx`, `components/admin/overview/CostsGrid.tsx`, `components/admin/overview/AttentionList.tsx` (omdesign med gruppering) | Medel — tar bort `customers/ChartSVG.tsx` |
| **PR-12** | Billing-konsolidering (Test/Live borta, kvarvarande städning) | PR-3 | `app/admin/billing/page.tsx`, `BillingShellTabs.tsx` (slutstädning), eventuella redirects | Låg — bygger vidare på PR-3 |
| **PR-13** | Team-page polish + WorkflowDot-tooltip + cmColorVar | PR-1 | `app/admin/team/page.tsx`, `team/TeamCustomerRow.tsx`, `mock-admin.ts`, `lib/admin/cm-color.ts` | Låg |
| **PR-14** | Empty states + mojibake-städning + dependency-rensning | — | `lib/admin/copy/*`, alla empty states, ta bort `_shared/`/`shared/`/`_primitives/` re-exports | Låg |

---

## 2. Detaljer per PR

### PR-1 — Tokens, glossar, utility-mappar

**Skapa:**
- `lib/admin/copy/operator-glossary.ts` (full innehåll i 01 §2)
- `components/admin/ui/{StatusPill,EnvBand}.tsx` som tomma stubs (riktig implementation i PR-2/PR-3)
- `components/admin/ui/feedback/` mapp
- `components/admin/ui/form/` mapp
- `components/admin/ui/chart/` mapp

**Ändra:**
- `src/index.css` — lägg till status-tokens + chart-tokens (light + dark)
- `tailwind.config.ts` — exportera `bg-status-*`, `bg-chart-*`-klasser

**Verifiering:**
- `npm run build` passerar
- En testklass `<div className="bg-status-success-bg text-status-success-fg p-2">Test</div>` renderar med rätt färg

### PR-2 — StatusPill + glossar i labels.ts

**Skapa:** `components/admin/ui/StatusPill.tsx` (full implementation i 01 §3.1)

**Ändra:**
- `lib/admin/labels.ts` — wrap `bufferLabel`, `onboardingLabel`, ny `cmStatusLabel`, `cmStatusTone` (01 §2.2)
- `components/admin/CmPulseRow.tsx` rad 988–1025 — använd `cmStatusLabel`/`cmStatusTone`, byt sub-text (01 §2.3, 05 §2.1)
- `components/admin/CmPulseHover.tsx` rad 897–918 — operator-glossary-strängar
- `components/admin/AttentionList.tsx` `SeverityPill` (rad 855–876) → `<StatusPill>`
- `components/admin/customers/routes/shared.tsx:CustomerStatusPill` → re-export `StatusPill`
- `components/admin/customers/sections/OperationalStatusSection.tsx` rad 738–767 — använd nya labels (men pill-raden flyttas i PR-8)

**Acceptansgrep:**
```bash
grep -rEi "buffer|tunna kunder|under m[åa]l|blockerad av kund|behover atgard" \
  components/ app/ lib/admin/ --include="*.ts" --include="*.tsx" | grep -v "operator-glossary"
```
Resultatet ska vara tomt (förutom själva glossariefilen och tester).

### PR-3 — EnvBand + nedmontera Test/Live-toggle

**Skapa:** `components/admin/ui/EnvBand.tsx` (01 §5.2), `components/admin/ui/EnvSwitch.tsx`

**Ändra:**
- `app/admin/layout.tsx` — montera `<EnvBand />` (01 §5.2)
- `components/admin/billing/BillingShellTabs.tsx` — stryk rad 396–413 (toggle-blocket)
- `app/admin/(ops)/settings/page.tsx` — lägg till sektion "Datakälla" med `<EnvSwitch>`

**Verifiering:** I test-läge syns gult band överst; i live-läge inget. Inga UI-strängar `env=test`/`env=live` finns kvar i `components/admin/billing/`.

### PR-4 — AdminFormDialog

**Skapa:** `components/admin/ui/feedback/AdminFormDialog.tsx` (01 §4.1)

**Ändra (opt-in migration, en modal i taget):**
- `components/admin/customers/modals/ManualInvoiceModal.tsx` — wrap i AdminFormDialog (görs i PR-5)
- `components/admin/customers/modals/ChangeCMModal.tsx` — wrap (denna PR)
- `components/admin/customers/modals/DiscountModal.tsx` — wrap (denna PR)
- `components/admin/billing/SubscriptionPriceChangeModal.tsx` — wrap (denna PR)

**Acceptanskriterium:** öppna `ChangeCMModal` på en kund med 12+ team-medlemmar vid 1366×768 fönsterhöjd. Footern med `[Avbryt][Spara]` är synlig utan scroll.

### PR-5 — LineItemEditor, ManualInvoiceModal, PendingInvoiceItems

**Skapa:** `components/admin/ui/form/LineItemEditor.tsx` (delas mellan ManualInvoice, PendingItems, Credit-replacement-items)

**Ändra:**
- `components/admin/customers/modals/ManualInvoiceModal.tsx` — wrap i AdminFormDialog (PR-4), använd LineItemEditor, lägg info-strip (02 §5.3)
- `components/admin/customers/PendingInvoiceItems.tsx` — använd LineItemEditor, lägg `internal_note`-kolumn, byt copy till `OPERATOR_COPY.pendingItems` (02 §5.1, §5.2)
- DB-migration: `pending_invoice_items` får `internal_note text null`

**Verifiering:** Skapa en pending item med en intern not. Den syns under raden i grå small-text. Den hamnar inte på Stripe-fakturan (verifiera via `stripe events list` eller motsvarande).

### PR-6 — Ny krediteringsmodal (Hög risk, kräver e2e)

**Detta är den största enskilda UX-vinsten.** Nuvarande `InvoiceOperationsModal.tsx` (bundle 3, rad 434–1059) har problemet att rad-baserad kreditering är primärflöde.

**Skapa två filer:**

#### `components/admin/billing/InvoiceDetailModal.tsx` (NY)
Ren detalj-vy. Visar: status, belopp, period, hosted_invoice_url, lines (read-only tabell), historiska kreditnotor & refunds. Knappar: `[Markera som betald]`, `[Annullera]`, `[Kreditera...]` (öppnar nästa).

#### `components/admin/billing/InvoiceCreditModal.tsx` (NY)
Tre primärflöden, exakt en synlig åt gången:

```tsx
type Mode =
  | 'full'              // primary: kreditera hel faktura
  | 'full_with_replace' // primary: kreditera + ny ersättning (vanligt vid avslut/paus → ny korrekt)
  | 'advanced_lines';   // bakom <details> "Avancerat"
```

**Layout:**

```
┌─ Krediteringskontext ──────────────────────────────────────────────┐
│ Faktura #INV-204 · 12 500 kr · Betald 2025-04-12                   │
│                                                                    │
│ ◉ Kreditera hela fakturan                          ← default       │
│   En kreditnota dras på hela beloppet.                             │
│   ☐ Skicka en ersättningsfaktura efter krediteringen               │
│     ┌─ Rader (förifyllda från originalfakturan) ──┐                │
│     │ [Beskrivning]      [Belopp kr] [×]          │                │
│     │ [Beskrivning]      [Belopp kr] [×]          │                │
│     │ [+ Lägg till rad]            [Förfaller om: 14 dagar]        │
│     └────────────────────────────────────────────┘                 │
│   ☐ Återbetala kunden  (visas om status=paid)                      │
│                                                                    │
│ ▾ Avancerat: kreditera enskilda poster                             │
│   (kollapsat by default — bara öppet om ett verkligt undantag)     │
│   - radval-tabellen från gamla flödet                              │
│                                                                    │
│ Intern anteckning (visas inte för kunden)                          │
│ [textarea]                                                         │
└────────────────────────────────────────────────────────────────────┘
[Avbryt]                                  [Kreditera hela fakturan ▸] (sticky footer)
```

**Mappning till befintlig API:**

| Mode | API-kall | Notering |
|------|----------|----------|
| `full` | `PATCH /api/admin/invoices/:id { action: 'credit_note', stripe_line_item_id: null, amount_ore: invoice.total, refund_amount_ore: status==='paid' ? invoice.total : 0, memo }` | `stripe_line_item_id: null` signalerar full kreditering. Kontrollera att backenden hanterar detta — om inte, lägg till case i `_actions/billing.ts`. |
| `full_with_replace` | `PATCH /api/admin/invoices/:id { action: 'credit_note_and_reissue', stripe_line_item_id: null, amount_ore: invoice.total, refund_amount_ore, memo, reissue_items, days_until_due }` | Samma som ovan + reissue. |
| `advanced_lines` | Befintligt rad-baserat flöde | Identiskt med dagens. |

**Backend-ändring (om saknas):** `_actions/billing.ts` måste acceptera `stripe_line_item_id: null` och då skapa en credit note via Stripe API:t mot hela fakturan (`POST /v1/credit_notes` med `invoice` parameter och utan `lines`).

**Default-läge:** `full` om fakturan är `paid` eller `open`. `advanced_lines` är bara default om operatören uttryckligen klickade "Avancerat" i en tidigare session (lagra preferens i localStorage med `letrend-credit-mode-pref`, default-falla tillbaka till `full`).

**Routes:**
- `CustomerInvoiceModalRoute.tsx` (bundle 7, rad 1248–1275) — uppdatera till att använda `InvoiceDetailModal` som öppnar `InvoiceCreditModal` via state.

**Verifiering (e2e — manuell, dokumentera i PR):**
1. Öppna en betald faktura → klicka `[Kreditera...]` → läget är `full` → klicka primär-knapp → kreditnota skapas mot hela beloppet i Stripe → refund triggas → fakturan visas som "Krediterad" i UI.
2. Öppna en obetald faktura → `[Kreditera...]` → läget är `full` → primär-knapp → kreditnota skapas, ingen refund.
3. Öppna en betald faktura → `[Kreditera...]` → bocka "Skicka ersättningsfaktura" → fyll 1 rad → primär-knapp → kreditnota + ny faktura skapas. Verifiera båda i Stripe.
4. Öppna en faktura → expandera "Avancerat" → välj en rad → kreditera → fungerar identiskt med dagens flöde.

### PR-7 — InlineEditField + Operations-tab-grund

Skapa filer enligt 02 §4. Den här PR:en lägger inte till redirects ännu — gamla `contract/`, `subscription/`, `team/`-routes finns kvar parallellt så bookmarks fungerar.

### PR-8 — Customer Detail Header med Studio-länk + Pulse-tab

Implementera 02 §2 fullt ut. **Studio-länken** är synlig endast om `studioUrlForCustomer(customer)` returnerar non-null — det betyder att första körning kan returnera `null` överallt om Studio-routen inte finns än, och länken visas inte. Det är ok.

### PR-9 — Konsolidera Operations-tab + redirects

**Detta är PR:en som breakar bookmarks** för `/admin/customers/:id/contract`, `/subscription`, `/team`. Mitigation:

- Använd `redirect()` (308) i Next.js — webbläsare och länkar respekterar det.
- Annonsera 1 vecka innan i internt Slack/forum.
- Behåll redirecten i 6 månader.

**Tabbar:** efter denna PR har `CustomerDetailTabs` 4 entries: Pulse, Operations, Billing, Aktivitet.

### PR-10 — CustomerPulsePill ersätter 14-prick-grafen

Visualiser PR:en med screenshots i PR-beskrivningen — det är den mest visuellt synliga ändringen för operatören som öppnar Customers-sidan dagligen.

### PR-11 — Chart-API + KPI + Översikt

Implementera 05 §1, §3, §4 fullt ut. Borttagningen av `customers/ChartSVG.tsx` är **sista** steget i PR:en — först byt alla call-sites, sedan ta bort filen.

### PR-12 → PR-14

Polering. Inga arkitektoniska beslut.

---

## 3. Vad varje PR ska innehålla

1. **Code-ändringar** (självklart).
2. **Visual diff** (screenshot före/efter för varje touchad sida — placera i PR-beskrivningen).
3. **Acceptanstest från respektive dokument** körd manuellt och kryssad i PR-beskrivningen.
4. **Grep-verifiering** när relevant (t.ex. PR-2 kör mojibake/buffer-grep).
5. **Backend-noteringar** vid PR-5, PR-6 om DB-migration eller API-ändring krävs.

---

## 4. Risker och mitigation

| Risk | PR | Mitigation |
|------|-----|-----------|
| Kreditering går fel i Stripe | PR-6 | Manuellt e2e-test i Stripe test-mode med 4 scenarier (se PR-6 §verifiering). Rollback-plan: behåll `InvoiceOperationsModal.tsx` i en parallell route `/admin/billing/invoices/:id/legacy` i 2 veckor. |
| Bookmarks går sönder vid IA-ändring | PR-9 | 308-redirects + 1 veckas förvarning. |
| Operatörer förvirrade av nytt språk ("buffer" → "innehållskö") | PR-2 | Skicka en 4-rads "Vad ändras?"-mail samtidigt som PR-2 mergas. |
| Performance-regression med många fakturor | PR-6 | Benchmarka modal-load på en kund med 50+ fakturor. Mål: <300 ms time-to-interactive. |
| Test/Live-band missas av operatörer som kör test-data | PR-3 | Bandet är gult, tar full bredd, sticky top. Kompletteras av en `[Test-läge]`-pill bredvid `<h1>` på alla sidor i test-läge (PR-3 §5.2). |

---

## 5. Hur en agent vet att den är klar

Kör samtliga acceptanskriterier från dokumenten 00 §6, 01 §8, 02 §7, 04 §[acceptans], 05 §9. Om alla kryssas — färdig.

För en sista smell-test, öppna admin som en operatör:
1. Klicka från Översikt → en kund med "Tyst CM-relation" → Operations → ändra något → öppna Studio.
2. Måltid: < 30 sekunder, < 6 klick, ingen scroll utanför primärt fokus.
3. Inget ord i UI:t som operatören måste fråga "vad betyder det?" om.

Om något av dessa fallerar — ta upp i nästa retro och föreslå en PR-15.
