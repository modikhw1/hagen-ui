# 03: Hagen ingest contract

## Mal

Definiera ett stabilt kontrakt mellan `hagen-ui` och `hagen` sa att ingestmotorn kan utvecklas utan att UI, CRM, demo-flow och feed planner maste veta om interna promptar, GCS, Vertex, Gemini eller Hagen-tabeller.

Detta ska losa:

- Två repos med drift.
- Otydliga endpoints och versionsskillnader.
- Metadata som ar rik men inte koncentrerad mot appens anvandning.
- UI-floden som inte vet om ingest pagar, misslyckades eller ar redo for review.

## Repo-lage

### `hagen-ui`

`hagen-ui` proxyar dyra analysroutes via Express:

- `POST /api/studio/concepts/analyze` -> Hagen `/api/studio/concepts/analyze`
- `POST /api/studio/concepts/enrich` -> Hagen `/api/studio/concepts/enrich`

Frontend skickar ocksa fire-and-forget:

- `POST /api/studio/concepts/humor-enrich`

Men `artifacts/api-server/src/routes/studio.ts` har ingen proxy for `humor-enrich`. Det betyder att `UploadConceptModal` sannolikt anropar en route som 404:ar eller aldrig nar Hagen.

Andra Hagen-relaterade forvantningar i `hagen-ui`:

- `HAGEN_BASE_URL`
- `/api/letrend/version`
- `/api/letrend/concept/prepare`
- `/api/letrend/library`
- `/api/studio-v2/customers/:id/hagen-clips`

### `hagen`

Lokal repo-status:

- Branch `main` ligger 6 commits bakom `origin/main`.
- Lokala modifikationer finns i `src/app/api/videos/*`, registry, storage och typer.
- Untracked LeTrend-arbete finns i:
  - `src/app/api/letrend/*`
  - `src/prompts/*`
  - `src/services/*`
  - `src/types/letrend-signals.ts`
  - scripts och tempfiler

Remote `origin/main` innehaller nya Studio-routes:

- `src/app/api/studio/concepts/analyze/route.ts`
- `src/app/api/studio/concepts/enrich/route.ts`
- `src/app/api/studio/concepts/humor-enrich/route.ts`

Den lokalt utcheckade filstrukturen saknar dock `src/app/api/studio` tills branch uppdateras/mergas.

Detta ar en deploy-risk: `hagen-ui` kan vara byggd mot en Hagen-version som varken motsvarar lokal worktree eller production-deploy.

## Nuvarande Hagen-pipelines

### Legacy video analysis

Routes som redan fanns:

- `src/app/api/videos/create/route.ts`
- `src/app/api/videos/analyze/route.ts`
- `src/app/api/videos/analyze/deep/route.ts`
- `src/app/api/videos/library/route.ts`

Datamodell i Hagen-migrationer:

- `analyzed_videos`
- `video_ratings`
- `video_signals`
- `rating_schema_versions`
- relaterade brand/tuning/humor-tabeller

`analyze/deep` ar en stor pipeline:

- krav pa befintlig `analyzed_videos`-rad
- download via Scraper7, yt-dlp och Supadata fallback
- upload till Gemini File API
- `GeminiVideoAnalyzer`
- optional brand analyzer
- sparar `visual_analysis`, embedding m.m.

### Studio concept routes pa remote

`origin/main` har nya routes for LeTrend Studio:

- `studio/concepts/analyze`: laddar ner video, laddar upp till Gemini/GCS och returnerar analys + `gcsUri`.
- `studio/concepts/enrich`: tar `backend_data` och skapar svenska, appklara concept fields.
- `studio/concepts/humor-enrich`: async tuned humor pass, patchar `analyzed_videos.visual_analysis.script.humor` och `concepts.backend_data.script.humor`.

`hagen-ui` saknar proxy for `humor-enrich`, trots att frontend anropar den.

### Lokalt untracked LeTrend signalflode

Lokala untracked filer i `hagen` visar ett mer koncentrerat signalflode:

- `src/types/letrend-signals.ts`
- `src/prompts/letrend-extraction.ts`
- `src/services/letrend-pipeline.ts`
- `src/services/signal-extractor.ts`
- `src/services/signal-store.ts`
- `src/services/tone-analyzer.ts`

Denna pipeline:

- anvander Vertex/Gemini `gemini-2.0-flash-001`
- extraherar observerbara signaler
- sparar `schema_version='v2.0'` i `video_signals`
- skriver top-level LeTrend-kolumner pa `analyzed_videos`
- skapar ett smalare schema kring format, hook, tone, editing, replicability och resurser

Det ser ut som ratt riktning for affarsnytta: mer filtrerbar metadata, mindre okoncentrerad output.

## Nuvarande kontraktsproblem

### 1. Route-kontraktet ar inte explicit

`hagen-ui` vet implicit vilka Hagen-routes som finns. Det finns ingen health/capabilities/version-route som sager:

- vilka endpoints ar aktiva
- vilken DTO-version returneras
- vilken model/prompt-version anvands
- vilken databas ar Hagen kopplad till

### 2. `hagen-ui` och `hagen` delar inte databas via MCP

MCP-kopplad Supabase saknar Hagen-tabeller:

- `analyzed_videos`
- `video_signals`
- `video_ratings`
- `rating_schema_versions`

