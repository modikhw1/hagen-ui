# 00 — Executive Summary & UX Audit (v2)

> **Vad är detta?** En filnivå-konkret redesign av LeTrend Admin (Next.js App Router). Skriven som instruktionsspec för en agentisk AI som inte ser UI:t — varje fynd har filsökvägar, radnummer, before/after-mönster och acceptanskriterier.
>
> **Skala vi optimerar för:** 30–80 aktiva kunder, ~5–15 CMs, en handfull samtidiga admin-användare. Inte 5, inte 500. Det styr densitet, virtualisering, filter och bulk-actions: vi bygger för **medeltäthet med god läsbarhet**, inte enterprise-tabeller.
>
> **Vem är användaren?** En operativ beslutsfattare (ägare/admin), inte utvecklaren som byggde dashboarden. Hen vill veta: *"Är folk i fas? Gör folk arbete? Vad måste jag agera på just nu?"* — inget mer.
>
> **Märkning:** 🟥 = kritiskt UX/visuellt, 🟧 = stor förbättring, 🟦 = polish.

---

## 1. Kärnprinciper (gäller hela redesignen)

Samtliga PRs ska kunna motiveras mot minst en av dessa. Om en ändring inte stöds av någon — gör den inte.

1. **Operatörsspråk, inte byggarens språk.** Varje etikett ska kännas naturlig för en admin som inte byggt produkten. Förbjudna ord i UI: `buffer`, `pending bucket`, `stripe_*`, råa IDs, `JSON`, `webhook`, `cron`, `env`. Tillåtet i en avgränsad **"Tekniskt"**-yta (settings/health).
2. **Beslutsfrågan styr layouten.** Översikten besvarar *"vad måste jag göra nu?"*. Kund-detaljen besvarar *"går det bra för den här kunden, och vem äger den?"*. Allt annat är referens.
3. **En källa till sanning per fakta.** Status, MRR, CM, miljö visas på *en* plats per skärm. Ingen pill upprepas i header *och* sektion.
4. **Modaler är formulär — inte sidor.** En modal har en uppgift, en primär CTA, sticky footer, max 80vh, inre scroll. Footern ska aldrig hamna under fold.
5. **Test/Live är en operatörskontext, inte en headline.** Det signaleras som ett miljöband eller en switch — aldrig i samma viktklass som sidtiteln.
6. **Aktivitetssignaler är mjuka.** Vi flaggar *"den här relationen är tyst — kolla varför"*, vi rekommenderar inte automatiskt att omfördela kunder eller ge bonus.
7. **Inga rekommendationer på tredjepartsdata på Översikt.** Kundens TikTok-utveckling och försäljning hör hemma i kundens egna stats-vy, inte i admin-Överblick.
8. **Tom data är meningsfull.** Empty states har ikon, en mening om vad det betyder, och *en* handling — eller döljs helt om "tomt = bra" (t.ex. attention-listan).

---

## 2. Toppfynd — vad operatören upplever som fel idag

