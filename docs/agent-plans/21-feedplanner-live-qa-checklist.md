# Phase 11a — Feedplanner live QA-checklista (Confirmation Engine)

> Skapad efter kodgranskning av Phase 8a–10b. Inga blockande fel hittades.
> Kör `tsc --noEmit` → 0 fel efter 10b.

---

## Flödesöversikt

```
TikTok-sync (EP-5)
  └─▶ feed_motor_signals INSERT / MERGE
        └─▶ FeedAdvanceCue visas (active nudge)
              └─▶ CM klickar "Bekräfta som gjord"
                    └─▶ MarkProducedDialog öppnas
                          ├─▶ [auto/manual] POST /history/reconciliation (mode=use_now_slot)
                          │     └─▶ confirmPublishedConcept (link + stats-propagation + candidate-status)
                          └─▶ POST /feed/mark-produced
                                └─▶ advance_customer_feed_plan RPC
                                    + auto_resolved_at på motor-signaler
                                    + renumberImportedRows (non-fatal)
```

---

## Scenario 1 — Nytt TikTok-klipp importeras och bekräftas

### Precondition
- Kunden har en aktiv feedplan med nu-slot (feed_order=0) och minst ett +1-slot.
- `customer_profiles.tiktok_profile_url` är satt.
- Minst ett nytt TikTok-klipp finns på profilen som inte är importerat sedan tidigare.

### Steg

| # | Handling | Förväntat |
|---|---|---|
| 1 | tiktok-sync kör (cron eller manuell fetch-profile-history) | Nytt `customer_concepts`-rad med `concept_id IS NULL` skapas (row_kind=imported_history) |
| 2 | `feed_motor_signals` INSERT / MERGE | Signal med `signal_type='fresh_activity'` och `auto_resolved_at IS NULL` |
| 3 | CM öppnar studio-fliken för kunden | `FeedAdvanceCue` visas (grön banner) med "X nya klipp i historiken" |
| 4 | Cue visar korrekt klipp-thumbnail och datum | Stämmer med TikTok-klippet |
| 5 | CM klickar "Bekräfta som gjord" (cue-knappen) | `MarkProducedDialog` öppnas |
| 6 | Dialog — auto-läge är förvalt | Radioknapp "Kunden filmade rätt koncept" markerad |
| 7 | Dialog — rätt preferred clip visas | "Kopplar senaste importerade klippet till konceptet." (det klipp cue:n visade som `freshImportedConcepts[0]`) |
| 8 | CM klickar "Bekräfta" | Se API-anrop nedan |
| 9 | Nu-kortet i griden får thumbnail + TikTok-stats | Stats propagerade från history-raden till assignment-raden |
| 10 | History-kortet försvinner från griden (is_reconciled=true) | `reconciled_customer_concept_id` satt på history-raden |
| 11 | +1-slot avanceras till nu-slot (feed_order 1→0, 2→1 osv) | `advance_customer_feed_plan` RPC körde korrekt |
| 12 | Motorsignalen försvinner från cue-bannern | `auto_resolved_at` satt, signal rör sig från activeNudges → autoResolvedNudges |
| 13 | Grön "Planen är uppdaterad och signalen hanterad"-badge visas | `autoResolvedNudges.length > 0`, CM kan klicka Stäng |
| 14 | `renumberImportedRows` körde (non-fatal i loggen) | Unreconcilerade history-rader har uppdaterade feed_order under LeTrend historik-floor |

### API-anrop (sekventiellt inom dialog handleConfirm)

```
1. POST /api/studio-v2/history/reconciliation
   Body: { history_concept_id: <clipId>, mode: "use_now_slot" }
   → 200 { success: true }
   → Side effects: confirmPublishedConcept anropas (link + stats + candidate-status)

2. POST /api/studio-v2/feed/mark-produced
   Body: { concept_id: <nuConceptId>, customer_id: <customerId>,
           tiktok_url: <url>, published_at: <date> }
   → 200 { success: true, concept: {...} }
   → Side effects: advance_customer_feed_plan RPC,
                   auto_resolved_at sätts på motor-signaler,
                   renumberImportedRows (non-fatal)
```

