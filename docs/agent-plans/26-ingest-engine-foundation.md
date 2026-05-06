# Phase 26a — Ingest Engine Foundation

**Datum:** 2026-05-06  
**Mål:** Skapa persistent grundstruktur för upload/ingest-flödet. Videoanalys ska inte bara leva i UploadConceptModal-state och `concepts.backend_data`. Ett centralt `ingest_runs`-objekt följer processen queued → running → completed/failed med aktuell stage, fel, input, output och concept-koppling.

---

## Ändrade filer

| Fil | Vad ändrades |
|---|---|
| `supabase/migrations/20260506200000_ingest_runs.sql` | **Ny** — skapar `public.ingest_runs` med full schema, RLS, indexes |
| `artifacts/api-server/src/lib/ingest-runs.ts` | **Ny** — `updateIngestRun()` och `safeRunId()` helpers |
| `artifacts/api-server/src/routes/studio.ts` | Lade till `POST /ingest-runs`, `GET /ingest-runs/:id`; instrumenterade analyze/enrich med `ingest_run_id`; humor-enrich returnerar 202 + instrumenterar asynkront |
| `artifacts/api-server/src/routes/admin/concepts.ts` | `POST /api/admin/concepts` accepterar optional `ingest_run_id`; sätter `completed`/`saving` + `concept_id` på run efter lyckad insert |
| `artifacts/letrend/src/components/studio/UploadConceptModal.tsx` | Skapar ingest_run före analyze; sparar `ingestRunId` i state; skickar `ingest_run_id` till analyze, enrich, save och humor-enrich |

---

## Migrationens schema

```sql
public.ingest_runs (
  id                     uuid primary key default gen_random_uuid(),
  source                 text not null default 'studio_upload',
  source_url             text not null,
  platform               text null,
  status                 text not null default 'queued'
                           check: queued | running | ready_for_review | completed | failed | canceled,
  stage                  text null,           -- analyzing | enriching | classifying | saving | humor_enriching
  created_by             uuid → profiles(id),
  customer_profile_id    uuid → customer_profiles(id),
  concept_id             text → concepts(id),
  hagen_contract_version text null,
  hagen_video_id         text null,
  hagen_request_id       text null,
  input                  jsonb default '{}',
  result                 jsonb default '{}',
  warnings               jsonb default '[]',
  error_code             text null,
  error_message          text null,
  started_at             timestamptz null,
  finished_at            timestamptz null,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
)
```

**RLS:** Enabled. Två restrictive policies blockerar `anon` och `authenticated` direkt access. All åtkomst via api-server (service role, kringgår RLS).

**Index:**
- `(created_by, created_at desc)` — lista egna runs
- `(status, created_at desc)` — filtrera på status
- `(concept_id)` WHERE concept_id IS NOT NULL — slå upp runs per concept
- `(customer_profile_id)` WHERE customer_profile_id IS NOT NULL

---

## Status/stage-modellen

```
                 ┌─────────────────────────────────┐
                 │            queued               │  ← skapas av POST /ingest-runs
                 └──────────────┬──────────────────┘
                                │
                    started_at sätts
                                │
                 ┌──────────────▼──────────────────┐
                 │  running (stage: analyzing)     │  ← analyze proxy börjar
                 └──────────────┬──────────────────┘
                                │
                 ┌──────────────▼──────────────────┐
                 │  running (stage: enriching)     │  ← enrich proxy börjar
                 └──────────────┬──────────────────┘
                                │
                 ┌──────────────▼──────────────────┐
                 │  running (stage: saving)        │  ← admin concepts insert
                 └──────────────┬──────────────────┘
                                │
              ┌─────────────────┴──────────────────┐
              │                                    │
  ┌───────────▼──────────┐           ┌─────────────▼───────────┐
  │ completed            │           │ failed                  │
  │ concept_id satt      │           │ error_code/message satt │
  │ finished_at satt     │           │ finished_at satt        │
  └──────────────────────┘           └─────────────────────────┘

Parallellt (efter save, fire-and-forget):
  running → stage: humor_enriching → result.humor_enrich uppdateras
  (påverkar inte status — humor-enrich är non-blocking)
```

---

## Hur UploadConceptModal kopplas till ingest_runs

