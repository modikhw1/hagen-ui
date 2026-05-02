# Slice 2.1 History Toggle — Acceptance Review

Granskningsdatum: 2026-04-13
Granskad av: Claude Code (verifiering direkt mot kod, ej självrapporterad implementation)

---

## Sammanfattning

**Rekommendation: accept now**

Alla sju kriterier passerar. Implementationen är korrekt och målstyrd. Inga blockerande fel hittades.

---

## Kriterieresultat

### 1. History-korten visar inte längre redundanta textlabels som upprepar visuell identitet

**PASS**

Grep på `LeTrend-producerad`, `LeTrend-kopplad`, `TikTok` som card-label-text i
`CustomerWorkspaceContent.tsx` → noll träffar.

Den enda text som kvarstår på kortet är (rad 6813):

```tsx
<span style={{ opacity: 0.72 }}>LeTrend:</span>
<span>{linkedHistoryTitle}</span>
```

Villkor: `concept.row_kind === 'imported_history' && linkedHistoryTitle` — visas
alltså enbart när klippet redan är reconciled och visar det länkade konceptets
titel, inte en statussymbol. Det är informativt innehåll, inte ett redundant badge.

---

### 2. Imported history har primär UX som binär `TikTok ↔ LeTrend`-klassning

**PASS**

Context-menu för `imported_history`-rader (rad 7003–7025):

```tsx
{concept.row_kind === 'imported_history' && (
  <button onClick={...}>
    {concept.reconciliation.is_reconciled
      ? 'Markera som TikTok'
      : 'Markera som LeTrend'}
  </button>
)}
```

Primärknapp är en enda binär toggle. Den fria picker-knappen
(`Välj LeTrend-koncept...`) är en separat knapp direkt efter — klart sekundär
position i listan.

---

### 3. `Markera som LeTrend` använder now-slot som primary default när aktuellt now-slot-koncept finns

**PASS**

Frontend, `handleMarkHistoryAsLeTrend` (rad 6290–6302):

```ts
if (!effectiveNowSlotTarget) {
  setShowReconciliationPicker(true);   // fallback: öppna picker
  return;
}
await onReconcileHistory(concept.id, { mode: 'use_now_slot' });  // primary
```

`effectiveNowSlotTarget` (rad 6057–6060) härleds från `currentHistoryDefaultTarget`
(rad 4117–4121) som är det assignment med `feed_order === 0`.

Backend, `reconciliation/route.ts` (rad 43, 78–90): `mode: 'use_now_slot'` letar
upp assignment med `feed_order = 0` och `concept_id IS NOT NULL` för rätt
`customer_profile_id`. Fallback till `linked_customer_concept_id` sker bara när
mode är `'manual'`.

---

### 4. Toggle tillbaka till `TikTok` är enkel och reversibel

**PASS**

Primärknapp när `is_reconciled = true`: `Markera som TikTok` →
`handleUndoLinkedHistory` (rad 6304–6314) → DELETE
`/api/studio-v2/history/reconciliation`.

DELETE-endpoint (rad 174–185) skriver:

```ts
reconciled_customer_concept_id: null,
reconciled_by_cm_id: null,
reconciled_at: null,
```

Returnerar uppdaterad rad. Frontend uppdaterar lokalt state direkt via
`setConcepts`. Inga sidoeffekter på `concept_id`, `row_kind` eller TikTok-fält.
Undo är ren och atomic.

---

### 5. Imported TikTok truth bevaras fortsatt i datamodellen

**PASS**

- `ImportedHistoryCustomerConcept` (studio-v2.ts rad 153–159) tvingar
  `concept_id: null` på typsystem-nivå.
- POST-endpoint vägrar reconciliera om `historyRow.concept_id` är satt
  (rad 71–76, status 409) — guard mot att råka reconciliera en LeTrend-assignment.
- DELETE-endpoint har samma guard (rad 167).
- Reconciliation skriver aldrig till `concept_id` eller `row_kind` — enbart
  till `reconciled_customer_concept_id`, `reconciled_by_cm_id`, `reconciled_at`.
- Normalizer (customer-concepts.ts rad 174–178) sätter
  `is_reconciled: Boolean(reconciledCustomerConceptId)` utan att mutera row_kind.

---

### 6. Fri konceptkoppling, om kvar, ligger som fallback/secondary path och inte som primär CTA

**PASS**

Position i context-menu:
1. `Markera som LeTrend` / `Markera som TikTok` — **primär** (rad 7003–7025)
2. `Välj LeTrend-koncept...` — **sekundär** (rad 7027–7042)

Picker-panelen (rad 7059–7121) visar instructional text:

> "Nu-slot används normalt som default: [titel]. Välj annat koncept bara om
> uppladdningen inte gäller nu-slotten."

Det signalerar explicit att free-linking är ett undantagsflöde.

`selectableHistoryTargets` (rad 6085–6092) sorterar på `feed_order` descending —
nu-slottet hamnar överst i listan om CM ändå öppnar picker.

---

### 7. `cron import`, `advance-plan` och `mark-produced` har inte oavsiktligt blandats ihop semantiskt

**PASS**

`mark-produced/route.ts` (rad 7–31) dokumenterar tydligt tre faser med explicit
motivering ("This guarantees LeTrend historik always sits closer to nu than
imported TikTok history — the same invariant maintained by advance-plan"):

- Fas 1: shifta LeTrend-rader (concept_id IS NOT NULL) med −1
- Fas 2: shifta imported TikTok-rader (concept_id IS NULL) med −1 för att
  undvika kollision
- Fas 3: sätt producerad row till feed_order = −1 med metadata

Inga reconciliation-anrop eller import-logik i mark-produced.
`reconciliation/route.ts` berör enbart `reconciled_*`-fälten på existing
imported rows. history-import.ts är oförändrad och orörd. Semantisk separation
är intakt.

---

## Kvarvarande risker

### Risk 1 — API-felhantering vid race condition i use_now_slot (låg)

Om frontends `effectiveNowSlotTarget` är non-null men API:et returnerar 409
(stale lokalt state eller race condition) visas `alert()` men pickern öppnas
inte automatiskt som recovery. CM måste manuellt klicka `Välj LeTrend-koncept...`.

**Konsekvens:** liten irritation, inget dataförlust. Inte blockerande.

### Risk 2 — "LeTrend:"-prefix på reconciled kort (minimal)

Den kvarvarande `LeTrend:`-texten på kortet (rad 6813) kan beroende på läsning
anses vara en liten label. Den uppfyller dock inte correction-reviewens definition
av redundant ("upprepar visuell identitet") eftersom den visar det länkade
konceptets titel, inte bara status. Inte blockerande.

### Risk 3 — Lång picker-lista vid många koncept (kosmetisk)

`selectableHistoryTargets` är otrunkerad. Kunder med 10+ aktiva assignments ger
en lång dropdown. Inte relevant för nuvarande MVP-scope.

---

## Rekommendation

**accept now**

Alla sju acceptanskriterier uppfylls i kod. Kvarvarande risker är
polish/edge-case-nivå, inte kontrakts- eller semantikbrott. Datamodellen är
säker och reversibel. Primary UX har faktiskt förflyttats till slot-aware
binär toggle enligt beställning.