### DB-effekter

| Tabell | Rad | Fält som ändras |
|---|---|---|
| `customer_concepts` | history-rad | `reconciled_customer_concept_id`, `reconciled_at`, `reconciled_by_cm_id` |
| `customer_concepts` | nu-slot assignment | `tiktok_thumbnail_url`, `tiktok_url`, `tiktok_views`, `tiktok_likes`, `tiktok_comments`, `published_at` (via stats-propagation) |
| `customer_concepts` | alla assignment-rader | `feed_order` shiftas nedåt via RPC |
| `feed_motor_signals` | kundens aktiva signal | `auto_resolved_at = now` |
| `customer_profiles` | kundens rad | `pending_history_advance_at` sätts och nollställs (optimistic lock) |
| `customer_concepts` | unreconcilerade history-rader | `feed_order` renumreras under historik-floor |

---

## Scenario 2 — Nu-slot candidate (kandidatpanelen på history-kort)

### Precondition
- Kandidatpanelen visar ett förslag med `target.feed_order === 0`.
- Kunden har ett aktivt nu-slot.

### Steg

| # | Handling | Förväntat |
|---|---|---|
| 1 | History-kortet i griden visar kandidatpanel | "Nu-slot"-chip + score |
| 2 | CM klickar "✓ Nu" (accept-knapp) | `MarkProducedDialog` öppnas — **inte** direkt `onAcceptCandidate` |
| 3 | Dialog — preferred clip | `freshestImportedConcept` = kandidatens `history_concept_id` (preferredImportedConceptId passad) |
| 4 | CM klickar "Bekräfta" | reconcile → mark-produced-flödet körs identiskt med Scenario 1 |

### API-anrop
Identiska med Scenario 1 — kandidatens `history_concept_id` är preferred clip.
`onAcceptCandidate` anropas **INTE** — direkt kandidat-accept bypassas för nu-slot.

---

## Scenario 3 — Future candidate (kandidat med feed_order > 0)

### Precondition
- Kandidatpanelen visar ett förslag med `target.feed_order > 0`.

### Steg

| # | Handling | Förväntat |
|---|---|---|
| 1 | CM klickar "✓" (accept-knapp, utan "Nu"-suffix) | `onAcceptCandidate(candidate.id)` anropas direkt |
| 2 | Loading-state på knappen | `candidateLoadingId` sätts, knapp-text "..." |
| 3 | `POST /api/studio-v2/reconciliation-candidates/:id/accept` | 200 — klipp länkas till framtida slot, **ingen** planflytt |
| 4 | Kandidatpanel försvinner | Raden refreshas, `status = 'accepted'` |

### API-anrop

```
POST /api/studio-v2/reconciliation-candidates/:candidateId/accept
→ confirmPublishedConcept anropas (link + stats + candidate-status)
→ Ingen advance_customer_feed_plan
```

---

## Scenario 4 — Flera nya klipp (ingen blind auto-advance)

### Precondition
- 2+ nya TikTok-klipp importeras sedan senaste mark-produced.

### Steg

| # | Handling | Förväntat |
|---|---|---|
| 1 | Cue visar "X nya klipp i historiken" | `freshImportedConcepts.length === X` |
| 2 | Cue visar thumbnail-glimpse för upp till 3 klipp | `freshImportedConcepts.slice(0, 3)` |
| 3 | CM klickar "Bekräfta som gjord" | Dialog öppnas med `freshImportedConcepts[0]` (senast publicerade) som preferred |
| 4 | Auto-läge: rätt preferred clip visas | Det senast publicerade klippet är förvalt |
| 5 | CM väljer manuellt-läge | Dropdown med alla orekonsilierade klipp |
| 6 | CM väljer ett specifikt klipp | Det valda klippet reconcilieras med nu-slotten |
| 7 | Resterande klipp kvarstår i historiken | De syns som orekonsilierade history-kort |
| 8 | Ingen blind auto-advance | Varken EP-5 (tiktok-sync) eller EP-6 (autoReconcileAndAdvance) avancerar planen utan CM-bekräftelse |

