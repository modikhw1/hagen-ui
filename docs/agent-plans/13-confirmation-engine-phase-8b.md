# Plan 13 — Confirmation Engine Phase 8b

**Status**: Implementerad och typecheck-verifierad.
**Datum**: 2026-05-06
**Baserat på**: `docs/agent-plans/11-confirmation-engine.md`, `docs/agent-plans/12-confirmation-engine-phase-8a.md`

---

## Vad ändrades

### Ändrad fil: `artifacts/api-server/src/lib/studio/tiktok-sync.ts`

#### Import-sektion

`markCandidateAcceptedForLink` importerades inte längre direkt i `tiktok-sync.ts`.
Ersatt av import av `confirmPublishedConcept` från `./confirm-published-concept.js`.

```diff
- import {
-   generateReconciliationCandidates,
-   markCandidateAcceptedForLink,
- } from './reconciliation-candidates.js';
+ import {
+   generateReconciliationCandidates,
+ } from './reconciliation-candidates.js';
+ import { confirmPublishedConcept } from './confirm-published-concept.js';
```

#### EP-5 — Inline auto-reconcile (ca 40 rader → 20 rader)

Ersatte det duplicerade blocket (länk-skrivning + inline stats-propagering +
`markCandidateAcceptedForLink`) med ett enda anrop till `confirmPublishedConcept`.

**Borttaget (~40 rader inline):**
- Direkt `supabase.update({ reconciled_customer_concept_id, reconciled_at })` på history-raden
- Manuell loop för att bygga `assignmentPatch` och propagera stats
- Direkt `markCandidateAcceptedForLink(supabase, historyRowId, nuSlotId, { auto: true })`

**Ersatt med:**
```typescript
const confirmResult = await confirmPublishedConcept({
  supabase,
  customerId,
  historyConceptId: historyRowId,
  targetCustomerConceptId: nuSlotId,
  actorId: null,        // system auto-link, ej CM-aktion
  source: 'auto_sync',
  now: autoNow,
});

if (!confirmResult.error) {
  autoReconciled = true;
  autoReconciledHistoryConceptId = historyRowId;
  if (confirmResult.warnings.length > 0) {
    logger.warn({ warnings: confirmResult.warnings, ... }, '...');
  }
} else {
  logger.warn({ err: confirmResult.error }, 'tiktok-sync: auto-reconcile link failed');
}
```

---

## Bevarade guards (oförändrade)

Alla fyra auto-reconcile-guards är intakta och i samma ordning som före:

| Guard | Bevarad? |
|---|---|
| `totalImported === 1` — ambiguous syncs hoppar över | ✅ |
| `singleInsertedRow !== null` — exakt den importerade raden används | ✅ |
| Nu-slot finns (`feed_order=0, concept_id IS NOT NULL`) | ✅ |
| Nu-slot ej redan länkad (`reconciled_customer_concept_id = nuSlotId`) | ✅ |

Felhantering för nu-slot-lookup och existing-link-lookup loggas fortfarande som
`logger.warn` och hoppar över auto-länkning — exakt som innan.

---

## Bevarade beteenden

| Beteende | Bevarad? |
|---|---|
| Ingen timeline advance i `tiktok-sync.ts` | ✅ |
| `autoReconciled` sätts bara om länk lyckades (`!confirmResult.error`) | ✅ |
| `autoReconciledHistoryConceptId` sätts bara om länk lyckades | ✅ |
| Stats propageras till assignment-raden | ✅ (via servicen) |
| Kandidatstatus är best-effort | ✅ (`candidateUpdated` kontrolleras ej) |
| Nudge (`emitSyncNudge`) skickas oavsett om auto-link lyckades | ✅ (orörd) |
| `generateReconciliationCandidates` körs efter nudge | ✅ (orörd) |

---

## Entrypoints som nu använder servicen

| EP | Endpoint / Fil | Service-funktion | Source-tagg | Fas |
|---|---|---|---|---|
| EP-1 | POST `/reconciliation-candidates/:id/accept` | `confirmPublishedConcept` | `candidate_accept` | 8a |
| EP-2a | POST `/history/reconciliation` (use_now_slot) | `confirmPublishedConcept` | `history_use_now_slot` | 8a |
| EP-2b | POST `/history/reconciliation` (manual) | `confirmPublishedConcept` | `history_manual` | 8a |
| EP-3 | DELETE `/history/reconciliation` | `undoConfirmedConcept` | — | 8a |
| EP-5 | `tiktok-sync.ts` inline auto-reconcile | `confirmPublishedConcept` | `auto_sync` | **8b** |

---

## Vad som fortfarande återstår

### EP-4 — POST `/api/studio-v2/feed/mark-produced`
**Fil**: `artifacts/api-server/src/routes/studio-v2.ts`
**Problem**: Saknar `renumberImportedRows` efter advance (EP-6 har det; EP-4 inte).
**Åtgärd**: Lägg till renumber-anrop efter lyckad `advance_customer_feed_plan` RPC.
Kräver att `renumberImportedRows` är tillgänglig server-side (se EP-6).

### EP-6 — `autoReconcileAndAdvance`
**Fil**: `artifacts/letrend/src/lib/studio/auto-reconcile.ts`
**Problem** (tre stycken):
1. Stats propageras inte till assignment-raden efter länkning.
2. Optimistiskt lås saknas (EP-4 har det; EP-6 inte).
3. Motor-signals rensas inte efter advance.
**Åtgärd**: Migrera länk-steget till `confirmPublishedConcept` med `force_advance`-läge
(när det implementeras), eller migrera de tre buggarna direkt till auto-reconcile.
Kräver flytt/kopia av `renumberImportedRows` till API-server-sidan.

---

## Teststatus

| Check | Resultat |
|---|---|
| `pnpm --filter @workspace/api-server exec tsc --noEmit` | ✅ 0 fel |
| Kvarvarande direktimport av `markCandidateAcceptedForLink` i tiktok-sync.ts | ✅ 0 |
| API-server startar utan krasch | ✅ (healthz OK) |
