# Plan 11 — Confirmation Engine

**Status**: Audit complete. Implementering ej påbörjad.
**Fas**: 7 — Kartlägg entrypoints, definiera service-kontrakt, skriv implementeringsplan.
**Constraint**: Inga irreversibla timeline-advances implementeras i denna fas.

---

## 1. Domänbakgrund

En "konfirmering" i LeTrend-kontexten är handlingen att koppla ett **TikTok-klipp** (en `customer_concepts`-rad med `concept_id = null`, kallad *imported_history*) till ett **LeTrend-kort** (en `customer_concepts`-rad med `concept_id IS NOT NULL`, kallad *assignment*). Kopplingen dokumenterar att klippet är det faktiska TikTok-resultatet av det planerade konceptet.

Konfirmeringen kan medföra eller inte medföra en **advance** — att planens nu-slot stämplas som producerad och tidlinjen skiftas framåt. Dessa är logiskt separata operationer som idag utförs inkonsekvent och med duplicerad kod.

---

## 2. Entrypoint-karta (nuläge)

Totalt identifierade: **10 entrypoints** (6 API, 4 frontend-triggers).

### EP-1 — POST `/api/studio-v2/reconciliation-candidates/:candidateId/accept`
**Fil**: `artifacts/api-server/src/routes/studio-v2.ts:1684`
**Trigger**: CM accepterar ett förslag i kandidatpanelen (FeedSlot UI).
**Vad den gör**:
1. Hämtar candidate-rad, validerar tillhörighet.
2. Anropar privat helper `applyReconciliationLink` → skriver länk + propagerar stats.
3. Anropar `markCandidateAcceptedForLink` → sätter status `accepted` + avvisar konkurrerande kandidater.
**Advance**: ❌ Ingen.
**Kandidatstatus**: ✅ Uppdateras (fatalt om det misslyckas).

### EP-2 — POST `/api/studio-v2/history/reconciliation`
**Fil**: `artifacts/api-server/src/routes/studio-v2.ts:1316`
**Trigger**: CM klickar "Länka till nu-slot" (MarkProducedDialog) eller väljer manuellt i reconciliation-picker (FeedSlot).
**Vad den gör**:
1. Löser upp target: `mode=use_now_slot` → hämtar feed_order=0-assignment; `mode=manual` → använder explicit `linked_customer_concept_id`.
2. Validerar att target tillhör samma kund och är en assignment-rad.
3. Skriver `reconciled_customer_concept_id`, `reconciled_by_cm_id`, `reconciled_at` på history-raden.
4. Propagerar stats (thumbnail, url, views, likes, comments, published_at) till assignment-raden.
5. Best-effort `markCandidateAcceptedForLink`.
**Advance**: ❌ Ingen.
**Kandidatstatus**: ⚠️ Best-effort (ej fatalt).

### EP-3 — DELETE `/api/studio-v2/history/reconciliation`
**Fil**: `artifacts/api-server/src/routes/studio-v2.ts:1456`
**Trigger**: CM ångrar en existerande länk ("Ta bort koppling").
**Vad den gör**:
1. Rensar `reconciled_customer_concept_id`, `reconciled_by_cm_id`, `reconciled_at`.
2. Rensar stats från assignment-raden (thumbnail, url, views, likes, comments, published_at).
3. Best-effort `resetCandidateAfterUndo` → återställer kandidatstatus till `suggested`.
**Advance**: ❌ Återställer INTE advance (avsiktligt — advance är irreversibel by design).
**Kandidatstatus**: ⚠️ Best-effort.

### EP-4 — POST `/api/studio-v2/feed/mark-produced`
**Fil**: `artifacts/api-server/src/routes/studio-v2.ts:992`
**Trigger**: CM skickar MarkProducedDialog utan att länka ett TikTok-klipp (manuell produkt-markering, ev. med inskriven TikTok-url).
**Vad den gör**:
1. Optimistiskt lås (`pending_history_advance_at`).
2. Anropar `advance_customer_feed_plan` RPC (advance + timeline-shift atomärt).
3. Rensar öppna motor-signaler för kunden.
4. Returnerar den producerade assignment-raden.
**Advance**: ✅ Alltid.
**Länk**: ❌ Ingen (ingen history-rad kopplas).
**Kandidatstatus**: ❌ Ingen uppdatering.