### Notering om EP-6
`autoReconcileAndAdvance` är **inte** aktivt i detta flöde. EP-5 sätter enbart en motor-signal och
auto-kopplar maximalt ett klipp till nu-slotten (om `auto_reconcile`-flödet matchar). CM måste
alltid bekräfta via dialog för att planen ska flytta fram.

---

## Scenario 5 — Skip / inget klipp

### Steg

| # | Handling | Förväntat |
|---|---|---|
| 1 | Dialog — CM väljer "Hoppa over / manuell hantering" | Skip-radioknapp |
| 2 | CM klickar "Bekräfta" | `onMarkProduced(nuConceptId)` anropas — **ingen** `onReconcileHistory` |
| 3 | `POST /feed/mark-produced` utan `tiktok_url` och `published_at` | 200 — plan avanceras, ingen klipplänk |
| 4 | Nu-kortet markeras producerat utan thumbnail | Ingen stats-propagation |
| 5 | History-klipp kvarstår i griden | De är fortfarande orekonsilierade |

### Auto-läge utan importerat klipp
Om `freshestImportedConcept === null` och CM väljer auto-läge → samma beteende som skip.
Texten i auto-radioknappen ändras till "Markerar som producerat utan klippkoppling."

---

## Scenario 6 — Undo link (ta bort reconciliation)

### Steg

| # | Handling | Förväntat |
|---|---|---|
| 1 | CM klickar undo på ett rekonsilierat history-kort | `handleUndoHistoryReconciliation(historyConceptId)` |
| 2 | `DELETE /api/studio-v2/history/reconciliation` | `undoConfirmedConcept` körs |
| 3 | History-kortet dyker upp igen i griden | `reconciled_customer_concept_id = null` |
| 4 | Assignment-kortets stats-overlay tas bort | `tiktok_thumbnail_url, tiktok_url, tiktok_views, tiktok_likes, tiktok_comments, published_at = null` på assignment-raden |
| 5 | Kandidatstatus återställs (best-effort) | `resetCandidateAfterUndo` körs |
| 6 | **Planflytten backas INTE** | Advance är irreversibel by design — ny assignment är rätt recovery |

### Dokumenterat i koden
`undoConfirmedConcept` har explicit kommentar:
> "This function deliberately does NOT reverse any timeline advance. Advance is irreversible by design."

---

## Scenario 7 — Felvägar

### 7a: Reconcile-fel (Step 1 i dialog)

| # | Händelse | Förväntat |
|---|---|---|
| 1 | `POST /history/reconciliation` → 4xx/5xx | `reconcileHistoryRequest` kastar Error |
| 2 | Dialog fångar felet (outer catch) | `submitError` sätts, dialog stannar öppen |
| 3 | Felmeddelande visas i röd banner | Serverns feltext (t.ex. "Inget koncept i nu-slotten hittades") |
| 4 | Knappen aktiveras igen | `submitting = false` |
| 5 | Ingen mark-produced körs | Länken är inte sparad — inga partiella effekter |

### 7b: Mark-produced-fel efter lyckad länkning

| # | Händelse | Förväntat |
|---|---|---|
| 1 | Reconcile: OK | Länk sparad i DB, stats propagerade |
| 2 | `POST /feed/mark-produced` → 4xx/5xx | inner try/catch fångar felet |
| 3 | Dialog kastar specifikt felmeddelande | "Klippet kopplades till konceptet men planflytten misslyckades. Kopplingen är sparad — uppdatera sidan och kontrollera att nu-kortet har markerats som gjort." |
| 4 | Dialog stannar öppen, feltext visas | `submitError` sätts |
| 5 | **Länken finns kvar** | CM kan refresha manuellt — klippet är kopplat, bara planflytten misslyckades |

### 7c: Concurrent advance (optimistic lock 409)

