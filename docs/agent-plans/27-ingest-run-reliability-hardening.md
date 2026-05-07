# Phase 27 — Ingest Run Reliability Hardening

**Datum:** 2026-05-07  
**Föregående fas:** [26 — Ingest Engine Foundation](./26-ingest-engine-foundation.md)  
**Mål:** Förbättra `ingest_runs` så att `result`/`warnings` inte skrivs över, status/stage är precis och meningsfull i varje steg, save-fel markeras som failure och merge/append-logiken är testad.

---

## Ändrade filer

| Fil | Vad ändrades |
|---|---|
| `artifacts/api-server/src/lib/ingest-runs.ts` | Ny `mergeResult`/`appendWarning`-semantik i `IngestRunPatch`; exporterar rena `mergeResultInto()` och `appendWarningTo()` för tester; read-modify-write i `updateIngestRun()` |
| `artifacts/api-server/src/lib/ingest-runs.test.ts` | **Ny** — 9 enhetstester för `mergeResultInto` och `appendWarningTo` |
| `artifacts/api-server/src/routes/studio.ts` | analyze: `mergeResult`; enrich success: `status=ready_for_review, stage=classifying, mergeResult`; humor-enrich: använder bara `mergeResult.humor_enrich.status` — ändrar aldrig top-level status |
| `artifacts/api-server/src/routes/admin/concepts.ts` | Pre-insert: `status=running, stage=saving`; insert-fel: `status=failed, stage=saving, error_code=save_failed`; success: `status=completed, mergeResult.save_summary` |

---

## `result`/`warnings` merge-semantik

### Tidigare beteende (26a — bugg)
```typescript
// Varje anrop ERSATTE hela result-kolumnen:
updateIngestRun(id, { result: { analyze_summary: {...} } });
// → result = { analyze_summary: {...} }

updateIngestRun(id, { result: { enrich_summary: {...} } });
// → result = { enrich_summary: {...} }   ← analyze_summary borta!
```

### Nytt beteende (27 — merge)
```typescript
// patch.mergeResult shallow-mergas med befintlig result:
updateIngestRun(id, { mergeResult: { analyze_summary: {...} } });
// → result = { analyze_summary: {...} }

updateIngestRun(id, { mergeResult: { enrich_summary: {...} } });
// → result = { analyze_summary: {...}, enrich_summary: {...} }   ← båda bevaras

updateIngestRun(id, { mergeResult: { humor_enrich: { status: 'completed', fields: {...} } } });
// → result = { analyze_summary: {...}, enrich_summary: {...}, humor_enrich: { status: 'completed', ... } }
```

`warnings` är alltid append-only:
```typescript
// Befintliga warnings bevaras alltid:
updateIngestRun(id, { appendWarning: { stage: 'humor_enriching', error: 'timeout' } });
// → warnings = [...befintliga, { stage: 'humor_enriching', error: 'timeout' }]
```

### Implementationsdetalj: read-modify-write
`updateIngestRun` hämtar befintlig `result` + `warnings` från DB om `mergeResult` eller `appendWarning` används, gör merge/append i JS, och skriver sedan det sammanslagna värdet. Skalärfält (status, stage, etc.) skrivs alltid direkt utan extra runda tur.

**Racevillkor:** Acceptabelt — api-server är single-process och skrivningarna är icke-blockerande instrumentering.

---

## Status/stage-tabell efter ändring

