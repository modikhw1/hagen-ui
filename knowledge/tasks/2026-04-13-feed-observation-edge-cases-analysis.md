# Feed Observation Edge Cases + Collaborative Smoke Test Plan

Datum: 2026-04-13
Baserat på: direktläsning av repo — se källreferenser per sektion

---

## 1. Confirmed current-system truth

### 1.1 `feed_order` — sekvensens sanning

`feed_order` är ett heltal som definierar positionen i en linjär innehållssekvens:

```
feed_order > 0  →  kommande / planerat
feed_order = 0  →  nu (aktuellt aktivt LeTrend-slot)
feed_order < 0  →  historik (LeTrend-historik ELLER importerad TikTok-historik)
```

Primär sanning: `feed_order`. Gridet är en vy.

### 1.2 Två distinkta typer av rader med `feed_order < 0`

```
row_kind = 'assignment', concept_id NOT NULL → LeTrend-historik
row_kind = 'imported_history', concept_id IS NULL → importerad TikTok-historik
```

Dessa delar negativa `feed_order`-utrymmet men hålls separerade av en offset-strategi
(TikTok-rader renumreras alltid nedanför LeTrend-historik-golvet).

Källa: `history-import.ts` rad 144–165, `fetch-profile-history/route.ts` rad 266–288.

### 1.3 Gridet är en deterministisk fönsterprojektion

`buildSlotMap` i `lib/feed-planner-utils.ts`:

```ts
feedOrder = gridConfig.currentSlotIndex - slotIndex - historyOffset
```

- `currentSlotIndex = 4` (mitten av 3×3) — tvingat från `DEFAULT_GRID_CONFIG` vid load,
  aldrig hämtat råt från DB (kommentar: "old 2→4 migration")
- Slot 0 (övre vänster) → `feedOrder = +4`
- Slot 4 (center) → `feedOrder = 0` (nu)
- Slot 8 (nedre höger) → `feedOrder = −4`
- `historyOffset > 0` skiftar hela fönstret djupare in i historiken

Gridet är ett 9-slots fönster över en ordnad sekvens. Det finns ingen bespoke
spatial logik bortom fönsterformeln och `historyOffset`-state.

### 1.4 Cron — observation only

**Workflow:** `.github/workflows/sync-history-all.yml`
- Schema: `cron: '0 6-17 * * 1-5'` — varje hel timme, mån–fre, 06–17 UTC
- Kallar `POST /api/studio-v2/internal/sync-history-all`
- Autentisering: `Authorization: Bearer ${{ secrets.CRON_SECRET }}`

**Vad cron gör:**
1. Hämtar eligibla kunder (status active/agreed, tiktok_handle satt, last_history_sync_at > 1h sedan)
2. Fetchar 10 senaste klipp per kund via tiktok-scraper7 / RapidAPI
3. Deduplicerar mot befintliga `tiktok_url`
4. Uppdaterar engagement-stats (views/likes/comments) på redan-importerade rader
5. Insertar nya klipp med `concept_id = null` i temporära positioner
6. Renumrerar alla importerade-historik-rader kronologiskt (nyas närmast nu)
7. Skriver motor signal om nya klipp hittades

**Vad cron INTE gör:**
- Avancerar inte planen
- Bekräftar inte att nu-konceptet är producerat
- Reconcilerar inte klipp till LeTrend-koncept automatiskt
- Ändrar inte `row_kind` på någon rad

Källa: `sync-history-all/route.ts`, `history-import.ts`.

### 1.5 advance-plan

**Vad advance-plan gör** (`advance-plan/route.ts`):
- Fas 1: Skiftar ALLA LeTrend-rader (concept_id NOT NULL) med −1
  - nu (0) → historik (−1)
  - kommande (+1) → nytt nu (0)
  - etc.
- Fas 2: Skiftar ALLA importerade TikTok-rader (concept_id IS NULL, feed_order < 0) med −1
  - Förhindrar kollision: den nye LeTrend-historik-raden landar på −1,
    utan fas 2 krockar den med TikTok-rad som redan är på −1

