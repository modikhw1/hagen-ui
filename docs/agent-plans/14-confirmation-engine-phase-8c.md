# Plan 14 — Confirmation Engine Phase 8c

**Status**: Implementerad och typecheck-verifierad.
**Datum**: 2026-05-06
**Baserat på**: `docs/agent-plans/11-confirmation-engine.md`, `docs/agent-plans/13-confirmation-engine-phase-8b.md`

---

## Vad ändrades

### Ny fil: `artifacts/api-server/src/lib/studio/history-import.ts`

Server-side kopia av `renumberImportedRows` från `artifacts/letrend/src/lib/studio/history-import.ts`.

Innehåller enbart denna funktion — den fullständiga `importClipsForCustomer`/`updateClipStats`-pipeline
bor kvar på letrend-sidan. Anpassningar för API-server:
- Import från `../supabase.js` (inte Next.js path alias `@/lib/server/supabase-admin`)
- Inga Next.js-beroenden
- `NormalizedHistoryClip`-typen behövs inte (lokalt definierad `ImportedHistoryRow` räcker)

Fil-header dokumenterar att den ska hållas i sync med letrend-originalet.

### Ändrad fil: `artifacts/api-server/src/routes/studio-v2.ts`

#### Import-sektion

```typescript
import { renumberImportedRows } from '../lib/studio/history-import.js';
```

#### EP-4 — POST `/api/studio-v2/feed/mark-produced`

Lade till ett `renumberImportedRows`-anrop efter det befintliga motor-signals-blocket och
innan `res.json({ success: true, concept: producedConcept })`:

```typescript
try {
  await renumberImportedRows(supabase, customerId);
} catch (renumberErr) {
  logger.warn({ err: renumberErr, customerId }, 'mark-produced: renumberImportedRows failed (non-fatal)');
}
```

### Ändrad fil: `artifacts/api-server/src/lib/studio/tiktok-sync.ts`

Hygien-fix: `singleInsertedRow` destrukturerades tidigare som
`const { id: historyRowId, clip: singleClip } = singleInsertedRow` men `singleClip`
användes inte längre (stats-propagering sker nu via `confirmPublishedConcept` som hämtar
från DB). Variabeln togs bort:

```typescript
// Före (Phase 8b lämnade singleClip kvar):
const { id: historyRowId, clip: singleClip } = singleInsertedRow;

// Nu:
const { id: historyRowId } = singleInsertedRow;
```

---

## Varför renumber är non-fatal

`advance_customer_feed_plan` RPC är irreversibel — nu-slotten är redan stämplad som
producerad och tidlinjen har skiftats när koden når renumber-steget. Om renumber-anropet
kastar ett fel är det korrekt att:

1. **Logga** felet som `logger.warn` för observerbarhet.
2. **Svara `{ success: true }`** — UI ska inte se ett felmeddelande för en operation
   som faktiskt lyckades. En sned `feed_order` på TikTok-historik-rader är ett
   kosmetiskt problem; rättning sker automatiskt vid nästa sync.
3. **Inte rulla tillbaka** advance — det är tekniskt omöjligt utan DB-transaktion
   över RPC-gränsen.

Samma mönster används av motor-signals-rensningen ovanför (`logger.warn`, ej fatal).

---

## Entrypoints — fullständig status efter Phase 8c

| EP | Endpoint / Fil | Service / Fix | Fas |
|---|---|---|---|
| EP-1 | POST `/reconciliation-candidates/:id/accept` | `confirmPublishedConcept` | 8a |
| EP-2a | POST `/history/reconciliation` (use_now_slot) | `confirmPublishedConcept` | 8a |
| EP-2b | POST `/history/reconciliation` (manual) | `confirmPublishedConcept` | 8a |
| EP-3 | DELETE `/history/reconciliation` | `undoConfirmedConcept` | 8a |
| EP-5 | `tiktok-sync.ts` inline auto-reconcile | `confirmPublishedConcept` | 8b |
| EP-4 | POST `/feed/mark-produced` | `renumberImportedRows` tillagd | **8c** |

---

## Vad som återstår

### EP-6 — `autoReconcileAndAdvance`
**Fil**: `artifacts/letrend/src/lib/studio/auto-reconcile.ts`

Tre kvarvarande problem (dokumenterade sedan Plan 11):

| Problem | Beskrivning |
|---|---|
| Stats-propagering saknas | Länk skrivs men thumbnail/views/etc. kopieras inte till assignment-raden |
| Optimistiskt lås saknas | EP-4 har `pending_history_advance_at`; EP-6 inte |
| Motor-signals rensas inte | EP-4 rensar signaler; EP-6 inte |

**Föreslagen åtgärd**: Migrera länk-steget till `confirmPublishedConcept` med ett
framtida `advanceMode: 'force_advance'`-läge som hanterar lås + advance + renumber +
motor-signals i ett enda serviceanrop. Kräver antingen:
- att `renumberImportedRows` anropas server-side (tillgänglig sedan denna fas), eller
- att auto-reconcile.ts själv importerar från letrend-sidan (befintligt mönster).

### Framtida: `auto_if_now_slot` + confirm-dialog

Produktägarbeslut (Plan 10): nu-slot accept → implicit advance med confirm-dialog.
Kräver:
- `advanceMode: 'auto_if_now_slot'` i `confirmPublishedConcept`
- Frontend confirm-dialog i FeedSlot/MarkProducedDialog
- Advance kopplas till EP-1 och EP-2 för nu-slot-target

Implementeras **inte** förrän EP-6 är löst och produktägaren bekräftar UX.

---

## Teststatus

| Check | Resultat |
|---|---|
| `pnpm --filter @workspace/api-server exec tsc --noEmit` | ✅ 0 fel |
| Kvarvarande `singleClip` i tiktok-sync.ts | ✅ borttagen |
| API-server startar utan krasch | ✅ (healthz OK) |