| # | Problem | Var (fil:rad) | Klass |
|---|---------|---------------|-------|
| F1 | Customer-detaljen splittrar logiskt sammanhängande beslut över **6 tabbar** (Översikt / Avtal / Fakturor / Abonnemang / Team / Aktivitet) | `components/admin/customers/routes/CustomerDetailTabs.tsx:1198–1205` | 🟥 |
| F2 | Test/Live-toggle ovanför `<h1>Billing</h1>` får visuell vikt likställd med själva sidnamnet och syns på alla billing-sidor även när admin aldrig vill växla | `components/admin/billing/BillingShellTabs.tsx:394–413` | 🟥 |
| F3 | **Krediteringsflödet** tvingar admin att välja en specifik fakturarad som primär väg. För abonnemangs-cases (avslut/paus) är det fel mental modell — kreditnotan ska gälla hela fakturan med valfri ersättning | `components/admin/billing/InvoiceOperationsModal.tsx:701–1009` | 🟥 |
| F4 | **Krediteringsmodalen är tvådelad och skrollar** (vänster: rader + historik, höger: action-panel). När sidan är liten hamnar primär-CTA "Skapa kreditnota" under fold och footer-knapparna ligger separat utanför action-panelen | `components/admin/billing/InvoiceOperationsModal.tsx:726–1045` | 🟥 |
| F5 | **CmPulseRow säger "behöver mer buffer"** och CmPulseHover-modalen visar `Tunna kunder / Under mål / Blockerad av kund` — interna utvecklarord | `components/admin/CmPulseRow.tsx:1004`, `components/admin/CmPulseHover.tsx:914–918` | 🟥 |
| F6 | **Customer-listan har en GitHub-style 14-prick-aktivitetsgraf per rad** som är bulkig, svår att tolka för 30+ kunder samtidigt och inte besvarar "är det här ok eller inte" | (komponent som renderar customer-rows i `app/admin/customers/page.tsx`/`CustomersPageClient.tsx` — verifiera filnamn vid implementation) | 🟧 |
| F7 | Statuspills upprepas: i header (`CustomerDetailHeader`) och som chips i `OperationalStatusSection` (onboarding + buffer + blocking) | `components/admin/customers/routes/CustomerDetailHeader.server.tsx:1181–1185` + `components/admin/customers/sections/OperationalStatusSection.tsx:738–767` | 🟥 |
| F8 | Beslut om en kund tvingar tab-hopp: ändra pris kräver `subscription`, byta CM kräver `team`, se kontaktuppgift kräver `contract` | `app/admin/customers/[id]/{subscription,team,contract}/page.tsx` | 🟥 |
| F9 | **PendingInvoiceItems** finns men är gömd i Billing-tabben och saknar koppling till "nästa abonnemangsfaktura". Det syns inte att en post lagts till och kommer att rulla in vid periodskifte | `components/admin/customers/PendingInvoiceItems.tsx` | 🟧 |
| F10 | **Attention-rader på Översikt** har samma vikt oavsett ärendetyp; severity-pillen är liten och hamnar efter titeln. För 30–80 kunder behövs gruppering per typ + räknare | `components/admin/AttentionList.tsx:701–771` | 🟧 |
| F11 | "Ändra abonnemangspris" ligger som en **separat länkknapp** överst i Snabbåtgärder, separat från andra abonnemangs-actions | `components/admin/customers/routes/CustomerSubscriptionActionsPanel.tsx:1438–1446` | 🟧 |
| F12 | **TikTok-profil-sektionen** har 3 stora knappar (input + verifiera + spara + hämta historik) som om alla vore likvärdiga åtgärder. Beslutet är linjärt | `components/admin/customers/sections/TikTokProfileSection.tsx:830–1057` | 🟧 |
| F13 | **Studio** (det centrala kundperspektivet) har **ingen länk** från admin-customer-vyn idag | (saknas helt i `CustomerDetailHeader.server.tsx` och `CustomerOverviewRoute.tsx`) | 🟧 |
| F14 | "Skapa manuell faktura" och "Lägg till rad i kommande faktura" upplevs som två olika begrepp men löser ofta samma operativa behov (extra-rad utöver abonnemang) | `components/admin/customers/modals/ManualInvoiceModal.tsx` + `components/admin/customers/PendingInvoiceItems.tsx` | 🟦 |
| F15 | Diagram-API:t är spritt: `customers/ChartSVG.tsx` har sin egen färgskala medan KPI-sparklines saknas helt på Översikt | `components/admin/customers/ChartSVG.tsx:21–73` | 🟦 |
| F16 | Mojibake i copy (`atg\u00e4rd`, `Forsok igen`, `Behover`, `Franvarande`) syns i `CmPulseHover`, `AttentionPanel`, `error.tsx` | flera filer — full lista i 01 §9 | 🟦 |

---

## 3. Vad denna redesign **inte** gör

Tydligt avgränsat så agenten inte överbygger:

- ❌ **Ingen "omfördela kunder"-rekommendation.** Vi visar tystnad mellan CM↔kund, vi föreslår inte vem som ska ta över.
- ❌ **Ingen kund-TikTok-graf på Översikt.** Sådant bor i kundens stats-vy.
- ❌ **Ingen automatisk eskalering** baserad på TikTok-volym.
- ❌ **Ingen virtualiserad tabell.** Vi optimerar för 30–80 kunder; en standardtabell med klientsortering räcker.
- ❌ **Inga bulk-actions** (markera flera kunder, multi-edit). Inte i scope.
- ❌ **Ingen rad-för-rad kreditering som primärflöde.** Bevaras som "Avancerat"-undantag.
- ❌ **Ingen dev-info på huvudvyer.** Sync health, raw IDs, JSON, webhook-status flyttas till en `Tekniskt`-sektion under settings/ops.

---

## 4. Glossar — operatörsspråk vs internt

Varje agent som rör copy ska kontrollera mot denna tabell. Internt ord i UI = bug.