**Trigger:** CM bekräftar avancering efter motorns advance-cue.
**Motor signal rensas** vid advance.

### 1.6 mark-produced

**Vad mark-produced gör** (`mark-produced/route.ts`):
- Fas 1: Skiftar ALLA andra LeTrend-rader (concept_id NOT NULL, id ≠ producerad) med −1
- Fas 2: Skiftar ALLA importerade TikTok-rader (concept_id IS NULL, feed_order < 0) med −1
- Fas 3: Uppdaterar den producerade raden — sätter feed_order = −1, produced_at, tiktok_url etc.

Starkare assertion än cron: detta är en explicit produktionspåstående från CM.

### 1.7 TikTok ↔ LeTrend toggle (Slice 2.1)

- Primary UX: kontextknapp `Markera som LeTrend` / `Markera som TikTok`
- `Markera som LeTrend` → skickar `mode: 'use_now_slot'` → API letar upp
  `feed_order = 0, concept_id NOT NULL` för kunden
- Om inget nu-slot finns → öppnar fri picker automatiskt
- `Markera som TikTok` → DELETE request → rensar `reconciled_*`-fält till null
- Reconciliation skriver ALDRIG till `concept_id` eller `row_kind`
- TikTok-sanning bevaras alltid i underliggande rad

### 1.8 Motor signal — tre tillstånd

```
pending_history_advance IS NULL           → inget pending
pending_history_advance NOT NULL,
  seen_at IS NULL                         → ny evidens, visa nudge
pending_history_advance NOT NULL,
  seen_at IS NOT NULL                     → CM kvitterat, håll tyst
```

Freshness: `FRESH_ACTIVITY_THRESHOLD_DAYS = 90`. Klipp äldre än 90 dagar →
signal klassas som 'backfill'. Deriveras vid läsning, aldrig persisterats.

---

## 2. Intended product semantics

| Operation | Vem triggar | Vad det innebär |
|---|---|---|
| Cron import | GitHub Actions, varje timme | Observation — ett klipp sågs på TikTok |
| advance-plan | CM, manuellt | Planeringsavancering — CM skiftar fönstret framåt |
| mark-produced | CM, manuellt | Stark assertion — detta LeTrend-klipp producerades faktiskt |
| Markera som LeTrend | CM, manuellt | Semantisk tolkning — detta TikTok-klipp är troligen nu-konceptet |
| Markera som TikTok | CM, manuellt | Korrigering — detta var inte ett LeTrend-klipp |

Dessa fem operationer är semantiskt separerade. Ingen av dem triggar automatiskt en annan.

---

## 3. Sequence-vs-grid interpretation

**Gridet är redan korrekt implementerat som fönsterprojektion.**

`buildSlotMap` är en ren funktion: `feedOrder = currentSlotIndex − slotIndex − historyOffset`.
Det finns ingen bespoke spatial grid-logik i slot-renderingen. Varje slot renderas utifrån
sin `feedOrder` och `type` (`planned` / `current` / `history` / `empty`).

**Befintlig guard mot stale grid-config:** koden tvingar `currentSlotIndex = 4` vid varje load
oavsett vad DB har sparat — kommenterat som korrigering av "old 2→4 migration".
Detta är ett bevis på att sequence-first-tolkningen redan är institutionaliserad.

**Möjliga oddities som INTE beror på grid-bespoke-logik:**
- `historyOffset`-state är lokal i `FeedPlannerSection` — inte synkad till URL/session.
  Varje reload återgår till offset 0. Detta är rent UI-state, inte ett state-model-problem.
- Load-more debounce (500 ms) beror på `historyOffset` och `gridConfig` — korrekt
  härlett från sekvensen, inte från bespoke grid-koordinater.

**Reell risk:** Om gridet någonsin utvidgas till annan storlek (t.ex. 4×3) och `currentSlotIndex`
i DB har gammalt värde, tvingar guard korrekt till `DEFAULT_GRID_CONFIG.currentSlotIndex = 4`.
Men om grid-dimensionerna ändras utan att `currentSlotIndex` uppdateras i DEFAULT, uppstår
en off-by-one. Inte ett aktuellt problem, men att bevaka vid framtida layout-ändringar.

