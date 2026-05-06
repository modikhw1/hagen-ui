# 07: Hagen UI audit brief

Detta ar en avgransad brief for en agent som framst har tillgang till `hagen-ui` och inte har Supabase MCP. Agenten ska inte behova lasa eller andra `hagen` direkt, och ska inte forutsatta live-DB-access. Hagen-relaterade fynd ska formuleras fran `hagen-ui`-perspektivet: vilka routes, DTO:er, env-vars och failure states `hagen-ui` forvantar sig.

## Mal

Gor en kod-audit av `hagen-ui` som producerar implementation-ready findings for de tre karnaflodena:

- video-/concept-cascade fran ingest/upload till customer-facing vy
- customer invite/create och initial TikTok/profile ingest
- Studio v2 feed planner
- TikTok history sync och reconciliation
- Hagen proxy/contract fran `hagen-ui`
- statisk Supabase migration/schema alignment i `hagen-ui`

Audit ska prioritera buggar, datakontraktsrisker, brutna floden och saknad UI-feedback.

## Viktig avgransning

Agenten ska inte:

- lagga tid pa `/admin/demos`, annat an om demo-kod direkt ateranvander eller bypassar customer ingest/profile fetch,
- bygga om stora floden direkt,
- anta att `hagen` routes finns utan att verifiera `hagen-ui` proxy/forvantningar,
- anvanda `hagen` som kallkodskrav,
- anvanda Supabase MCP eller forutsatta live-DB-verifiering.

Agenten far:

- lasa `hagen-ui` kod och migrations,
- anvanda repoets Supabase migrations/types som statiskt schema-underlag,
- kora lokala tests/lint om repo stoder det,
- foresla patchar i `hagen-ui`,
- skriva tickets/planer med file/line refs.

## Primara filer att granska

### Video-/concept-cascade

Sok runt:

```powershell
rg -n "UploadConceptModal|customer-feed|CustomerConcept|backend_data|content_overrides|concepts|customer_concepts|studio-v2" artifacts
```

Granska sarskilt:

- `artifacts/letrend/src/components/studio/UploadConceptModal.tsx`
- `artifacts/letrend/src/lib/studio/customer-concepts.ts`
- `artifacts/letrend/src/types/studio-v2.ts`
- `artifacts/letrend/src/lib/customer-feed.ts`
- `artifacts/api-server/src/routes/admin/concepts.ts`
- `artifacts/api-server/src/routes/studio-v2.ts`
- concept/customer-concept mapping helpers

Fragor att besvara:

- Var blandas UI-display, app-copy, backend metadata och ingest-resultat?
- Finns ett canonical read model for `CustomerConcept`, eller tolkar varje vy DB-falt sjalv?
- Kan `content_overrides` fungera som central kundspecifik copy-layer?
- Finns statiska API/schema-mismatches kring `concepts.id`, `concepts.backend_data`, `customer_concepts.status` eller `row_kind`?
- Vilka komponenter/vyer skulle paverkas av en central contract/read-model?

### Customer invite/create och initial ingest

Sok runt:

```powershell
rg -n "invite|customer invite|fetch-profile-history|triggerInitialTikTokSyncBackground|customer_profiles|tiktok_handle" artifacts
```

Granska:

- `/admin/customers`
- customer invite route
- customer creation route
- `triggerInitialTikTokSyncBackground`
- `/api/studio-v2/customers/:customerId/fetch-profile-history`
- eventuell annan kod som skapar customer profile och borde starta samma ingest

Fragor:

- Finns ett centraliserat serviceflode for att skapa kund + starta initial TikTok ingest?
- Kan UI visa progress tills initial history fetch ar klar?
- Vad hander om TikTok handle saknas?
- Finns samma ingest-trigger for upload/ingest, invite och manual fetch, eller ar logiken duplicerad?

### Feed planner och reconciliation

Granska:

- `artifacts/letrend/src/lib/studio/planner/*`
- `artifacts/letrend/src/lib/studio/customer-concepts.ts`
- `artifacts/letrend/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`
- `artifacts/letrend/src/components/studio/customer-detail/FeedPlannerSection.tsx`
- `artifacts/api-server/src/routes/studio-v2.ts`
- `artifacts/api-server/src/lib/studio/tiktok-sync.ts`

