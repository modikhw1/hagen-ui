# Demo Feed Plan — Data Objects & Visual Components

> Gäller `CustomerPlannerGrid` på demolänken (`/d/[token]`).  
> API: `GET /api/public/demos/:token` → `concepts[]`  
> Källa: `artifacts/api-server/src/routes/public.ts` → `loadPreviewConcepts` + `buildPreviewConcept`

---

## 1. Shared shape — `DemoPreviewConcept`

Båda korttyper (kommande & historik) levereras som samma objekt:

| Fält | Typ | Kommande | Historik |
|---|---|---|---|
| `id` | `string` | ✅ UUID | ✅ UUID |
| `feedOrder` | `number` | `0` (Nu), `1`, `2`, … | `-1`, `-2`, … |
| `source` | `'letrend' \| 'tiktok' \| 'imported_history'` | `"letrend"` | `"tiktok"` |
| `title` | `string` | Konceptrubrik (sv) | `"TikTok-klipp"` (fallback) |
| `headline` | `string \| null` | Konceptrubrik (sv) | `"TikTok-klipp"` (fallback) |
| `thumbnailUrl` | `string \| null` | ⚠️ `null` (se nedan) | ✅ CDN-URL (WebP) |
| `publishedAt` | `string \| null` | `null` | ✅ ISO 8601 |
| `views` | `number \| null` | `null` | ✅ antal visningar |
| `tag` | `string \| null` | Första taggen om satt | `null` |
| `whyWorks` | `string \| null` | ✅ Varför det fungerar | `null` |
| `whyFits` | `string \| null` | ✅ Varför det passar kunden | `null` |
| `originalUrl` | `string \| null` | ✅ TikTok-inspirationslänk | ✅ TikTok-videolänk |

---

## 2. Kommande (feedOrder ≥ 0)

### Ordningslogik
Alla koncept sorteras av API:et med samma **dense queue**-modell som studions feedplanerare:  
`feed_order ASC → added_at ASC → id ASC` → tilldelas positionerna `0, 1, 2, 3, …`  
(Råvärdet i DB spelar ingen roll — alla nylagda koncept får `feed_order = 1` som default.)

### Exempelobjekt
```json
{
  "id": "8be23b44-3f37-4fe6-8734-e10e537f70b4",
  "feedOrder": 0,
  "title": "An employee passively aggressively labels a co-worker...",
  "source": "letrend",
  "tag": null,
  "thumbnailUrl": null,
  "publishedAt": null,
  "views": null,
  "headline": "An employee passively aggressively labels a co-worker...",
  "whyWorks": "Formatet fungerar eftersom twisten i payoffen är lätt att förstå...",
  "whyFits": "Fungerar bra i restaurangmiljö där service, gästmöten eller kök...",
  "originalUrl": "https://www.tiktok.com/@muffinbreaknotts/video/..."
}
```

### Thumbnail-situation ⚠️
Kommande-kort saknar idag thumbnail. `buildPreviewConcept` letar i denna prioritetsordning:

1. `customer_concepts.tiktok_thumbnail_url` — ej satt för planerade
2. `content_overrides.thumbnail_url` / `content_overrides.thumbnailUrl` — ej satt
3. `concepts.backend_data.thumbnail_url` / `thumbnailUrl` — kan finnas i konceptbiblioteket
4. `concepts.backend_data.cover_image_url` / `coverImageUrl` — kan finnas

**Möjliga lösningar:**
- **Alt A** — `concepts.backend_data` för LeT-koncept innehåller ibland en `cover_image_url` från källvideon. Kolonnen är redan SELECT:ad; skulle räcka att fylla den med källans thumbnail.
- **Alt B** — CM sätter en `tiktok_thumbnail_url` manuellt via studio-patchen på `PATCH /api/studio-v2/concepts/:id`.
- **Alt C** — Generera thumbnail on-the-fly med `thumbnailUrl` från `originalUrl` (kräver screenshot-tjänst).

---

## 3. Historik (feedOrder < 0)

### Ordningslogik
TikTok-importer (`status = 'history_import'`) sorteras `published_at DESC` → `-1` = senast publicerad.  
Explicit producerade koncept (negativa `feed_order` satta av `advance_customer_feed_plan`) behåller sina värden och blandas ej med importen.

### Exempelobjekt
```json
{
  "id": "863d42af-494f-4b1c-843d-5c64c8a0ea3f",
  "feedOrder": -1,
  "title": "TikTok-klipp",
  "source": "tiktok",
  "tag": null,
  "thumbnailUrl": "https://p16-common-sign.tiktokcdn-eu.com/...",
  "publishedAt": "2026-04-28T08:19:33+00:00",
  "views": 1102,
  "headline": "TikTok-klipp",
  "whyWorks": null,
  "whyFits": null,
  "originalUrl": "https://www.tiktok.com/@consorconsulting/video/..."
}
```