| # | Händelse | Förväntat |
|---|---|---|
| 1 | `pending_history_advance_at IS NOT NULL` när mark-produced anropas | DB-uppdatering returnerar 0 rader → API returnerar 409 |
| 2 | Feltext | "Planen flyttas redan fram. Försök igen om en stund." |
| 3 | Dialog stannar öppen | CM kan vänta och klicka igen |

### 7d: Dialogen stängs inte vid fel

Verifierat i koden (`MarkProducedDialog.handleConfirm`):
```typescript
} catch (error) {
  setSubmitError(error instanceof Error ? error.message : 'Okänt fel');
} finally {
  setSubmitting(false);
}
// onClose() anropas BARA efter try-blocket lyckas
```

---

## Kvarvarande risker och observationer

### Risk 1 — cmNote skickas inte till API-et (låg prioritet)
`cmNote` i dialogen lagras i state men skickas aldrig i `markProducedRequest` eller
`reconcileHistoryRequest`. Fältet är märkt "valfri anteckning" men sparas ingenstans.
**Bedömning**: Informationsförlust, inte blockerande. Bör läggas till i framtida sprint.

### Risk 2 — reconcileHistoryRequest refetchar concepts + candidates (sekventiellt i dialog)
Efter reconcile-anropet kör `reconcileHistoryRequest`:
```typescript
clearClientCache(conceptsCacheKey);
await Promise.all([fetchConcepts(true), fetchCandidates()]);
```
Sedan kör dialogen omedelbart `markProducedRequest` → ytterligare `fetchConcepts(true)`.
Det innebär **två** fullständiga concept-fetchar i snabb följd per dialog-confirm i auto-läge.
Inte blockerande, men skapar onödig last.
**Bedömning**: Optimering för framtida sprint.

### Risk 3 — EP-6 (autoReconcileAndAdvance) har kända öppna problem
Dokumenterat i scratchpad sedan Phase 9a:
- Stats-propagation saknas
- Optimistic lock saknas
- Motor-signaler rensas inte
EP-6 körs inte aktivt i detta flöde. Rör inte nuvarande QA-scope.

### Risk 4 — Motor-signal acknowledged_at vs auto_resolved_at semantik
Servern sätter `auto_resolved_at` på alla unacknowledged, unresolved signaler efter mark-produced.
Klienten filtrerar `activeNudges = !auto_resolved_at` och `autoResolvedNudges = auto_resolved_at != null`.
`acknowledged_at` sätts av klienten när CM klickar "Stäng" på den gröna badge:n.
**Risk**: Om mark-produced lyckas men `auto_resolved_at`-uppdateringen misslyckas (icke-fatal logg-warning),
kvarstår cue-bannern även efter en lyckad planflytt. CM ser bannern på nytt vid reload.
**Bedömning**: Icke-fatal by design; acceptabel.

### Risk 5 — Textarea placeholder-text har kvarvarande mojibake
`MarkProducedDialog.tsx` rad ~386: `"Lagg till en intern notering..."` saknar ä.
Inte blockerande (fältet är i sig oanvänt, se Risk 1), men kan åtgärdas i samma sprint.

---

## Bör fixas före livekörning

| # | Prioritet | Problem | Fil |
|---|---|---|---|
| 1 | **Låg** | cmNote sparas aldrig | `MarkProducedDialog.tsx`, `CWC.tsx`, API |
| 2 | **Låg** | Textarea placeholder mojibake: "Lagg" → "Lägg" | `MarkProducedDialog.tsx` rad ~386 |
| 3 | **Ingen** | Dubbel concept-fetch efter auto-mode confirm | Optimering, inte blockerande |

---

## Teststatus

- `pnpm --filter @workspace/letrend exec tsc --noEmit` — **0 errors** (efter Phase 10b)
- Inga automatiserade e2e-tester för detta flöde — manuell QA krävs mot staging-miljö
- Alla felvägar verifierade via kodläsning mot MarkProducedDialog.handleConfirm
