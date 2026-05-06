# Agent Plans: Core video, ingest och TikTok-floden

Senast kartlagt: 2026-05-06.

Detta ar ett implementeringsunderlag for kommande agenter. Syftet ar inte att beskriva allt i appen, utan att peka ut de tre floden som idag saknar tydlig centralisering:

1. Kundens video-/concept-cascade fran ingest till customer facing vy.
2. Hagen-ingestmotorn och kontraktet mellan `hagen-ui` och `hagen`.
3. TikTok scrape/sync, cron och matchning mellan rekommendation och historik.

## Underlag

Kartlaggningen bygger pa:

- Kod i `C:\Users\praiseworthy\Desktop\hagen-ui`.
- Kod i `C:\Users\praiseworthy\Desktop\hagen`.
- Supabase MCP mot nuvarande LeTrend/Hagen UI-projekt.
- Git-status i `hagen`: lokal branch `main` ligger 6 commits bakom `origin/main` och har lokala, ej committade/untracked LeTrend-routes och signalpipeline.

Viktigt: Supabase MCP-projektet som ar kopplat har LeTrend-tabeller som `concepts`, `customer_concepts`, `sync_runs`, `tiktok_videos` osv. Det har inte Hagen-tabellerna `analyzed_videos`, `video_signals`, `video_ratings` eller `rating_schema_versions`. Hagen-databasen ar alltsa inte samma MCP-kopplade databas, eller sa saknas dess schema i detta projekt.

## Filer

- [01-core-customer-concept-contract.md](01-core-customer-concept-contract.md)  
  Grundobjektet bakom koncept, kundkoncept, historik, samarbete och publicerad TikTok.

- [02-feed-planner-and-reconciliation.md](02-feed-planner-and-reconciliation.md)  
  Feed planner-modellen, mark-produced, auto-reconcile och vad som bor centraliseras i en planmotor.

- [03-hagen-ingest-contract.md](03-hagen-ingest-contract.md)  
  Kontraktet mellan `hagen-ui` och `hagen`, nuvarande route-drift, metadata-pipeline och forslag pa canonical DTO.

- [04-tiktok-sync-cron-observability.md](04-tiktok-sync-cron-observability.md)  
  TikTok profile sync, GitHub Actions cron, locks, budget, nudge och observability.

- [05-implementation-sequencing.md](05-implementation-sequencing.md)  
  Rekommenderad ordning for implementation, workstreams och test gates.

- [06-open-business-logic-questions.md](06-open-business-logic-questions.md)  
  Affarslogik som behover beslutas innan vissa tekniska val lases.

- [07-hagen-ui-audit-brief.md](07-hagen-ui-audit-brief.md)  
  Avgransad audit-brief for en agent som framst har tillgang till `hagen-ui` och inte har Supabase MCP.

## Snabba verifierade risker

- `customer_concepts.status` i databasen tillater bara `draft`, `sent`, `produced`, `archived`, `history_import`, men `POST /api/studio-v2/customers/:customerId/concepts` satter vanliga koncept till `assigned`.
- `concepts.id` ar `text not null` utan default, men `POST /api/admin/concepts` skickar inte `id`.
- Feed planner klassar `row_kind === imported_history` som historik fore den kontrollerar collaboration. Eftersom `concept_id IS NULL` anvands for bade TikTok-historik och samarbeten kan collaboration hamna i fel kategori.
- Frontend-kommentaren i `handleCheckAndMarkProduced` sager att auto-reconcile redan flyttar planen. Nuvarande `tiktok-sync.ts` lankar och kopierar stats, men avancerar inte planen.
- `performMarkProduced` finns som delad service, men aktiva Express-routen `/api/studio-v2/feed/mark-produced` har separat JS-loop.
- `cron_run_log` i databasen saknar `thumbnails_refreshed`, trots att repo-migrationen finns och sync-koden insertar den kolumnen. Tabellen har 0 rader.
- Reconciliation-data ar inkonsekvent mot dagens kodintention: 4 `customer_concepts`-rader har `reconciled_customer_concept_id`, men i aktuell DB ligger de pa `status='produced'`; `history_import`-raderna har 0 länkade targets.
- `hagen-ui` proxyar och/eller forvantar sig routes som den lokala `hagen`-worktreen inte har i utcheckat lage, och `origin/main` har nya studio-routes som lokal branch annu inte har mergat.

## Arbetsprincip for kommande agenter

- Gor inga stora visuella redesigns i `/admin/demos` eller `/studio/customer` nar detta implementeras. Bevara designspraket och flytta logik forst.
- Borja med kontrakt och schemafel innan UI-polish. Annars kommer samma symptom tillbaka.
- Alla serverkommandon som flyttar feed/timeline ska ga via en central service eller ett tydligt RPC-kontrakt.
- Alla nya async-floden ska ha progress/status i UI och en server-side run-log, inte bara fire-and-forget.
- Halla `hagen-ui` och `hagen` i explicit versionerat kontrakt: capabilities/version endpoint, DTO-version och route tests.

## Om en standby-agent bara har hagen-ui

Anvand [07-hagen-ui-audit-brief.md](07-hagen-ui-audit-brief.md). Den filen begransar arbetet till det som kan verifieras och forberedas i `hagen-ui` utan Supabase MCP: API-proxies, Supabase-migrationer/types, planner-kod, video-/concept-cascade, customer ingest och TikTok sync/reconciliation. Demos, CM-identity och CRM-stage progression ar inte primart scope for de tre karnaflodena.