### EP-5 — tiktok-sync.ts inline auto-reconcile
**Fil**: `artifacts/api-server/src/lib/studio/tiktok-sync.ts:655–729`
**Trigger**: API-server TikTok-sync (cron eller manuell); aktiveras när `totalImported === 1`.
**Vad den gör**:
1. Hämtar nu-slot (feed_order=0, concept_id IS NOT NULL).
2. Guard: hoppar över om nu-slot redan har en länkad history-rad.
3. Skriver `reconciled_customer_concept_id` + `reconciled_at` (reconciled_by_cm_id = null = system).
4. Propagerar stats till assignment-raden.
5. Best-effort `markCandidateAcceptedForLink(auto:true)`.
**Advance**: ❌ Ingen (nudge-signal skapas separat; CM måste bekräfta via handleCheckAndMarkProduced).
**Kandidatstatus**: ⚠️ Best-effort.

### EP-6 — autoReconcileAndAdvance (syncCustomerHistory)
**Fil**: `artifacts/letrend/src/lib/studio/auto-reconcile.ts`
**Trigger**: `syncCustomerHistory` med `mode='mark_produced'`; aktiveras när ett nytt klipp importerades.
**Vad den gör**:
1. Guard: tom feed → avbryt.
2. Hämtar nu-slot (feed_order=0).
3. Hämtar senaste orekonsilierade importerade klipp (ORDER BY published_at DESC).
4. Skriver `reconciled_customer_concept_id` + `reconciled_at` (system-länk).
5. Anropar `performMarkProduced` → `advance_customer_feed_plan` RPC.
6. Sätter `feed_order = null` på klippet + renumber.
**Advance**: ✅ Alltid (irreversibelt).
**Stats-propagering till assignment**: ❌ Saknas (tiktok-sync-varianten propagerar; denna gör det inte).
**Kandidatstatus**: ❌ Ingen uppdatering.

### EP-7 — handleCheckAndMarkProduced (CWC)
**Fil**: `artifacts/letrend/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx:1759`
**Trigger**: CM klickar "Markera som gjord"-knappen på nu-kortet.
**Vad den gör**: POST `/customers/:id/fetch-profile-history` → om `imported > 0`, hanterar EP-6 internt → cache-rensning + refetch.
**Notering**: Frontend-trigger för EP-6; advance sker inuti sync, inte explicit här.

### EP-8 — handleMarkHistoryAsLeTrend (FeedSlot)
**Fil**: `artifacts/letrend/src/components/studio/customer-detail/FeedSlot.tsx:365–373`
**Trigger**: CM klickar "Länka till nu"-knapp på importerat history-kort.
**Vad den gör**: Anropar `onReconcileHistory(concept.id, { mode: 'use_now_slot' })` → delegerar till EP-2.

### EP-9 — MarkProducedDialog → onMarkProduced
**Fil**: CWC `handleMarkProduced` → POST `/feed/mark-produced` → EP-4.
**Trigger**: CM skickar dialog utan att välja ett importerat klipp.

### EP-10 — MarkProducedDialog → onReconcileHistory
**Fil**: CWC `handleReconcileHistory` → POST `/history/reconciliation` → EP-2.
**Trigger**: CM väljer ett importerat klipp i MarkProducedDialog-droplisten.

---

## 3. Duplicerad logik — problemanalys

### Problem A: Länk + stats-propagering duplicerad på tre ställen

| Plats | Rad | Länk-skrivning | Stats-prop | Kandidatstatus |
|---|---|---|---|---|
| `applyReconciliationLink` (EP-1) | studio-v2.ts:1553 | ✅ | ✅ | Via `markCandidateAcceptedForLink` (caller) |
| POST /history/reconciliation (EP-2) | studio-v2.ts:1407 | ✅ | ✅ | ⚠️ best-effort |
| tiktok-sync.ts inline (EP-5) | tiktok-sync.ts:687 | ✅ | ✅ | ⚠️ best-effort |

`applyReconciliationLink` skapades för att minska duplicering mellan EP-1 och EP-2, men EP-2 kopierades inte om att använda den — de delar fortfarande separat implementering.

### Problem B: autoReconcileAndAdvance saknar stats-propagering

EP-6 (`autoReconcileAndAdvance`) skriver länken men propagerar **inte** stats (thumbnail, url, views etc.) till assignment-raden. EP-5 (tiktok-sync inline) gör det. Inkonsistens: det beror på vilken kodväg som triggas om assignment-raden får rätt data.

### Problem C: Advance sker på två ställen med delvis överlappande logik