---

## 4. Edge-case map

### A. Cron/runtime edge cases

#### A1. Workflow inte deployed/körandes
**Starttillstånd:** workflow.yml finns i repo  
**Trigger:** workflow aldrig pushad till default branch, eller GitHub Actions disabled  
**Förväntad säker beteende:** cron körs inte, inga nya klipp importeras  
**Risk:** CM ser aldrig motor signal, tror att kunden inte postar  
**Kodbevis:** bekräftad från fil, men faktisk körningsstatus är okänd utan GitHub Actions-check  
**Testbarhet:** kontrollera GitHub → Actions → "Sync customer TikTok history" — ser man körningar?

#### A2. APP_URL mismatch
**Trigger:** `vars.APP_URL` i GitHub repo pekar på staging/lokal, inte prod  
**Risk:** cron anropar fel miljö — prod observeras inte  
**Kodbevis:** curl-kommandot i workflow använder `${{ vars.APP_URL }}` — ingen hardcoded URL  
**Testbarhet:** kontrollera repo variables i GitHub Settings

#### A3. CRON_SECRET mismatch
**Trigger:** secret i GitHub matchar inte `CRON_SECRET` env var i deployment  
**Risk:** route returnerar 401, cron misslyckas (job markeras failed i Actions)  
**Testbarhet:** kontrollera att deployment har `CRON_SECRET` satt

#### A4. RAPIDAPI_KEY saknas
**Trigger:** env var ej satt i deployment  
**Risk:** route returnerar 503 direkt — inga kunder processas  
**Kodbevis:** explicit guard rad 59 i `sync-history-all/route.ts`  
**Testbarhet:** trigga workflow_dispatch manuellt och granska Actions-log

#### A5. Kund inte eligibel
**Möjliga orsaker:**
- `status` är inte 'active' eller 'agreed' (t.ex. 'onboarding', 'prospect')
- `tiktok_handle` är null eller tom sträng
- `last_history_sync_at` < 1h sedan (nyss synkad)

**Kodbevis:** eligibility-filter i `sync-history-all/route.ts` rad 68–74  
**Testbarhet:** kontrollera `customer_profiles` direkt i DB eller via Studio admin

---

### B. Observation lag / delayed visibility

#### B1. Klipp publicerat men inte ännu synligt hos provider
**Starttillstånd:** kund laddar upp klipp på TikTok  
**Trigger:** cron körs kort efteråt  
**Vad händer:** provider returnerar inte klippet ännu (TikTok API-latens)  
**Risk:** CM förväntar sig motor signal men ser ingen — skapar förvirring  
**Nuvarande systemreaktion:** klipp importeras inte, inget motor signal, ingen felindikation  
**Under delay-fönstret:** safe att köra advance-plan/mark-produced — ingen falsk evidens finns

#### B2. Provider returnerar stale/cached data
**Risk:** `tiktok_views`, `tiktok_likes` uppdateras inte trots reell aktivitet  
**Nuvarande systemreaktion:** duplicate-klipp får stats uppdaterade vid varje sync (confirmed kod)  
**Testbarhet:** observera att engagement-stats ökar efter manual sync på ett befintligt klipp

---

### C. Imported clip är inte LeTrend

#### C1. Kundens egna klipp (ej LeTrend-samarbete)
**Starttillstånd:** importerat klipp är kundens spontana TikTok, inte LeTrend-producerat  
**Risk:** nu-slot-default antar det är LeTrend — CM kan felklassificera om de klickar utan att granska  
**Korrigeringsväg:** `Markera som TikTok` — ett klick, rensar reconciliation-fälten  
**Reversibilitetsstatus:** BEKRÄFTAD fullt reversibel  
**Kvarstående risk:** ingen batch-undo — om CM felklassificerar 5 klipp krävs 5 separata klick

