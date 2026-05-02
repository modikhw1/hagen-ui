# Feed Planner — System Overview

## LeTrend som tjänst

LeTrend är en Content Manager (CM)-driven TikTok-konsulttjänst. CMs kuraterar innehållskoncept åt kunder och hjälper dem att ladda upp dessa som TikTok-klipp. Det finns inget eget LeTrend-videobibliotek — TikTok-profilen är sanningskällan för allt som faktiskt publicerats.

En kund är antingen `active` (aktivt samarbete) eller `agreed`/annan status. Aktiva kunder förväntas följa LeTrends kurering: om ett koncept ligger i "nu" antas nästa klipp som dyker upp på kundens TikTok-profil vara det konceptet.

---

## Feed Planner — Översikt

Feed plannerä är en kolumnbaserad grid som visar en kunds innehållspipeline. Varje cell är en `FeedSlot` med ett `feed_order`-nummer:

```
+2  ┐
+1  ├─ Kommande (planned)
+0  ─── Nu (current)
-1  ┐
-2  ├─ Historik
-3  ┘
```

`feed_order` är inte en identitet — det är bara position. Konceptens identitet bärs av `id` (rad-ID) och för LeTrend-kort av `concept_id` (källkoncept-ID).

Antalet kolumner konfigureras via `gridConfig.columns` (vanligtvis 3). Varje rad i griden innehåller `columns` antal FeedSlots.

### Slot-typer

| `slot.type` | `feed_order` | Innehåll |
|---|---|---|
| `empty` | ≥ 0 | Ingen kund-koncept-rad — tomt kommande-slot |
| `planned` | > 0 | LeTrend-koncept tilldelat men ej producerat |
| `current` | = 0 | Aktuellt nu-koncept |
| `history` | < 0 | Producerad historik (LeTrend eller TikTok) |

---

## Datakällan: `customer_concepts`-tabellen

Alla kort kommer från en enda tabell: `customer_concepts`. Raden skiljer sig åt beroende på `concept_id`:

### LeTrend-kort (`row_kind = 'assignment'`)
- `concept_id IS NOT NULL` — pekar på ett källkoncept i `concepts`-tabellen
- Bär LeTrend-innehåll: rubrik, manus, instruktioner, cm_note, taggar
- Placeras i griden via `feed_order` (0 = nu, >0 = kommande, <0 = historik)

### TikTok-importerat kort (`row_kind = 'imported_history'`)
- `concept_id IS NULL`
- Skapas av import-flödet från TikTok-profilen
- Bär: `tiktok_url`, `tiktok_thumbnail_url`, `tiktok_views`, `tiktok_likes`, `tiktok_comments`, `published_at`
- Alltid `feed_order < 0` (placeras direkt i historik)

### Reconciliation — kopplingen mellan de två
`reconciled_customer_concept_id` sitter på den importerade raden och pekar på LeTrend-kortets ID. En reconcilad TikTok-rad är "gömd" från griden (filtreras bort i GET-routen). Dess stats injiceras istället in i LeTrend-historikkortet vid läsning (in-memory join i GET /concepts).

```
imported_history.reconciled_customer_concept_id → assignment.id
```

---

## Korttyper i griden

### Kommande-kort (`type = 'planned'`)
Visar: konceptrubrik, taggar (pills), notering-ikon, planerat publiceringsdatum om satt.

Dropdown-alternativ:
- **Redigera koncept** — öppnar konceptpanelen
- **Sätt planerad publicering** — inline datumväljare
- **Hantera taggar** — inline taggpicker
- **Lägg till notering** — inline texteditor
- **Ta bort från flödet** (röd) — tar bort tilldelningen

### Nu-kort (`type = 'current'`)
Visar: "Nu"-badge, konceptrubrik, taggar, notering, planerat datum. Knapp: **Markera som gjord** (inbyggd i kortet, inte i dropdown).

Klick på "Markera som gjord":
1. Triggar `fetch-profile-history` (hämtar senaste klipp från TikTok-profilen)
2. Om nytt klipp hittades → auto-reconcile kördes → plan avancerad → grid uppdateras
3. Om inget klipp → varningspanel: "Inget nytt klipp hittades" med "Markera ändå" / "Avbryt"

Dropdown-alternativ:
- **Redigera koncept**
- **Sätt planerad publicering**
- **Hantera taggar**
- **Lägg till notering**
- **Ta bort från flödet** (röd)

