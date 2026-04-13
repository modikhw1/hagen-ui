# Slice 2.1 History Toggle Implementation

## Sammanfattning

Jag gjorde en liten korrigeringspass som flyttar primary history-UX från bred fri konceptkoppling till en slot-aware `TikTok ↔ LeTrend`-toggle, utan att ändra datamodellen.

Kvarstående modell:

- imported history är fortsatt imported truth
- `row_kind` ändrades inte
- `concept_id` på imported rows ändrades inte
- reconciliation-fälten används fortsatt
- undo är fortsatt clear av reconciliation-fälten

## Ändrade filer

### `app/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx`

Ändrat för att:

- ta bort de redundanta history-labels som lades ovanpå korten
- göra imported history primary CTA till:
  - `Markera som LeTrend`
  - `Markera som TikTok`
- använda nu-slot (`feed_order === 0`) som primary default när CM markerar ett imported klipp som LeTrend
- behålla fri konceptkoppling som secondary/fallback via separat knapp:
  - `Välj LeTrend-koncept...`

Konkreta korrigeringar:

- history-kortens små labels togs bort
- en `currentHistoryDefaultTarget` räknas fram från nu-slot-assignment
- `Markera som LeTrend` gör direkt reconciliation mot nu-slot när sådant koncept finns
- om inget nu-slot-koncept finns öppnas fallback-picker i stället
- om imported history redan är reconciled är primärknappen nu `Markera som TikTok`, vilket kör undo

### `app/src/app/api/studio-v2/history/reconciliation/route.ts`

Ändrat för att:

- stödja ett smalare primary mode för slot-aware reconciliation utan att riva upp nuvarande datamodell

Konkreta korrigeringar:

- `POST` accepterar nu `mode: 'use_now_slot'`
- i detta läge letar routen upp kundens aktuella now-slot-assignment (`feed_order = 0`, `concept_id != null`)
- befintlig `linked_customer_concept_id`-väg finns kvar som fallback/manual path
- `DELETE` lämnades som tidigare undo

## Vad som behölls

- reconciliation-fälten i databasen
- explicit link-model
- imported TikTok truth
- reversibilitet
- fri konceptkoppling som fallback
- produktsemantiken:
  - cron import != advance-plan != mark-produced

## Acceptance check

1. History-korten visar inte längre redundanta textlabels. Ja.
2. Imported history har primär UX som binär `TikTok ↔ LeTrend`-klassning. Ja.
3. `Markera som LeTrend` använder now-slot som primary default när sådant koncept finns. Ja.
4. Toggle tillbaka till `TikTok` är enkel och reversibel. Ja.
5. Imported TikTok truth bevaras fortsatt i datamodellen. Ja.
6. Fri konceptkoppling ligger kvar som fallback/secondary path. Ja.
7. Rapporten beskriver exakt vilka filer som ändrades och varför. Ja.

## Verifiering

- `npx tsc --noEmit` passerar
- riktad ESLint för de ändrade filerna passerar utan errors
- kvarvarande warnings i workspace-filen var redan existerande och är inte specifika för denna correction pass
