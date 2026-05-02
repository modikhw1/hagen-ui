# Slice 2.1 History Toggle Correction Review

## Current-System Truth From Code

Den nuvarande Slice 2-implementationen innehåller redan två olika logiker samtidigt.

### 1. Underliggande datamodell

I datamodellen förblir importerad historik importerad sanning:

- imported history ligger kvar som `row_kind = 'imported_history'`
- imported history har fortsatt `concept_id = null`
- reconciliation lagras separat via:
  - `reconciled_customer_concept_id`
  - `reconciled_by_cm_id`
  - `reconciled_at`

Detta normaliseras i:

- `app/src/lib/studio/customer-concepts.ts`
- `app/src/types/studio-v2.ts`

Det betyder att implementationen redan valde en reversibel explicit-link-modell, inte en destruktiv mutation av imported row till LeTrend-row.

### 2. Nuvarande reconciliation-API

I `app/src/app/api/studio-v2/history/reconciliation/route.ts` är primärmodellen idag:

- en imported history row kan reconcileras till ett explicit valt LeTrend-managed assignment
- API:t kräver idag `linked_customer_concept_id`
- undo är att nolla reconciliation-fälten

Alltså: backendens primära semantik är idag fri assignment-länkning.

### 3. Nuvarande feed/workspace-UX

I `app/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx` finns idag:

- små labels på historikkort:
  - `LeTrend-producerad`
  - `LeTrend-kopplad`
  - `TikTok`
- en history-meny med CTA:
  - `Koppla till LeTrend-koncept`
  - `Ändra LeTrend-koppling`
- en picker/dropdown över möjliga assignment-rader

Det gör reconciliation-UX:en bred och generell.

### 4. Redan existerande nu-slot-logik

Samtidigt finns redan en stark nu-slot-operativ default på annan plats i samma fil:

- `pendingAdvanceCue`
- `nuConcept`
- `freshImportedConcepts`
- CTA:n `Markera och flytta`

Det flödet utgår redan från att nytt observerat klipp i normalfallet relaterar till aktuellt nu-koncept.

Det innebär att nu-slot-antagandet redan finns i systemet som operativ sanning, men att Slice 2-historik-UX:en byggdes bredare än detta.

## Intended-System Correction

Den avsedda modellen bör vara:

- cron förblir observation-only
- imported TikTok history förblir imported truth som default
- den vanligaste CM-handlingen ska vara binär klassning:
  - detta är fortfarande `TikTok`
  - detta ska behandlas som `LeTrend`
- när `LeTrend` väljs ska nu-slot vara primärt defaultmål
- om klippet i verkligheten var kundens eget ska CM enkelt kunna toggla tillbaka till `TikTok`

Fri konceptkoppling kan få finnas kvar som fallback/intern mekanik, men ska inte vara primär CTA eller primär mental modell.

## Gap Assessment

### Vad som redan är rätt

- imported truth bevaras
- reconciliation är explicit
- reconciliation är reversibel
- ingen automatisk matching har införts
- nu-slot finns redan som operativ default i cue-flödet

### Vad som är fel just nu

- labels på korten är redundanta eftersom visuell skillnad redan finns
- primary reconciliation-UX är för generell
- UI:t signalerar att CM ska välja mellan många LeTrend-koncept, trots att common case är binär historikklassning
- API:t är formulerat som fri linking först, slot-aware toggle först i andra hand

### Konsekvens

Det finns alltså inte främst ett datasäkerhetsproblem, utan ett produktmetafor-problem:

- datamodellen är i stort sett användbar
- den primära UX-metaforen är felkalibrerad

## Recommended Minimum Code Changes Now

### 1. Ta bort redundanta history-labels

Ta bort de små labels som renderas på history-korten:

- `LeTrend-producerad`
- `LeTrend-kopplad`
- `TikTok`

Detta är en direkt, låg-risk korrigering i:

- `app/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`

### 2. Byt primary CTA från picker till toggle

På imported history bör primary CTA bli:

- `Markera som LeTrend`
- eller, om redan LeTrend:
  - `Markera som TikTok`

Detta gör binär 0/1-klassning till huvudflöde.

### 3. Använd nu-slot som primary default

När CM väljer `Markera som LeTrend` ska UI:t:

- först försöka använda aktuellt `feed_order === 0` assignment
- bara falla tillbaka till fri konceptval om inget rimligt nu-slot-koncept finns

Detta bör göras i:

- `app/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`

### 4. Behåll nuvarande link-model i backend, men smalna primary mode

Backend behöver inte kastas om.

Minsta säkra ändring är att:

- behålla reconciliation-fälten
- behålla undo
- lägga till ett smalare primary request-läge i:
  - `app/src/app/api/studio-v2/history/reconciliation/route.ts`

Exempel:

- `mode: 'use_now_slot'`
- fallback:
  - `linked_customer_concept_id`

På så sätt kan den breda länkningsmekaniken finnas kvar som fallback utan att vara primär produktmetafor.

### 5. Behåll full reversibilitet

Ingen ändring bör göras som:

- sätter `concept_id` på imported row
- byter row kind
- förstör TikTok-origin

Undo ska fortsatt vara:

- clear av reconciliation-fälten

## What Should Be Kept vs Degraded to Fallback/Deferred

### Behåll

- DB-fälten för reconciliation
- `reconciliation`-boundary i typer och normalizer
- explicit undo via `DELETE /api/studio-v2/history/reconciliation`
- möjligheten att länka imported row till ett assignment

### Degradera till fallback

- fri dropdown över alla assignments som primär CTA
- bred copy om att “koppla till LeTrend-koncept” som huvudmetafor
- generell manual mapping som förstahandsinteraction

### Defer

- full multi-concept reconciliation-UX
- bredare “match to any concept” flow som standard
- större lifecycle-modell för skipped/unmatched beyond enkel toggle

## Concrete Files Impacted

### Måste påverkas nu

- `app/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`
- `app/src/app/api/studio-v2/history/reconciliation/route.ts`

### Kan behöva liten följdjustering

- `app/src/lib/studio/customer-concepts.ts`
- `app/src/types/studio-v2.ts`

### Bör inte behöva ändras i denna korrigeringspass

- `app/src/app/api/studio-v2/feed/mark-produced/route.ts`
- `app/src/app/api/studio-v2/internal/sync-history-all/route.ts`
- `app/src/lib/studio/history-import.ts`

Detta eftersom kärnproblemet nu främst är primary UX/metafor, inte observation/import-semantik.

## Acceptance Criteria

1. History-korten visar inte längre redundanta textlabels som bara upprepar visuell identitet.
2. Imported history har primär UX som binär `TikTok ↔ LeTrend`-klassning.
3. `LeTrend`-val använder nu-slot som primary default när ett aktuellt nu-koncept finns.
4. Toggle tillbaka till `TikTok` är enkel och reversibel.
5. Imported TikTok truth bevaras fortsatt i datamodellen.
6. Fri konceptkoppling, om den behålls, ligger som fallback/secondary path och inte som primär CTA.
7. `cron import`, `advance-plan` och `mark-produced` behåller nuvarande separata semantik.