### Historik LeTrend-kort (`type = 'history'`, `row_kind = 'assignment'`)
Visar: LeTrend-logotyp (övre vänster), taggar, rubrik, datum, notering, statistik-rad (visningar/likes/kommentarer). Om reconcilad: thumbnail som bakgrund, TikTok-stats live från den kopplade importraden.

Klick på kortet: öppnar dropdown direkt.

Dropdown-alternativ:
- **Öppna TikTok ↗** (om `tiktok_url` finns)
- **Öppna kopplat LeTrend-koncept** (om länkat, dvs om en imported_history-rad pekar hit)
- **Lägg till/Redigera notering**
- **Redigera TikTok-länk** — manuell URL-editor
- **Ångra koppling (visa som TikTok)** — bryter reconciliation, importraden återuppstår i griden

### Historik TikTok-kort (`type = 'history'`, `row_kind = 'imported_history'`)
Visar: TikTok-logotyp, thumbnail som bakgrund (om tillgänglig), datum, stats. Dessa är klipp som importerats från profilen men inte (ännu) knutits till ett LeTrend-koncept.

Klick på kortet: öppnar dropdown direkt.

Dropdown-alternativ:
- **Öppna TikTok ↗** (om `tiktok_url` finns)
- **Markera som LeTrend** / **Markera som TikTok** — reconciliation-toggle
- **Välj LeTrend-koncept...** — manuell picker om auto-match är fel
- **Redigera TikTok-länk** — manuell URL-editor
- **Lägg till/Redigera notering**

---

## Cron-flödet (`POST /api/studio-v2/internal/sync-history-all`)

Körs en gång i timmen via GitHub Actions. Skyddas av `CRON_SECRET` i Authorization-headern.

### Steg-för-steg

```
1. Hämta eligible kunder:
   - status IN ('active', 'agreed')
   - tiktok_handle IS NOT NULL
   - last_history_sync_at IS NULL OR < NOW() - 1h

2. För varje kund:
   a. fetchProviderVideos(handle, rapidApiKey, count=10)
      → RapidAPI / tiktok-scraper7 — hämtar senaste 10 klipp

   b. normalizeVideo() per klipp
      → Extraherar: tiktok_url, tiktok_thumbnail_url, tiktok_views,
        tiktok_likes, tiktok_comments, published_at, description

   c. importClipsForCustomer(supabase, customerId, clips):
      - Deduplicerar mot befintliga tiktok_urls i DB
      - Uppdaterar views/likes/comments på redan-importerade rader
      - Infogar nya rader med temporära feed_order
      - Omnumrerar alla imported_history-rader chronologiskt
        (nyast = närmast 0, dvs -1 = senast publicerat)
      - Skriver motorSignalNewEvidence om imported > 0
        (ackumulerar: plussar på befintlig signal istället för att skriva över)
      - Stämplar last_history_sync_at

   d. Om imported > 0 → autoReconcileAndAdvance(supabase, customerId):
      1. Hitta nu-slot (feed_order=0, concept_id IS NOT NULL)
      2. Hitta nyaste ej-reconcilad importrad (feed_order < 0, DESC)
      3. Reconcilera: sätt reconciled_customer_concept_id = nuSlot.id på importraden
      4. performMarkProduced:
         - Phase 1: Flytta kommande-rader (feed_order > 0) ett steg neråt (-1)
         - Phase 2: Flytta importerade rader (feed_order < 0) ett steg neråt (-1)
         - Phase 3: Stämpla nu-raden som producerad (feed_order = -1,
                    produced_at, tiktok_url, published_at)
         - Phase 4: Rensa motor-signal (motorSignalCleared)
      5. Sätt importradens feed_order = null (göms från grid, kvar för stats-join)
      6. Omnumrera kvarvarande ej-reconcilad imported_history
         (placeras direkt under LeTrends historik-floor)

3. Returnera: { processed, signaled, skipped, errors }
```

### Motorns tre tillstånd (på `customer_profiles`)

```
pending_history_advance IS NULL                   → Ingenting på gång
pending_history_advance IS NOT NULL, seen_at NULL → Ny evidens, CM inte agerat
pending_history_advance IS NOT NULL, seen_at SET  → CM sett men inte agerat
```

Motorns signal driver en nudge-UI i feed plannerä ("Granska historiken"-knapp). Signalen klassificeras vid läsning som `fresh_activity` (klipp < 90 dagar gamla) eller `backfill` (äldre klipp — troligen initial import).

---

## Manuella flöden