| Kodväg | Fil | Lås | RPC | Motor-signals | Renumber |
|---|---|---|---|---|---|
| EP-4 (mark-produced route) | studio-v2.ts:992 | ✅ `pending_history_advance_at` | ✅ | ✅ rensas | ❌ |
| EP-6 (autoReconcileAndAdvance) | auto-reconcile.ts:134 | ❌ | ✅ via performMarkProduced | ❌ | ✅ |

EP-6 saknar optimistiskt lås och rensning av motor-signaler. EP-4 saknar renumbering av importerade rader.

### Problem D: Kandidatstatus inkonsistent

| Entrypoint | Uppdaterar kandidatstatus? | Felhantering |
|---|---|---|
| EP-1 (candidate accept) | ✅ | Fatal |
| EP-2 (history reconciliation) | ⚠️ best-effort | Ej fatal |
| EP-5 (tiktok-sync auto) | ⚠️ best-effort | Ej fatal |
| EP-6 (autoReconcileAndAdvance) | ❌ aldrig | — |
| EP-4 (mark-produced route) | ❌ aldrig | — |

---

## 4. Föreslagen service: `confirmPublishedConcept`

### Signatur

```typescript
// artifacts/api-server/src/lib/studio/confirm-published-concept.ts

export type ConfirmSource =
  | 'candidate_accept'      // EP-1: CM accepterar ett kandidatförslag
  | 'history_use_now_slot'  // EP-2 mode=use_now_slot
  | 'history_manual'        // EP-2 mode=manual
  | 'auto_sync'             // EP-5: tiktok-sync auto-link (ingen advance)
  | 'auto_sync_advance'     // EP-6: autoReconcileAndAdvance (alltid advance)
  | 'mark_produced_dialog'; // EP-10: MarkProducedDialog-picker

export type AdvanceMode =
  | 'link_only'           // Koppla klipp till LeT-kort, ingen advance
  | 'auto_if_now_slot'    // Advance om target.feed_order === 0 (framtida)
  | 'force_advance';      // Advance alltid (EP-6)

export interface ConfirmPublishedConceptInput {
  supabase: SupabaseAdmin;
  customerId: string;
  historyConceptId: string;           // imported_history-rad (concept_id IS NULL)
  targetCustomerConceptId: string;    // assignment-rad (concept_id IS NOT NULL)
  actorId: string | null;             // null = system-aktion, ej CM
  source: ConfirmSource;
  advanceMode: AdvanceMode;
  now: string;                        // ISO-timestamp (caller ansvarar)
}

export interface ConfirmPublishedConceptResult {
  linked: boolean;
  advanced: boolean;
  candidateUpdated: boolean;
  warnings: string[];   // icke-fatala fel (loggas men bryter ej flödet)
  error?: string;       // fatalt fel — operation ska rullas tillbaka
}
```

### Steg-för-steg (inuti servicen)

```
1. VALIDATE
   - historyRow: customer_profile_id == customerId, concept_id IS NULL
   - targetRow: customer_profile_id == customerId, concept_id IS NOT NULL
   - Om validering misslyckas → return { error, linked: false, advanced: false, ... }

2. LINK
   UPDATE customer_concepts SET
     reconciled_customer_concept_id = targetCustomerConceptId,
     reconciled_by_cm_id            = actorId,      -- null om system
     reconciled_at                  = now
   WHERE id = historyConceptId
   → Om fel: return { error, ... }

3. PROPAGATE STATS
   SELECT tiktok_thumbnail_url, tiktok_url, tiktok_views, tiktok_likes,
          tiktok_comments, published_at
   FROM customer_concepts WHERE id = historyConceptId
   
   UPDATE customer_concepts SET <non-null fields>
   WHERE id = targetCustomerConceptId
   → Om fel: warnings.push(err.message) — ej fatalt

4. CANDIDATE STATUS
   markCandidateAcceptedForLink(supabase, historyConceptId, targetConceptId,
     { customerId, actorId, now, auto: actorId === null })
   → Om fel: warnings.push(err.message) — ej fatalt (best-effort)
   → candidateUpdated = markResult.ok

5. ADVANCE (villkorligt)
   Om advanceMode === 'link_only': hoppa över, gå till steg 6.
   
   Om advanceMode === 'force_advance' ELLER
      (advanceMode === 'auto_if_now_slot' OCH targetRow.feed_order === 0):
   
   a. Optimistiskt lås: UPDATE customer_profiles
      SET pending_history_advance_at = now
      WHERE id = customerId AND pending_history_advance_at IS NULL
      → Om låset ej erhölls: return { error: 'already_locked', ... }
   
   b. advance_customer_feed_plan RPC (p_concept_id = targetCustomerConceptId)
      → Om error_code: return { error, ... }
   
   c. Rensa motor-signaler:
      UPDATE feed_motor_signals SET auto_resolved_at = now
      WHERE customer_id = customerId
        AND acknowledged_at IS NULL AND auto_resolved_at IS NULL
      → Om fel: warnings.push(err.message)
   
   d. Renumber importerade rader (renumberImportedRows)
   e. Frigör lås: UPDATE customer_profiles SET pending_history_advance_at = null
   f. advanced = true

6. RETURN
   { linked: true, advanced, candidateUpdated, warnings }
```

