# 05: Implementation sequencing

## Mal

Ge kommande agenter en ordning som minskar risken for att stora arkitekturandringar bryter befintliga admin- och kundfloden.

Rekommendationen ar att inte forsoka bygga allt i en enda branch. Borja med kontrakts- och schemafel, sedan central planmotor, sedan Hagen/TikTok-forbattringar.

## Fas 0: Skydda nulaget

Agare: en agent.

1. Kontrollera git-status i bade `hagen-ui` och `hagen`.
2. Skapa branch for planarbete.
3. Dokumentera vilken `HAGEN_BASE_URL` som anvands lokalt/staging/prod.
4. Verifiera vilken Supabase-databas Hagen anvander. Nuvarande MCP-projekt saknar Hagen-tabeller.
5. Kor befintliga relevanta tester innan andringar.

Output:

- Kort statuskommentar i PR.
- Ingen produktionskod andrad an.

## Fas 1: Snabba blockerande fixar

Agare: en API-agent.

Filer:

- `artifacts/api-server/src/routes/studio-v2.ts`
- `artifacts/api-server/src/routes/admin/concepts.ts`
- `artifacts/api-server/src/routes/studio.ts`
- `supabase/migrations/*`

Uppgifter:

1. Fix: `POST /api/studio-v2/customers/:customerId/concepts` far inte skriva `status='assigned'` om DB inte tillater det.
2. Fix: `POST /api/admin/concepts` ska generera/skicka `concepts.id`.
3. Fix: lagg proxy for `/api/studio/concepts/humor-enrich` eller ta bort frontend-anropet.
4. Fix: applicera/skapa migration for `cron_run_log.thumbnails_refreshed`.
5. Fix: verifiera att demo/customer create inte bypassar obligatorisk initial TikTok/profile ingest utan progress.

Test gates:

- API unit/integration tests for concept create/assign.
- Manual smoke: skapa nytt koncept, assigna till kund, oppna feed planner.
- Manual smoke: cron-health visar korrekt status eller tydlig tom-state.

## Fas 2: Core contract

Agare: en schema/read-model-agent.

Filer:

- `supabase/migrations/*`
- `artifacts/letrend/src/lib/studio/customer-concepts.ts`
- `artifacts/letrend/src/types/studio-v2.ts`
- `artifacts/api-server/src/routes/studio-v2.ts`
- `artifacts/api-server/src/lib/studio/tiktok-sync.ts`

Uppgifter:

1. Lagg explicit `row_kind` eller motsvarande pa `customer_concepts`.
2. Backfilla `assignment`, `collaboration`, `history_import`.
3. Uppdatera alla inserts.
4. Uppdatera normalizer sa UI inte langre maste tolka `concept_id=null`.
5. Lagg tests for row-kind.

Test gates:

- Planner tests passerar.
- Existing history_import rows visas som historik.
- Collaboration visas som collaboration.
- Customer-facing feed fungerar.

## Fas 3: Feed plan engine

Agare: en backend-agent.

Filer:

- `artifacts/api-server/src/lib/studio/feed-plan-engine.ts` (ny)
- `artifacts/api-server/src/routes/studio-v2.ts`
- `artifacts/letrend/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`
- `artifacts/letrend/src/components/studio/customer-detail/FeedPlannerSection.tsx`
- `artifacts/letrend/src/lib/studio/planner/*`

Uppgifter:

1. Flytta mark-produced-affarslogik till central API-server service.
2. Ta bort eller arkivera duplicerad `performMarkProduced`-logik om den inte anvands.
3. Gor `/feed/mark-produced` transaktionell/idempotent.
4. Andra `handleCheckAndMarkProduced` sa den skiljer pa:
   - imported
   - reconciled
   - advanced
   - review required
5. Alla feed write-routes returnerar enhetliga action-resultat.

Test gates:

- Mark-produced flyttar bara planerade assignments.
- Auto-reconcile utan advance rapporteras korrekt.
- UI spinner/busy-state fungerar for sync/reconcile/mark-produced.

## Fas 4: Hagen contract

Agare: en cross-repo-agent.

Filer i `hagen-ui`:

- `artifacts/api-server/src/routes/studio.ts`
- `artifacts/letrend/src/components/studio/UploadConceptModal.tsx`
- concept mapping/helpers

Filer i `hagen`:

- `src/app/api/studio/concepts/*`
- `src/app/api/letrend/*`
- `src/services/*`
- `src/types/letrend-signals.ts`

Uppgifter:

1. Uppdatera lokal `hagen` mot `origin/main` och hantera lokala untracked LeTrend-filer.
2. Bestam om `src/app/api/letrend/*` ska mergeas, flyttas eller kastas.
3. Lagg `/api/letrend/version` eller capabilities endpoint.
4. Versionera `HagenConceptCandidateV1`.
5. Uppdatera `hagen-ui` mapping till DTO.
6. Lagg upload/ingest progress och failure states.

Test gates:

- Contract test mellan `hagen-ui` och Hagen.
- Analyze/enrich/humor-enrich fungerar via proxy.
- Concept sparas med stabil `backend_data.schema_version`.

## Fas 5: TikTok observability och matching

Agare: en sync-agent.

Filer:

- `artifacts/api-server/src/lib/studio/tiktok-sync.ts`
- `artifacts/api-server/src/routes/studio-v2.ts`
- `artifacts/letrend/src/app/admin/(ops)/cron-health/page.tsx`
- `artifacts/letrend/src/components/studio/customer-detail/*`
- migrations for candidate/job tables om valda

Uppgifter:

1. Reparera cron-run logging och admin health.
2. Lagg "run sync now" per kund.
3. Skapa reconciliation candidates eller utoka befintlig nudge-modell.
4. Matcha flera nya klipp robust.
5. Koppla accepted match till feed plan engine.

Test gates:

- Manual sync med 0/1/flera nya klipp.
- Rate limit/budget case.
- Stale lock cleanup.
- Admin cron-health visar senaste runs.

## Fas 6: Demo/customer creation

Agare: en admin-flow-agent.

Filer:

- `/admin/demos` frontend och API-routes
- customer creation/invite routes
- TikTok sync trigger
- preview public route

Uppgifter:

1. Demo-create ska anvanda samma customer/profile-ingest service som ordinarie customer invite.
2. Visa progress:
   - customer created
   - profile fetch started
   - TikTok history imported
   - game plan/generated preview ready
3. Preview-lank ska verifiera token och demo/customer id deterministiskt.
4. CM-val ska bygga pa `profiles`/roles eller synka `team_members` sa behorig admin/CM kan valjas.

Test gates:

- Skapa demo, byt CM, spara, oppna preview.
- Gemini/Hagen-fel visas som recoverable state.
- Modal close fungerar.
- Company list ar editable dar business flow kraver det.

## Rekommenderad branch/PR-uppdelning

1. `fix/core-api-schema-mismatches`
2. `feature/customer-concept-row-kind`
3. `feature/feed-plan-engine`
4. `feature/hagen-contract-v1`
5. `feature/tiktok-sync-observability`
6. `feature/demo-create-ingest-progress`

Varje PR ska ha egen migration/test gate. Undvik att blanda UI-design med datakontrakt i samma PR.