All Hagen-integration som kraver data fran de tabellerna maste antingen:

- ga via Hagen API,
- eller koppla ratt Supabase-projekt till MCP/infra,
- eller migrera vissa data till LeTrend DB.

### 3. Metadata ar inte uppdelad efter konsumtion

Appen behover olika metadata-nivaer:

- Raw observable analysis.
- Reviewable CM-fields.
- Customer-facing concept copy.
- Planner/filter signals.
- Matching signals mot TikTok-historik.

Idag blandas detta ofta i `backend_data`, `visual_analysis`, `overrides` och promptresultat.

## Foreslaget canonical contract

Skapa en versionerad DTO, exempelvis `HagenConceptCandidateV1`.

```ts
type HagenConceptCandidateV1 = {
  contract_version: 'hagen-concept-candidate.v1';
  hagen_video_id: string;
  source_url: string;
  storage: {
    gcs_uri?: string | null;
    gemini_file_uri?: string | null;
  };
  extraction: {
    schema_version: string;
    model: string;
    prompt_version: string;
    raw_status: 'pending' | 'processing' | 'processed' | 'failed';
  };
  signals: {
    format_type?: string | null;
    topic_category?: string | null;
    hook_type?: string | null;
    hook_text?: string | null;
    primary_tone?: string | null;
    humor_type?: string | null;
    energy_level?: number | null;
    editing_style?: string | null;
    camera_style?: string | null;
    replicability_score?: number | null;
    required_resources?: string[];
  };
  concept: {
    title: string;
    angle: string;
    description: string;
    script_outline?: string[];
    customer_value?: string | null;
  };
  review: {
    confidence: number | null;
    warnings: string[];
    needs_cm_review: boolean;
  };
};
```

`hagen-ui` ska spara denna i `concepts.backend_data` med `schema_version`, och sedan lata `content_overrides` vara kundspecifik copy.

## Rekommenderade endpoints

### Hagen

- `GET /api/letrend/version`
  - returnerar service version, commit, active DTO versions och capabilities.

- `POST /api/studio/concepts/analyze`
  - input: `videoUrl`
  - output: raw analysis + storage refs + `hagen_video_id`

- `POST /api/studio/concepts/enrich`
  - input: raw analysis eller `hagen_video_id`
  - output: `HagenConceptCandidateV1`

- `POST /api/studio/concepts/humor-enrich`
  - input: `videoUrl`, optional `gcsUri`, optional concept id
  - output: accepted/run id eller final patch result

- `GET /api/letrend/library`
  - output: paginated candidates med status/filter

- `POST /api/letrend/concept/prepare`
  - om den ska finnas kvar: returnera exakt samma `HagenConceptCandidateV1`.
  - annars: ta bort proxy/forvantning i `hagen-ui`.

### hagen-ui

- Proxy alla Hagen-routes som frontend behover via `artifacts/api-server/src/routes/studio.ts` eller en separat `hagen.ts`.
- Inga direkta fire-and-forget-anrop fran frontend utan progress/status.
- Spara `hagen_contract_version` pa `concepts`.

## Implementeringsplan for agent

### Fas 1: Route hygiene

1. Uppdatera lokal `hagen` med `origin/main` eller dokumentera deploy branch explicit.
2. Lagg proxy for `/api/studio/concepts/humor-enrich` i `hagen-ui` om route ska anvandas.
3. Lagg `/api/letrend/version` i Hagen eller ta bort `hagen-ui`-forvantningen.
4. Lagg smoke-test som validerar `HAGEN_BASE_URL` capabilities innan Studio upload anvands.

### Fas 2: DTO och storage

1. Skapa gemensam typefil eller JSON schema for `HagenConceptCandidateV1`.
2. Lagg converter fran Hagen raw analysis till `concepts.backend_data`.
3. Lagg explicit `schema_version` pa sparade konsepter.
4. Gor admin concept editor resilient mot okand/aldre schema-version.

### Fas 3: Ingest job status

1. Inför `ingest_runs` i LeTrend DB eller Hagen DB, beroende pa agarskap.
2. UI ska visa:
   - queued
   - analyzing
   - enriching
   - ready_for_review
   - failed
3. Demo/customer creation ska kunna starta ingest och visa spinner tills initial kundprofil-fetch ar klar.

### Fas 4: Review UI

1. Bygg en CM-review vy kring de faktiska signalerna som anvands i appen.
2. Gor varje signal overridebar dar den paverkar planner/customer UI.
3. Spara human overrides separerat fran extracted metadata.

## Testkrav

- Contract test `hagen-ui` -> Hagen capabilities.
- Proxy test for analyze/enrich/humor-enrich.
- Unit-test for mapping `HagenConceptCandidateV1` -> `concepts.backend_data`.
- UI-test for upload flow med progress och failure.
- Integration smoke mot staging Hagen.

## Oppna affarsfragor

Se [06-open-business-logic-questions.md](06-open-business-logic-questions.md), sarskilt:

- Vilka metadatafalt ar absoluta krav for Feed Planner-affarsvardet?
- Ska Hagen vara enda agaren av video analysis, eller ska LeTrend DB lagra en kopia av reviewade signaler?
- Ska demo-create trigga full profile/history ingest direkt, eller bara en initial "minimum viable" fetch?