### Kompletterande: `undoConfirmedConcept`

```typescript
export interface UndoConfirmedConceptInput {
  supabase: SupabaseAdmin;
  historyConceptId: string;
  actorId: string;
  now: string;
}

// Steg:
// 1. Hämta nuvarande reconciled_customer_concept_id från historyRow
// 2. Rensa länkfält (reconciled_customer_concept_id, reconciled_by_cm_id, reconciled_at)
// 3. Rensa stats från assignment-raden (tiktok_thumbnail_url osv.)
//    Guard: .eq('customer_profile_id', historyRow.customer_profile_id) — aldrig fel kund
// 4. best-effort resetCandidateAfterUndo
// 5. Advance återställs INTE (irreversibelt by design)
```

---

## 5. Refactoring-plan (sekventiell, per fil)

### Steg 1 — Skapa `confirm-published-concept.ts`

**Fil**: `artifacts/api-server/src/lib/studio/confirm-published-concept.ts`

- Implementera `confirmPublishedConcept` och `undoConfirmedConcept`.
- Importerar: `markCandidateAcceptedForLink`, `resetCandidateAfterUndo` (från reconciliation-candidates.ts), `renumberImportedRows` (från letrend-sidan, behöver delas — se steg 3).
- Inga ändringar i routerna än.

**Blockas av**: Inget.

### Steg 2 — Migrera EP-1 (candidate accept)

**Fil**: `artifacts/api-server/src/routes/studio-v2.ts`

- Ersätt `applyReconciliationLink` + `markCandidateAcceptedForLink`-anropen i accept-endpointen med ett anrop till `confirmPublishedConcept({ advanceMode: 'link_only', source: 'candidate_accept', ... })`.
- Ta bort `applyReconciliationLink` (används nu bara internt → kan raderas).

**Blockas av**: Steg 1.

### Steg 3 — Migrera EP-2 (POST /history/reconciliation)

**Fil**: `artifacts/api-server/src/routes/studio-v2.ts`

- Target-resolvering (use_now_slot / manual) och access-validering stannar i routern.
- Resten ersätts med `confirmPublishedConcept({ advanceMode: 'link_only', source, ... })`.

**Blockas av**: Steg 1.

### Steg 4 — Migrera EP-3 (DELETE /history/reconciliation)

**Fil**: `artifacts/api-server/src/routes/studio-v2.ts`

- Ersätt inline-logik med `undoConfirmedConcept`.

**Blockas av**: Steg 1.

### Steg 5 — Migrera EP-5 (tiktok-sync inline)

**Fil**: `artifacts/api-server/src/lib/studio/tiktok-sync.ts`

- Ersätt inline auto-link + stats-prop + markCandidateAcceptedForLink med `confirmPublishedConcept({ advanceMode: 'link_only', source: 'auto_sync', actorId: null, ... })`.

**Blockas av**: Steg 1.

### Steg 6 — Migrera EP-6 (autoReconcileAndAdvance) + fixa saknade stats

**Fil**: `artifacts/letrend/src/lib/studio/auto-reconcile.ts`

- Ersätt steg 3–5 (reconcile + performMarkProduced + renumber) med `confirmPublishedConcept({ advanceMode: 'force_advance', source: 'auto_sync_advance', actorId: null, ... })`.
- **Fixar EP-6:s bugg**: stats-propagering till assignment-raden tillkommer automatiskt via servicen.
- **Fixar EP-6:s bugg**: motor-signals rensas nu av servicen.
- **Fixar EP-6:s bugg**: optimistiskt lås läggs till.

**Blockas av**: Steg 1. Kräver att `renumberImportedRows` är tillgänglig server-side (se nedan).

