# 07: Hagen UI audit brief

Detta ar en avgransad brief for en agent som framst har tillgang till `hagen-ui`. Agenten ska inte behova lasa eller andra `hagen` direkt. Hagen-relaterade fynd ska formuleras fran `hagen-ui`-perspektivet: vilka routes, DTO:er, env-vars och failure states `hagen-ui` forvantar sig.

## Mal

Gor en kod-audit av `hagen-ui` som producerar implementation-ready findings for:

- `/admin/demos`
- customer invite/create och initial ingest
- Studio v2 feed planner
- TikTok history sync och reconciliation
- Hagen proxy/contract fran `hagen-ui`
- CM identity och CRM stage progression
- Supabase migration/schema alignment i `hagen-ui`

Audit ska prioritera buggar, datakontraktsrisker, brutna floden och saknad UI-feedback.

## Viktig avgransning

Agenten ska inte:

- andra designsprak i `/admin/demos`,
- bygga om stora floden direkt,
- anta att `hagen` routes finns utan att verifiera `hagen-ui` proxy/forvantningar,
- anvanda `hagen` som kallkodskrav.

Agenten far:

- lasa `hagen-ui` kod och migrations,
- kora lokala tests/lint om repo stoder det,
- foresla patchar i `hagen-ui`,
- skriva tickets/planer med file/line refs.

## Primara filer att granska

### Admin demos

Sok runt:

```powershell
rg -n "demos|demo|game-plan|preview|Gemini|generate" artifacts
```

Granska sarskilt:

- `/admin/demos` page/components
- demo API-routes i `artifacts/api-server/src/routes`
- public preview routes
- save/update demo route
- modal open/close state
- loading state for generate draft
- preview token/id validation
- CM dropdown/source

Fragor att besvara:

- Varfor kunde "Ny demo" ta ~30 sekunder att oppna modal?
- Finns blocking fetch i modal open path?
- Finns loading/error state for "generera utkast"?
- Varfor postade UI mot `/api/admin/demos/game-plan/generate` om route saknades?
- Varfor kunde save returnera "Cannot coerce the result to a single JSON object"?
- Varfor kunde preview-lanken bli ogiltig direkt efter save?

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
- reuse mellan demo-create och ordinarie invite

Fragor:

- Finns ett centraliserat serviceflode for att skapa kund + starta initial TikTok ingest?
- Bypassar demo-create det ordinarie invite/ingest-flodet?
- Kan UI visa progress tills initial history fetch ar klar?
- Vad hander om TikTok handle saknas?

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

### Supabase schema/migration alignment

Granska:

- `supabase/migrations/*`
- `artifacts/letrend/src/types/database.ts`
- `artifacts/letrend/src/types/database.gen.ts`
- API insert/update payloads mot `concepts`, `customer_concepts`, `cron_run_log`

Bekrafta:

- `concepts.id` maste skickas eller ha default.
- `cron_run_log.thumbnails_refreshed` finns i migration men kanske inte i aktuell DB.
- DB types matchar migrations for `shift_feed_order`.
- `customer_concepts.status` API-kontrakt matchar DB constraint.

### CM identity och CRM progression

Sok:

```powershell
rg -n "team_members|content_manager|cm_id|assigned_cm|lead|dialog|offer|won|lost|stage|status" artifacts
```

Fragor:

- Bygger demo-CM dropdown pa `team_members` i stallet for `profiles`/roles?
- Kan admin med CM-behorighet valjas som demo-CM?
- Var visas "ingen CM" och vilken join/lookup orsakar det?
- Finns action som flyttar CRM fran skickad -> dialog -> offert?
- Ar win/lost de enda stage actions?

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
rg -n "demos|game-plan|preview|generate|team_members|cm_id" artifacts
rg -n "cron_run_log|thumbnails_refreshed|fetch-profile-history|sync-history-all" artifacts supabase
```

## Minsta patchar agenten kan foresla i hagen-ui

Om agenten ska ga fran audit till patch, borja med:

1. API/schema mismatch: stoppa `status='assigned'` eller lagg korrekt migration.
2. API/schema mismatch: generera `concepts.id` vid admin concept create.
3. Hagen proxy: lagg eller hantera missing `/api/studio/concepts/humor-enrich`.
4. Cron health: se till att `cron_run_log` insert matchar migration/DB.
5. Demo flow: loading/error states och korrekt generate route.
6. Demo CM: valjbara CMs fran profiles/roles eller synka team_members tydligt.

Allt annat bor byggas efter affarsbesluten i [06-open-business-logic-questions.md](06-open-business-logic-questions.md).