### Fält i DB som EJ exponeras i API idag

Följande kolumner finns i `customer_concepts` och hämtas vid reconciliation men mappas inte till `DemoPreviewConcept`:

| DB-kolumn | Innehåll | Status |
|---|---|---|
| `tiktok_likes` | Antal likes | Hämtas i merge-steget, saknas i typen |
| `tiktok_comments` | Antal kommentarer | Hämtas i merge-steget, saknas i typen |
| `tiktok_shares` | Antal delningar | Hämtas i `loadPreviewMetrics` men ej per koncept |
| TikTok caption | Ingen separat caption-kolumn — `title`/`headline` faller tillbaka på `"TikTok-klipp"` om ingen `headline_sv` finns i `backend_data` | Behöver `tiktok_description` eller liknande kolumn |

---

## 4. Visuella komponenter — `CustomerPlannerGrid`

> Fil: `artifacts/letrend/src/components/demo/CustomerPlannerGrid.tsx`

### Gitterlogik

```
TOTAL_SLOTS = 9  (3×3)
CURRENT_SLOT_INDEX = 4  (mitten = "Nu"-position)
feedOrder = CURRENT_SLOT_INDEX − slotIndex + windowOffset
```

Cellen i mitten (index 4) = `feedOrder 0` = **Nu**.  
Celler ovanför (index 0–3) = `feedOrder 1–4` = **Kommande**.  
Celler nedanför (index 5–8) = `feedOrder −1 – −4` = **Historik**.

Navigeringsknapparna (`Framåt` / `Bakåt`) förflyttar `windowOffset` ±3 (en rad).

---

### Korttyper

#### A — `FilledCell` (slot har data)

Renderas när `slot !== null`.

```
┌─────────────────────────────┐
│ [Badge]                     │  ← "Nu" | "LeT" | "TT"
│                             │
│  Title (max 5 rader)        │  ← slot.title
│                             │
│  Datum (historik)           │  ← publishedAt (sv-SE short)
│  1.1k visn.                 │  ← slot.views (om satt)
│  #tag                       │  ← slot.tag (kommande, ej thumbnail)
└─────────────────────────────┘
```

**Badge-regler:**
| `isNow` | `source` | Badge |
|---|---|---|
| `true` | vad som helst | `Nu` (guld) |
| `false` | `tiktok` / `imported_history` | `TT` (blush) |
| `false` | `letrend` | `LeT` (brun) |

**Bakgrund:**
- Thumbnail finns → `background-image` med gradient overlay (mörk botten)
- `isNow` utan thumbnail → `palette.blush` (persika)
- Historik utan thumbnail → `rgba(74,47,24,0.04)` (svagt brun)
- Kommande utan thumbnail → vit

**Hover-overlay (`ConceptHoverDetails`):**  
Visas om `headline`, `whyWorks` eller `whyFits` är satta. Täcker hela kortet med:
- Rubrik (`headline`)
- "Varför det fungerar" (`whyWorks`)
- "Varför det passar [kundnamn]" (`whyFits`)
- Länk-knapp "TikTok ↗" (`originalUrl`)

---

#### B — `EmptyCell` (slot = null)

| Situation | Vad som visas |
|---|---|
| `feedOrder === 0` (Nu), `hasNearbyUpcoming = true` | Text: *"Nästa steg är klart i planen"* |
| `feedOrder === 0` (Nu), `hasNearbyUpcoming = false` | Text: *"Nästa steg förbereds av er CM"* |
| `feedOrder < 0` (historik) | Kort horisontellt streck (visuell spacer) |
| `feedOrder > 0` (kommande) | Tom div (osynlig) |

Det är det tomma **"LeT"-kortet** som visas när `feedOrder === 0` och ingen `slot` finns — det är alltså ett `EmptyCell`, inte ett `FilledCell` med LeT-badge. LeT-badgen visas bara på ett fyllt kort med `source === 'letrend'`.

---

## 5. Sammanfattning — vad som saknas / kan förbättras

| Gap | Påverkan | Möjlig fix |
|---|---|---|
| **Thumbnail på kommande** | Kortet är tomt/vitt — ser oavslutat ut | Hämta `cover_image_url` från `concepts.backend_data`, eller låt CM sätta via studio |
| **Likes & kommentarer på historik** | Visas inte i demot | Lägg till `likes: number \| null` och `comments: number \| null` i `DemoPreviewConcept`; mappa från `tiktok_likes` / `tiktok_comments` |
| **Caption/beskrivning på historik** | `title` = alltid `"TikTok-klipp"` | Kräver ny kolumn `tiktok_description` i `customer_concepts`, eller att caption hämtas från `backend_data` |
| **Sorteringsordning synkad med studio** | ✅ Löst (dense queue fix, commit `bb22457`) | — |