#### C2. Klipp från annan period / inte senaste nu
**Risk:** nu-slot-default kan peka på en period som inte stämmer med klippets publiceringstid  
**Hantering:** CM kan alltid öppna `Välj LeTrend-koncept...` och välja rätt  
**Testbarhet:** reconcilera ett gammalt importerat klipp — bekräfta att rätt koncepttitel visas

---

### D. Planner movement collisions

#### D1. Cron import och advance-plan overlappar
**Starttillstånd:** advance-plan Fas 1+2 kör, skiftar rader  
**Trigger:** cron importerar nya rader under Fas 2 (concurrent write)  
**Risk:** ny TikTok-rad kan temporärt hamna på en `feed_order` som advance-plan inte skiftade  
**Bedömning:** transient collision möjlig, men importClipsForCustomer's renumber korrigerar
vid nästa import (re-läser ALLA rader och tilldelar om)  
**Status:** inferred concern, ej bekräftad bug — kräver timing-test i prod

#### D2. Repeteradmark-produced (CM klickar dubbelt)
**Risk:** om knappen inte döljs efter första klick kan CM trigga mark-produced två gånger  
**Effekt:** LeTrend-rader och TikTok-rader skiftas med −2 totalt  
**Testbarhet:** kontrollera om mark-produced-knappen döljs/disabled under API-anrop

#### D3. advance-plan utan föregående motor signal
**Risk:** CM kan manuellt avancera utan att cron triggat motor signal (ingen guard i route)  
**Effekt:** nu-konceptet hamnar i historik utan att ett nytt klipp faktiskt observerats  
**Bedömning:** accepterat produktbeteende — CM gör en medveten planhandling

---

### E. Saknat eller ambiguöst nu-target

#### E1. Ingen concept vid feed_order = 0
**Frontend:** `effectiveNowSlotTarget` = null → `handleMarkHistoryAsLeTrend` öppnar picker automatiskt  
**Backend:** `use_now_slot` returnerar 409 "No active now-slot LeTrend concept found"  
**Bedömning:** graceful fallback fungerar — men 409 + alert utan auto-öppen picker är en
minor UX-risk om frontend-state och backend-state är ur synk (se acceptance review risk 1)  
**Testbarhet:** ta bort nu-konceptet och klicka Markera som LeTrend

#### E2. feed_order = 0 är ett importerat TikTok-klipp (kan det hända?)
**Analys:** Ja, om ingen LeTrend-assignment finns vid feed_order = 0 men ett importerat klipp
råkat hamna där via kollision  
**Nuvarande guard:** `currentHistoryDefaultTarget` filtrerar på `isStudioAssignedCustomerConcept`
som kräver concept_id NOT NULL — importerade klipp exkluderas korrekt  
**Bedömning:** guard fungerar, fall hanteras korrekt

---

### F. Borttaget TikTok-innehåll

#### F1. Kund tar bort klipp efter import
**Systemreaktion:** importerad rad finns kvar i DB med tiktok_url som är en 404  
**Bedömning:** korrekt — observation truth ska bevaras, vi speglar inte TikTok live  
**Risk:** `tiktok_url`-länken i kontextmenyn "Öppna TikTok ↗" leder till 404  
**Testbarhet:** lågt prioritet för MVP

---

### G. Upprepade mänskliga handlingar

#### G1. Dubbel advance-plan-klick
**Bedömning:** motor signal rensas vid första advance, men advance-knappen kan fortfarande
vara synlig (beroende på UI-state). Kräver manuell verifiering av om knappen göms.

#### G2. Cron och manuell fetch-profile-history på samma kund
**Bedömning:** båda kallar `importClipsForCustomer` / liknande logik med deduplicering.
Engagement-stats skrivs dubbelt (sista skrivning vinner). Inga double-inserts pga URL-dedup.
Motor signal ackumuleras korrekt (adderar, skriver inte över).

---

## 5. Runtime/cron verification checklist

Innan man förlitar sig på hourly sync — verifiera:

- [ ] **GitHub Actions aktiverat:** gå till repo → Actions → se att "Sync customer TikTok history" är aktiv och har körningar
- [ ] **Senaste körning:** kontrollera senaste Actions-körning — lyckad? Vilken output?
- [ ] **APP_URL:** gå till repo → Settings → Variables → bekräfta att `APP_URL` pekar på rätt prod-miljö
- [ ] **CRON_SECRET:** gå till repo → Settings → Secrets — bekräfta att `CRON_SECRET` finns
- [ ] **RAPIDAPI_KEY i deployment:** kontrollera att `RAPIDAPI_KEY` env var finns i Vercel/deployment
- [ ] **Kundens status:** kontrollera i DB att test-kunden har `status = 'active'` eller `'agreed'`
- [ ] **tiktok_handle:** bekräfta att `tiktok_handle` är satt och korrekt (utan @, utan mellanslag)
- [ ] **last_history_sync_at:** kontrollera att fältet är satt och när — visar när senaste sync faktiskt körde
- [ ] **Manuell trigger:** kör workflow_dispatch från GitHub Actions UI och granska response-body

---

## 6. Collaborative smoke-test plan

### Förutsättningar

Koordinera med användaren:
- Välj en test-kund med ett känt TikTok-konto
- Bekräfta att kunden har `status = 'active'`, `tiktok_handle` satt
- Bekräfta att ett aktivt nu-slot-koncept finns (feed_order = 0)
- Bekräfta att runtime-checklistan (avsnitt 5) är grön

### Steg 1 — Baseline snapshot

Öppna Studio-workspace för testkunden. Notera:
- [ ] Hur många klipp finns i historiken idag?
- [ ] Vilket koncept är nu-slottet? (se mitten av feedplanen)
- [ ] Finns pending motor signal (orange nudge/cue)?
- [ ] Vad visar `last_history_sync_at` i DB?
- [ ] Är befintliga importerade klipp oreconcilierade eller reconcilierade?

### Steg 2 — Trigga sync

**Alternativ A: Vänta på cron (om runtime är verifierat hälsosam)**
- Vänta till nästa heltimme under veckodagsarbetstid (06–17 UTC)
- Observera om motor signal dyker upp

**Alternativ B: Manuell fetch**
- Klicka "Synka historik" / manuell fetch-profil-historik i Studio
- Notera: detta är NOT cron — men testar samma importlogik

**Alternativ C: workflow_dispatch**
- Trigga workflow manuellt från GitHub Actions
- Observera response-body i Actions-log: `{ processed, signaled, skipped, errors }`

*Notera vilket alternativ som används — det påverkar tolkningen.*

### Steg 3 — Observera ny import (om nytt klipp publicerats)

Om ett nytt TikTok-klipp nyligen publicerats av kunden:
- [ ] Visas motor signal (advance-cue) i feedplanen?
- [ ] Finns ett nytt klipp i historiken (importerat, oreconcilierat)?
- [ ] Är det senaste klippet placerat närmast nu-slottet (feed_order = −n, n liten)?
- [ ] Har planen INTE automatiskt avanserats? (bekräfta att nu-konceptet är oförändrat)

### Steg 4 — Testa Markera som LeTrend

Välj det nyast importerade TikTok-klippet:
- [ ] Öppna kontextmenyn — ser du "Markera som LeTrend" som första history-knapp?
- [ ] Klicka "Markera som LeTrend"
- [ ] Skedde reconciliation utan att picker öppnades? (bekräftar att nu-slot hittades)
- [ ] Visas "LeTrend: [nu-konceptets titel]" på kortet?
- [ ] Är nu-slottet (feed_order = 0) oförändrat — konceptet är inte flyttat?
- [ ] Klicka på det reconcilierade klippet — knappen lyder nu "Markera som TikTok"?

### Steg 5 — Testa Markera som TikTok (återställ)

- [ ] Klicka "Markera som TikTok" på det reconcilierade klippet
- [ ] "LeTrend:"-prefix försvinner från kortet?
- [ ] Knappen återgår till "Markera som LeTrend"?
- [ ] Klippets TikTok-data (views, thumbnail) är oförändrad?
- [ ] Nu-slottets koncept är oförändrat?