| Internt / förbjudet | Operatörsspråk (svenska) | Operatörsspråk (engelska) | Var används det idag |
|---------------------|--------------------------|---------------------------|----------------------|
| Buffer | Innehållskö / I fas | Content queue / On track | `CmPulseRow:1004`, `OperationalStatusSection:750`, `bufferLabel()` i `lib/admin/labels.ts` |
| Pending bucket / Pending charges | Väntande poster (rullar in på nästa faktura) | Pending charges | `PendingInvoiceItems.tsx` |
| Tunna kunder | Behöver fler koncept | Needs more concepts | `CmPulseHover:916` |
| Under mål | Under planerat tempo | Below planned pace | `CmPulseHover:917` |
| Blockerad av kund | Väntar på kunden | Waiting on customer | `CmPulseHover:918` |
| Bevaka | Tysta relationer / Kolla in | Check in | `CmPulseRow`, `cm-pulse.ts` status |
| Behöver åtgärd | Bör ses över | Needs review | `CmPulseRow`/`CmPulseHover` |
| Frånvarande | På semester / Frånvarande | On leave | OK i UI, behåll |
| Fakturarad / line item | Post på fakturan | Invoice item | InvoiceOperationsModal |
| Webhook fail / Sync log | Synkproblem (kontakta tekniskt ansvarig) | Sync issue | Health-vyn |

---

## 5. Roadmap-överblick

Full sekvens i `06-implementation-roadmap.md`. Sammanfattning av vad varje dokument styr:

| Dok | Ansvar | Drivande beslut |
|-----|--------|-----------------|
| 01 | Design system & tokens | Operatörsspråk i `labels.ts`, status-tokens, modal-mönster, EnvBand, "buffer" → "innehållskö" |
| 02 | Customer Detail | 6 tabbar → 4 (Pulse / Operations / Billing / Aktivitet). Studio-länk i header. Inline-edit för pris/kontakt. |
| 03 | Modaler | Sticky footer, max 80vh + inre scroll. **Ny krediteringsmodal**: hel-faktura-flöde primärt, rad-flöde under "Avancerat". CM-modal städad (ingen "lägg till med länk"-knapp). |
| 04 | Billing & Health | Test/Live blir en switch i settings, EnvBand på topp, Sync health flyttas till `Tekniskt` |
| 05 | Översikt, Team & Charts | Attention-list som operativ kö, kompakt CM-puls (utan "buffer", utan 14-prick-graf), gemensamt Chart-API |
| 06 | Roadmap | 14 PRs, sekvens, risker, verifiering |

---

## 6. Acceptanskriterier för hela redesignen

En agent som hävdar att redesignen är klar måste kunna kryssa varje punkt. Verifieras manuellt + via grep.

- [ ] Inga UI-strängar innehåller `buffer`, `pending bucket`, `tunna kunder`, `under mal`, `blockerad av kund`, `Behover atgard`. Verifiera med:
  `grep -rEi "buffer|pending bucket|tunna kunder|under m[åa]l|blockerad av kund|behover atgard" components/ app/ lib/admin/copy/ lib/admin/labels.ts`
- [ ] CustomerDetailTabs har **4** entries, inte 6.
- [ ] CustomerDetailHeader visar **Studio-länken** synlig på alla customer-tabbar.
- [ ] InvoiceOperationsModal är ersatt av en ny modal där primär-CTA är **"Kreditera hel faktura"** med valbar ersättningsfaktura. "Kreditera enskild rad" finns endast under en `<details>` "Avancerat".
- [ ] Alla `<DialogContent>` med inre formulär har `max-h-[80vh] flex flex-col`, header och footer som är `shrink-0`, body som är `flex-1 overflow-y-auto`.
- [ ] Test/Live-toggeln i `BillingShellTabs.tsx` är borttagen. Miljöväxling sker via `EnvBand` (settings) eller via `useEnv()`-switch i ops-sektionen.
- [ ] CmPulseRow visar inte längre "behöver mer buffer". Etiketten är `${aggregate.counts.n_ok} i fas · ${X} att kolla in`.
- [ ] Customer-listan har bytt 14-prick-grafen mot en kompaktare statussignal (mini-meter eller en `Pulse`-pill med hover-detalj).
- [ ] Översikt har Attention-listan högst upp, grupperad per typ med count-pill.
- [ ] Inga referenser till `Stripe`, `Stripe-status`, `webhook`, `pg_cron`, `JSON` finns i någon sida utanför `app/admin/(ops)/settings/` eller `health/`-sektionen.
- [ ] PendingInvoiceItems heter "Väntande poster på nästa faktura" i UI och visas som ett kort under abonnemangs-sektionen i Operations-tabben (inte gömt under Billing).

---

## 7. Övergripande tidsuppskattning

För en agent som följer 06-roadmapen i sekvens:

- **Snabb vinst (1–3 PRs):** Modal-fix (sticky footer), copy-städning ("buffer" → "innehållskö"), Test/Live nedmontering. → märkbar förbättring för operatören efter ~2 dagar.
- **Strukturell vinst (PR 4–9):** Ny krediteringsmodal, ny CustomerDetail-IA (4 tabbar + Studio-länk), inline-edit. → ~1–2 veckor.
- **Polish (PR 10–14):** Chart-API, CM-puls polish, empty states, mojibake-cleanup. → ~1 vecka.

Total: ~4 veckor solo-arbete eller ~2 veckor i par.
