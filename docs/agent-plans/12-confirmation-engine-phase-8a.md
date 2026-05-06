# Plan 12 — Confirmation Engine Phase 8a

**Status**: Implementerad och typecheck-verifierad.
**Datum**: 2026-05-06
**Baserat på**: `docs/agent-plans/11-confirmation-engine.md`

---

## Vad ändrades

### Ny fil: `artifacts/api-server/src/lib/studio/confirm-published-concept.ts`

Skapar ett gemensamt service-kontrakt för att länka ett TikTok-importerat historik-klipp
till ett LeTrend-uppdragskort ("konfirmering") och för att ångra den länken.

**Exporterade funktioner:**

```
confirmPublishedConcept(input: ConfirmPublishedConceptInput)
  → { linked, candidateUpdated, warnings, error? }

undoConfirmedConcept(input: UndoConfirmedConceptInput)
  → { unlinked, candidateReset, warnings, error? }
```

**`confirmPublishedConcept` gör i ordning:**
1. Skriver `reconciled_customer_concept_id + reconciled_by_cm_id + reconciled_at` på history-raden (fatalt om det misslyckas).
2. Hämtar stats från history-raden och propagerar dem (thumbnail, url, views, likes, comments, published_at) till assignment-raden — icke-fatalt.
3. Anropar `markCandidateAcceptedForLink` — resultatet returneras i `candidateUpdated`; caller bestämmer om failure är fatal.

**`undoConfirmedConcept` gör i ordning:**
1. Hämtar nuvarande `reconciled_customer_concept_id` från history-raden.
2. Rensar reconciliation-fälten på history-raden (fatalt om det misslyckas).
3. Rensar stats-fälten från assignment-raden (guardad med `customer_profile_id`) — icke-fatalt.
4. Anropar `resetCandidateAfterUndo` — icke-fatalt.

**Advance**: Utförs ALDRIG av dessa funktioner. Advance tillhör EP-4 och EP-6.

---

### Ändrad fil: `artifacts/api-server/src/routes/studio-v2.ts`

#### Import-sektion

`markCandidateAcceptedForLink` och `resetCandidateAfterUndo` importeras inte längre direkt
i router-filen. Ersatt av import av `confirmPublishedConcept` och `undoConfirmedConcept`.

#### Borttagen kod

`applyReconciliationLink` (privat async-funktion, ~50 rader) raderades helt.
Den var den enda interna källan till länk+stats-duplicering i router-filen.

#### EP-1 — POST `/reconciliation-candidates/:candidateId/accept`

Ersatte `applyReconciliationLink` + `markCandidateAcceptedForLink` med ett enda
anrop till `confirmPublishedConcept({ source: 'candidate_accept', ... })`.

**Fatalt beteende bevarat**: Om `result.candidateUpdated === false` svarar endpointen
fortfarande 500 med `Länken skapades men kandidatstatus kunde inte uppdateras`.
Kandidat-striktheten är alltså oförändrad relativt gamla koden.

#### EP-2 — POST `/history/reconciliation`

Ersatte inline länk-skrivning + stats-propagering + best-effort `markCandidateAcceptedForLink`
med ett anrop till `confirmPublishedConcept({ source: 'history_use_now_slot' | 'history_manual', ... })`.

**Best-effort beteende bevarat**: Warnings loggas men endpointen svarar alltid
`{ success: true }` om länk-skrivningen lyckades, oavsett kandidatstatus.

Liten bonus-fix: den gamla koden hade ett mojibake-fel i 422-texten
(`'VÃ¤lj manuellt.'`) — nu `'Välj manuellt.'`.

Pre-flight-queryn (`SELECT id, customer_profile_id, concept_id`) hämtar inte
längre onödiga stats-kolumner (de hämtas nu inuti servicen vid behov).

#### EP-3 — DELETE `/history/reconciliation`

Ersatte inline link-clear + stats-clear + best-effort `resetCandidateAfterUndo`
med ett anrop till `undoConfirmedConcept({ historyConceptId, customerId, ... })`.

Pre-flight-queryn hämtar inte längre `reconciled_customer_concept_id` (det görs
nu inuti servicen).

**Ångra-semantik oförändrad**: Advance återställs inte.

---

## Entrypoints som nu använder servicen

| EP | Endpoint | Service-funktion | Source-tagg |
|---|---|---|---|
| EP-1 | POST `/reconciliation-candidates/:id/accept` | `confirmPublishedConcept` | `candidate_accept` |
| EP-2a | POST `/history/reconciliation` (use_now_slot) | `confirmPublishedConcept` | `history_use_now_slot` |
| EP-2b | POST `/history/reconciliation` (manual) | `confirmPublishedConcept` | `history_manual` |
| EP-3 | DELETE `/history/reconciliation` | `undoConfirmedConcept` | — |

---

## Entrypoints som INTE berörs i denna fas

| EP | Fil | Anledning |
|---|---|---|
| EP-4 | POST `/feed/mark-produced` | Ingen länkning — advance-only; refactor i separat fas |
| EP-5 | `tiktok-sync.ts` inline auto-reconcile | Rör ej tiktok-sync.ts i Phase 8a |
| EP-6 | `auto-reconcile.ts` autoReconcileAndAdvance | Rör ej auto-reconcile.ts i Phase 8a |

---

## Teststatus

| Check | Resultat |
|---|---|
| `pnpm --filter @workspace/api-server exec tsc --noEmit` | ✅ 0 fel |
| Kvarvarande referenser till `applyReconciliationLink` i studio-v2.ts | ✅ 0 |
| Kvarvarande direktimport av `markCandidateAcceptedForLink` i studio-v2.ts | ✅ 0 |
| API-server startar utan krasch | Se serverstatus |

---

## Kvarvarande arbete (Phase 8b+)

- Steg 5: Migrera EP-5 (`tiktok-sync.ts` inline auto-reconcile) till `confirmPublishedConcept`.
- Steg 6: Migrera EP-6 (`auto-reconcile.ts`) till `confirmPublishedConcept` med `force_advance`-läge; inkluderar flytt av `renumberImportedRows` till API-server och bugg-fix för saknad stats-propagering och motor-signal-rensning.
- Steg 7: Fixa EP-4 (`mark-produced` route) — saknar `renumberImportedRows` efter advance.