### Steg 7 — Migrera EP-4 (mark-produced route) + fixa saknad renumber

**Fil**: `artifacts/api-server/src/routes/studio-v2.ts`

- EP-4 är den enda entrypoint utan history-koppling. Den behöver inte `confirmPublishedConcept`.
- **Fixa**: Lägg till `renumberImportedRows` efter lyckad advance (saknas idag).

**Blockas av**: Steg 1 (för att `renumberImportedRows` ska vara tillgänglig server-side).

---

## 6. Beroendekarta: renumberImportedRows

`renumberImportedRows` finns idag i `artifacts/letrend/src/lib/studio/history-import.ts` (Next.js-arv). Den behövs av `confirmPublishedConcept` som körs server-side.

**Lösning**: Flytta eller kopiera till `artifacts/api-server/src/lib/studio/history-import.ts`.

Funktionen tar bara en Supabase-admin-instans och customerId — inga Next.js-beroenden. Flytten är ren.

---

## 7. Advance-beslutsmatris per entrypoint

| Entrypoint | source | advanceMode | Advance sker? |
|---|---|---|---|
| EP-1 candidate accept | `candidate_accept` | `link_only` | ❌ |
| EP-2 use_now_slot | `history_use_now_slot` | `link_only` | ❌ |
| EP-2 manual | `history_manual` | `link_only` | ❌ |
| EP-4 mark-produced | — (ingen `confirmPublishedConcept`) | — | ✅ alltid |
| EP-5 tiktok-sync auto | `auto_sync` | `link_only` | ❌ |
| EP-6 autoReconcileAndAdvance | `auto_sync_advance` | `force_advance` | ✅ alltid |

> Framtida `auto_if_now_slot`-läge kan koppla EP-1 och EP-2 till advance automatiskt om target är nu-slot — detta är den "nu-slot accept → implicit advance"-funktionen som produktägaren beslutat om. Den implementeras INTE i denna fas.

---

## 8. Ångra-stöd (confirm-dialog + reversibilitet)

Per produktägarbeslut (Plan 10):
- **Länk kan alltid ångras**: `undoConfirmedConcept` är fullt reversibel (återställer länk och stats).
- **Advance kan INTE ångras**: Att lägga till ett nytt uppdrag i nu-slot är den avsedda workaround-en.
- **Confirm-dialog**: Ska visas före advance. Implementeras i FeedSlot/MarkProducedDialog som frontend-skikt — ej i servicen.

---

## 9. Öppna frågor inför implementation

| # | Fråga | Konsekvens om obesvarad |
|---|---|---|
| Q1 | Ska `auto_if_now_slot`-läget aktiveras i EP-1 och EP-2 direkt? | Om ja: CM som accepterar kandidat för nu-slot får automatisk advance. Kräver confirm-dialog i FeedSlot. |
| Q2 | Ska motor-signals rensas även vid `link_only`? | Om ja: nudge-bannern försvinner vid länkning, ej vid advance. |
| Q3 | Är `renumberImportedRows` alltid säker att anropa efter advance? | Om nej: risk för feed_order-korruption vid felfall. |
| Q4 | Ska kandidatstatus vara fatalt (ej best-effort) i EP-2 och EP-5? | Om ja: ökar robusthet men gör routerna strängare. |

---

## 10. Filer som berörs av implementationen

| Fil | Förändring |
|---|---|
| `artifacts/api-server/src/lib/studio/confirm-published-concept.ts` | **NY** — service-kontrakt |
| `artifacts/api-server/src/lib/studio/history-import.ts` | **NY** (flytt) — `renumberImportedRows` |
| `artifacts/api-server/src/routes/studio-v2.ts` | Refactor EP-1, EP-2, EP-3, EP-4 |
| `artifacts/api-server/src/lib/studio/tiktok-sync.ts` | Refactor EP-5 |
| `artifacts/letrend/src/lib/studio/auto-reconcile.ts` | Refactor EP-6 |
| `artifacts/letrend/src/lib/studio/perform-mark-produced.ts` | Oförändrad (används av servicen) |
| `artifacts/api-server/src/lib/studio/reconciliation-candidates.ts` | Oförändrad (importeras av servicen) |

---

## 11. Vad som INTE implementeras i denna fas

- Ingen irreversibel timeline-advance kopplas till EP-1 eller EP-2.
- Ingen UI-förändring i FeedSlot eller MarkProducedDialog.
- Ingen Supabase-migration.
- `/admin/demos` rörs inte.