| Händelse | status | stage | Förklaring |
|---|---|---|---|
| `POST /api/studio/ingest-runs` skapar run | `queued` | `null` | Initialtillstånd |
| analyze börjar | `running` | `analyzing` | Sätts *innan* Hagen-anrop |
| analyze lyckas | `running` | `analyzing` | Oförändrat; `result.analyze_summary` lagts till |
| analyze misslyckas | `failed` | `analyzing` | `error_code=analyze_failed`, `finished_at` satt |
| enrich börjar | `running` | `enriching` | Sätts *innan* Hagen-anrop |
| enrich lyckas | **`ready_for_review`** | **`classifying`** | CM kan granska/klassificera |
| enrich misslyckas | `failed` | `enriching` | `error_code=enrich_failed` |
| save börjar | `running` | `saving` | Sätts *innan* DB-insert |
| save misslyckas | `failed` | `saving` | `error_code=save_failed`, `finished_at` satt |
| save lyckas | **`completed`** | `saving` | `concept_id` satt, `finished_at` satt |
| humor-enrich startar (fire-and-forget) | *oförändrat* | *oförändrat* | Bara `result.humor_enrich.status=running` ändras |
| humor-enrich lyckas | *oförändrat* | *oförändrat* | `result.humor_enrich.status=completed` |
| humor-enrich misslyckas | *oförändrat* | *oförändrat* | `result.humor_enrich.status=failed`; warning appendas |

**Nyckelförbättring:** humor-enrich ändrar *aldrig* top-level `status`/`stage`. En completed run förblir completed oavsett om det asynkrona humor-passet lyckas eller ej.

---

## `result`-kolumnens struktur efter ett komplett flöde

```json
{
  "analyze_summary": {
    "gcs_uri": "gs://...",
    "has_analysis": true
  },
  "enrich_summary": {
    "has_overrides": true
  },
  "save_summary": {
    "concept_id": "clip-abc123"
  },
  "humor_enrich": {
    "status": "completed",
    "fields": {
      "handlingSummary": "...",
      "humorMechanism": "subversion",
      "whyItWorks": "..."
    }
  }
}
```

---

## Testresultat

```
✓ src/lib/ingest-runs.test.ts (9 tests)
✓ src/lib/studio/reconciliation-scoring.test.ts (20 tests)
✓ src/lib/admin-derive/attention.test.ts (17 tests)
✓ src/lib/studio/tiktok-sync.test.ts (24 tests)
✓ src/lib/studio/reconciliation-candidates-routes.test.ts (5 tests)

Test Files  5 passed (5)
     Tests  75 passed (75)
```

Nya tester täcker:
- `mergeResultInto`: tom bas, ny nyckel utan att ta bort befintliga, överskrivning av matchande nyckel, tre samexisterande nycklar, muterar inte input
- `appendWarningTo`: tom array, bevarar befintliga, muterar inte input, sekventiell append

Typechecks:
- `pnpm --filter @workspace/api-server exec tsc --noEmit` → 0 fel
- `pnpm --filter @workspace/letrend exec tsc --noEmit` → 0 fel

---

## Kvarvarande risker

| Risk | Allvarlighetsgrad | Mitigation |
|---|---|---|
| Read-modify-write race om api-server skalas horisontellt | Låg (single-process idag) | Migrera till `jsonb_set` / RPC om multi-instance behövs |
| humor-enrich-fel är osynliga för användaren | Låg | Ingen UI-feedback; accepterat i denna fas |
| `stage` är inte satt till `null` på completed | Negligibel | `stage=saving` kvarstår på completed runs; semantiken är "sista kända stage" |
| Fetch-for-merge misslyckas → mergeResult/appendWarning tappas | Låg | Loggas som warn; skalärfält (status, error_code) skrivs ändå |
| `classifying`-fasen i frontend speglas inte i `stage` under klassificering | Informativ | Stage sätts till `classifying` av enrich-success, men ingen ytterligare uppdatering sker medan CM väljer kategorier |

---

## Nästa steg (ej i denna fas)

1. **Phase 26b / polling** — `GET /ingest-runs/:id` polling i UploadConceptModal för live-feedback på humor-enrich
2. **Postgres `jsonb_set` migration** — ersätt JS-side read-modify-write om horizontal scale tillkommer
3. **`ready_for_review` admin-vy** — lista runs i `ready_for_review`-status som CM kan granska