### Steg 6 — Testa fallback-picker

- [ ] Klicka "Välj LeTrend-koncept..." på ett oreconcilierat klipp
- [ ] Öppnas dropdown med tillgängliga LeTrend-koncept?
- [ ] Visas text om att nu-slot är normalt default?
- [ ] Välj ett annat koncept och spara — visas rätt koncepttitel på kortet?

### Steg 7 — Testa advance-plan semantik (om safe i testmiljön)

- [ ] Bekräfta att motor signal är aktivt (pending advance cue)
- [ ] Klicka "Markera och flytta" / advance-plan
- [ ] Nu-slottets koncept har rört sig till historik (feed_order = −1)?
- [ ] Nästa kommande-koncept är nu nytt nu (feed_order = 0)?
- [ ] Motor signal är rensat?
- [ ] Importerade TikTok-klipp har skiftats ett steg djupare (feed_order −1 → −2 etc.)?

---

## 7. Test matrix

| # | Scenario | Starttillstånd | Handling | Förväntat | Testbart nu? |
|---|---|---|---|---|---|
| 1 | Happy path: observerat klipp → LeTrend | Nu-slot finns, nytt klipp importerat | Markera som LeTrend | Reconciled mot nu, LeTrend-prefix på kort | Ja |
| 2 | Korrigering: LeTrend → TikTok | Klipp reconcilerat | Markera som TikTok | Reconciliation rensat, prefix borta | Ja |
| 3 | Inget nu-slot → fallback picker | feed_order=0 saknas | Markera som LeTrend | Picker öppnas automatiskt | Ja (ta bort nu-konceptet) |
| 4 | Fri konceptkoppling (secondary path) | Klipp oreconcilierat | Välj LeTrend-koncept... | Dropdown med alla koncept | Ja |
| 5 | Klipp ej synligt hos provider ännu | Klipp nyligen uppladdat | Vänta/sync | Inget nytt klipp, inget motor signal | Kräver timing |
| 6 | advance-plan efter observation | Motor signal aktivt | Advance | Fönster skiftar −1, signal rensas | Ja |
| 7 | mark-produced vs importerad historik | Nu-koncept finns | Mark produced | LeTrend-rad → −1, TikTok-rader → djupare | Ja |
| 8 | Backfill import (gamla klipp) | Kund saknar klipp, manual fetch | Kör fetch | Motor signal = 'backfill', ej 'fresh_activity' | Ja med gammal data |
| 9 | Cron inte körandes | GitHub Actions disabled | Vänta timme | Inga nya klipp trots publicering | Runtime check |
| 10 | Dubbel advance (repeated click) | Motor cue aktivt | Klicka advance 2× snabbt | Bör blockeras av disable/loading state | Manuell UI-test |

---

## 8. Open unknowns / risks

### OKänd 1 — Cron faktisk körningsstatus i prod
Kan inte bekräftas från kod. Kräver inspektion av GitHub Actions-historik.
Om cron inte kör är ingen automatisk observation aktiv.

### Okänd 2 — Provider API-latens efter publicering
Hur lång tid efter TikTok-upload syns klippet i tiktok-scraper7?
Okänt utan empirisk testning. Troligen minuter till timmar.

### Okänd 3 — Race condition vid concurrent advance + cron
Transient `feed_order`-kollision möjlig vid exakt timing. Efterföljande
renumber korrigerar det, men brief inkonsistent state kan vara synlig.
Inte bekräftad bug — inferred concern.

### Okänd 4 — Mark-produced-knappens disable-state
Om knappen inte disablas omedelbart vid klick kan dubbel mark-produced triggas.
Kräver manuell UI-inspektion.

### Okänd 5 — Batch-undo för felklassificering
Om CM felklassificerar flera klipp som LeTrend finns ingen batch-undo.
Per-klipp undo fungerar korrekt, men är opraktisk i bulk.
Inte ett blockerande problem för nuvarande MVP-scope.