```
Användare klistrar in URL → "Analysera och fortsätt"
  │
  ├── POST /api/studio/ingest-runs { source_url, platform }
  │       → ingest_run_id sparas i React state
  │
  ├── POST /api/studio/concepts/analyze { videoUrl, ingest_run_id }
  │       API-server: updateIngestRun({ status: running, stage: analyzing, started_at })
  │       Hagen proxy klar → updateIngestRun({ result.analyze_summary })
  │       Vid fel → updateIngestRun({ status: failed, error_code, error_message })
  │
  ├── POST /api/studio/concepts/enrich { backend_data, ingest_run_id }
  │       API-server: updateIngestRun({ stage: enriching })
  │       Hagen proxy klar → updateIngestRun({ result.enrich_summary })
  │
  [CM klassificerar]
  │
  ├── POST /api/admin/concepts { id, backend_data, overrides, ingest_run_id }
  │       API-server: INSERT into concepts → updateIngestRun({ status: completed, stage: saving, concept_id, finished_at })
  │
  └── (om humoristisk) POST /api/studio/concepts/humor-enrich { videoUrl, gcsUri, ingest_run_id }
          API-server: updateIngestRun({ stage: humor_enriching })
          Asynkront → updateIngestRun({ result.humor_enrich })
          Svarar direkt med 202 Accepted (fire-and-forget)
```

---

## Vad som fortfarande saknas för riktig background queue

1. **`ready_for_review` används inte** — status hoppar direkt till `completed` efter save. `ready_for_review` är reserverat för ett framtida flöde där CM granskar analyse-resultatet innan det sparas.
2. **Ingen webhook/polling** — UploadConceptModal vet inte om humor-enrich lyckades; den svarar 202 och frontend ser aldrig resultatet. En polling-loop mot `GET /ingest-runs/:id` eller en Supabase Realtime-prenumeration behövs för live-feedback.
3. **Ingen retry-logik** — om analyze/enrich-proxy misslyckas sätts status `failed` men det finns ingen automatisk återförsöksmekanik.
4. **`hagen_video_id` / `hagen_contract_version` aldrig satt** — Hagen:s analyze-svar innehåller inget explicit `hagen_video_id` i nuvarande kontrakt. Fältet är reserverat för när Hagen exponerar ett stabilt run-id i response-headern eller body.
5. **`classifying`-steget** — CM:s klassificeringsval speglas inte i `stage`. Felrapporten under klassificering (SaveError) markerar inte run som `failed`.
6. **customer_profile_id** — skickas inte från UploadConceptModal (känd inte i upload-kontexten). Behöver skickas från anropet om det görs från en kund-specifik kontext.

---

## Hagen-kontraktsluckor

### `studio_concepts_humor_enrich` saknas i version-manifestet

`GET /api/letrend/version` svarar med:
```json
{
  "routes": {
    "studio_concepts_analyze": "/api/studio/concepts/analyze",
    "studio_concepts_enrich": "/api/studio/concepts/enrich",
    "admin_concepts_translate_vertex": "/api/admin/concepts/translate-vertex"
    // ← studio_concepts_humor_enrich saknas
  }
}
```

Rutten `/api/studio/concepts/humor-enrich` finns i Hagen-koden och proxyn i `studio.ts` fungerar, men den annonseras inte i capabilities-manifestet. Detta innebär att en `HAGEN_BASE_URL`-kapabilitetscheck inte kan verifiera att humor-enrich är tillgänglig.

**Rekommenderad Hagen-patch (ej gjord i denna fas — kräver ändring i riktiga hagen-repot):**
```typescript
// I artifacts/hagen/src/app/api/letrend/version/route.ts
routes: {
  // ... befintliga ...
  studio_concepts_humor_enrich: '/api/studio/concepts/humor-enrich',  // ← lägg till
}
```

### `studio_concepts_humor_enrich` i humor-enrich route kräver Hagen-DB

Hagen:s humor-enrich-rutt skriver till `analyzed_videos` och `concepts` i Hagen:s egna Supabase-projekt (inte LeTrend:s). Fältet `hagen_video_id` i `ingest_runs` är tänkt att referera till Hagen:s `analyzed_videos.id` — men detta ID returneras inte i nuvarande analyze-svar.

---

## Testresultat

- **Typecheck `@workspace/api-server`:** 0 fel ✓
- **Typecheck `@workspace/letrend`:** 0 fel ✓
- **Migration:** Skapad i `supabase/migrations/` — appliceras av orkestratorn, ej körts live i denna fas
- **Bakåtkompatibilitet:** Alla befintliga endpoints fungerar oförändrat om `ingest_run_id` inte skickas

---

## Rekommenderat nästa steg

1. **Applicera migration live** — `supabase/migrations/20260506200000_ingest_runs.sql` mot prod
2. **Lägg `studio_concepts_humor_enrich` i Hagen version-manifeset** (Hagen-repot)
3. **Phase 26b: `GET /ingest-runs/:id` polling i UploadConceptModal** — visa live-status för humor-enrich
4. **Phase 26c: `ready_for_review` flöde** — CM-granskning innan concept sparas