### fetch-profile-history (`POST /api/studio-v2/customers/[id]/fetch-profile-history`)
Körs vid:
- Första besök hos en kund (`last_history_sync_at IS NULL`) — auto-trigger via useEffect
- CM klickar "Markera som gjord" på nu-kortet — pre-check
- CM klickar "Ladda mer" — paginering med cursor (kör INTE auto-reconcile)

Utan cursor (initial/refresh): samma flöde som cron men för en kund.
Med cursor: laddar äldre historisk data, ingen auto-reconcile.

### mark-produced (`POST /api/studio-v2/feed/mark-produced`)
Manuellt utan föregående klipp-check. Anropas från nu-kortets "Markera ändå" (fallback när inget klipp hittades). Kör `performMarkProduced` utan reconciliation.

### reconciliation (`POST/DELETE /api/studio-v2/history/reconciliation`)
- **POST**: Kopplar en imported_history-rad till ett LeTrend-uppdrag (manuellt eller via use_now_slot)
- **DELETE**: Bryter kopplingen, återställer feed_order på importraden, omnumrerar

---

## Concepts GET — In-memory stats-join

`GET /api/studio-v2/customers/[id]/concepts` bygger vid läsning:

```
reconciledByTarget: Map<assignment_id → imported_row>
```

LeTrend historik-kort (feed_order < 0, concept_id IS NOT NULL) som finns i mappen
enrichas med TikTok-stats från importraden:
- `tiktok_url`, `tiktok_thumbnail_url`, `tiktok_views`, `tiktok_likes`, `tiktok_comments`
- `reconciled_imported_clip_id` (importradens ID — behövs för "Ångra koppling" från LeTrend-sidan)

Reconcilerade importrader filtreras bort från griden. De lever vidare i DB och hämtas av stats-joinen.

---

## Kända spänningar / Öppna frågor

1. **"Markera som gjord" utan klipp**: fetch-profile-history triggas nu, men om ingen klipp hittas kan CM ändå markera manuellt → LeTrend historik-kort utan stats. Ingen framtida auto-match sker (nästa auto-reconcile matchar nästa nu-slot, inte den orphaned -1:an).

2. **Omnumrering och null feed_order**: Reconcilerade importrader har feed_order=null. Dessa ingår inte i omnumreringen vid import. Om reconciliation bryts (Ångra koppling) omnumreras de tillbaka in. Det finns en risk för gap-bildning om sekvensen bryts på konstiga sätt.

3. **Fyra kunder delar samma TikTok-handle** (testdata): Bar 22, Riktad, Pot. kund 24, Rustik 32 importerar alla samma klipp. Auto-reconcile körs för varje kund separat — varje kund med en nu-slot avanceras. Detta är ett testdataproblem, inte en kodbug.

4. **LeTrend-historik utan reconciliation**: Klipp producerade manuellt (via "Markera ändå") har inga TikTok-stats och ingen `reconciled_imported_clip_id`. De visas som rena LeTrend-kort utan thumbnail eller stats.

5. **feed_order-gaps i historik**: Om advance-plan kördes manuellt (t.ex. via "advance-plan"-routen) utan tillhörande import kan det uppstå tomma slots i historik-sekvensen. Dessa visas som `type: 'empty'` i historik-zonen.

---

## Nyckelfilerna

| Fil | Roll |
|---|---|
| `app/src/components/studio/customer-detail/CustomerWorkspaceContent.tsx` | Hela UI:t — FeedPlannerSection, FeedSlot, alla handlers |
| `app/src/lib/studio/auto-reconcile.ts` | Kärnmotor: matchar importklipp → nu-slot, avancerar plan |
| `app/src/lib/studio/perform-mark-produced.ts` | 3-fas plan-advance-logik (delas av cron + manuell) |
| `app/src/lib/studio/history-import.ts` | Dedup → insert → omnumrering → motorSignal |
| `app/src/lib/studio/motor-signal.ts` | Motor-signal helpers och klassificering |
| `app/src/app/api/studio-v2/internal/sync-history-all/route.ts` | Cron-endpoint |
| `app/src/app/api/studio-v2/customers/[customerId]/fetch-profile-history/route.ts` | Manuell fetch (+ auto-reconcile på initial fetch) |
| `app/src/app/api/studio-v2/customers/[customerId]/concepts/route.ts` | GET concepts + in-memory stats-join |
| `app/src/app/api/studio-v2/feed/mark-produced/route.ts` | Manuell mark-produced (fallback, ingen reconciliation) |
| `app/src/app/api/studio-v2/history/reconciliation/route.ts` | POST (koppla) + DELETE (lossa, återställ feed_order) |