Bekrafta eller falsifiera:

- `customer_concepts.status='assigned'` skrivs av API trots DB constraint.
- `concept_id=null` anvands for bade imported history och collaboration.
- `performMarkProduced` ar inte den aktiva Express-routens implementation.
- `handleCheckAndMarkProduced` antyder att auto-reconcile avancerar planen, men backend gor inte det.
- `shift_feed_order` flyttar alla rader med `feed_order`, om den anvands.

Output ska innehalla exakt vilka routes/handlers som maste centraliseras i en feed plan engine.

### Hagen proxy/contract i hagen-ui

Granska bara `hagen-ui`-sidan:

- `artifacts/api-server/src/routes/studio.ts`
- `artifacts/api-server/src/lib/upstream-proxy.ts`
- `UploadConceptModal`
- alla `HAGEN_BASE_URL` references
- alla `/api/letrend/*` references
- alla `/api/studio/concepts/*` references
- `/api/studio-v2/customers/:id/hagen-clips`

Fragor:

- Vilka Hagen endpoints forvantar sig `hagen-ui`?
- Vilka av dem proxyas av `api-server`?
- Finns missing proxy for `humor-enrich`?
- Har UI tydlig failure state om Hagen ar nere?
- Finns version/capabilities check? Om inte, foresla `hagen-ui`-side check som kan byggas utan att andra `hagen`.

### Statisk Supabase schema/migration alignment

Agenten har inte Supabase MCP. Granska endast repoets migrations, genererade typer och API-payloads:

- `supabase/migrations/*`
- `artifacts/letrend/src/types/database.ts`
- `artifacts/letrend/src/types/database.gen.ts`
- API insert/update payloads mot `concepts`, `customer_concepts`, `cron_run_log`

Bekrafta:

- `concepts.id` maste skickas eller ha default.
- `cron_run_log.thumbnails_refreshed` finns i migration men kanske inte i aktuell DB.
- DB types matchar migrations for `shift_feed_order`.
- `customer_concepts.status` API-kontrakt matchar DB constraint.
- Markera tydligt vilka slutsatser som ar statiskt verifierade och vilka som kraver live-DB-verifiering av orkestratorn.

## Forvantad leverans

Svara med:

1. Findings forst, sorterade efter severity.
2. Varje finding ska ha fil/linje, symptom, root cause och konkret fix.
3. Separat "Implementation tickets" med 5-10 avgransade uppgifter.
4. Separat "Needs business decision" bara dar kod inte kan avgora regeln.
5. Lista vilka tests/commands som korde, eller varfor de inte korde.

## Rekommenderade audit-kommandon

```powershell
git status -sb
rg -n "assigned|history_import|reconciled_customer_concept_id|shift_feed_order|performMarkProduced" artifacts supabase
rg -n "HAGEN_BASE_URL|hagen-clips|letrend|humor-enrich|concepts/analyze|concepts/enrich" artifacts
rg -n "cron_run_log|thumbnails_refreshed|fetch-profile-history|sync-history-all" artifacts supabase
rg -n "UploadConceptModal|customer-feed|backend_data|content_overrides|triggerInitialTikTokSyncBackground" artifacts
```

## Minsta patchar agenten kan foresla i hagen-ui

Om agenten ska ga fran audit till patch, borja med:

1. API/schema mismatch: stoppa `status='assigned'` eller lagg korrekt migration.
2. API/schema mismatch: generera `concepts.id` vid admin concept create.
3. Hagen proxy: lagg eller hantera missing `/api/studio/concepts/humor-enrich`.
4. Cron health: se till att `cron_run_log` insert matchar migration/DB.
5. Customer ingest: centralisera eller tydliggor trigger for initial TikTok/profile fetch.
6. Feed planner: korrigera UI-antagandet att auto-reconcile automatiskt avancerar planen om backend inte gor det.

Allt annat bor byggas efter affarsbesluten i [06-open-business-logic-questions.md](06-open-business-logic-questions.md).
