# UI Architecture

> Riktlinjer för hur frontend-lagret ska hållas lätt och frikopplat från backend-logik.

## Princip: Decoupled Layers

```
┌─────────────────────────────────────────────────────────────┐
│                        BACKEND (hagen)                       │
│  - Gemini video analysis                                     │
│  - Claude brand profiling                                    │
│  - Matching algorithms                                       │
│  - Data aggregation                                          │
│  - Business logic                                            │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼ JSON (clips.json, brand-profile.json)
┌─────────────────────────────────────────────────────────────┐
│                    TRANSLATION LAYER                         │
│  lib/translator.ts    - Backend → UI data mapping            │
│  lib/display.ts       - Labels, icons, colors (sv locale)    │
│  lib/conceptLoader.ts - Load and transform JSON              │
│  lib/profileLoader.ts - Load brand profile                   │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼ TranslatedConcept, UIConcept
┌─────────────────────────────────────────────────────────────┐
│                         UI LAYER                             │
│  - Rendering only                                            │
│  - No calculations                                           │
│  - No data fetching (except auth)                            │
│  - State for UI interactions only                            │
└─────────────────────────────────────────────────────────────┘
```

## Vad UI-lagret FÅR göra

- **Rendera data** från translation layer
- **Enkel transformation** för visning (t.ex. `match > 85 ? 'green' : 'gray'`)
- **UI state** (vilken vy som visas, expanderad/kollapsad, valt koncept)
- **Auth state** via AuthContext (user, profile, session)
- **Navigation** mellan vyer
- **Stripe checkout** trigger (anropa API, redirecta)

## Vad UI-lagret INTE ska göra

- **Beräkna matchning** — görs i backend
- **Hämta/aggregera data** från flera källor — görs i backend
- **Filtrera eller sortera** stora datamängder — levereras färdigt
- **Analysera video** — Gemini i backend
- **Profilera varumärken** — Claude i backend
- **Business logic** — all affärslogik i backend

## Nuvarande status: WIP

Dashboarden (`/app`) är under utveckling. Både **data-input** och **UI** kan ändras:

### Data (kan ändras)
- `clips.json` — struktur och fält
- `brand-profile.json` — profilformat
- Matchning-värden och algoritm
- Kategorier och mekanismer

### UI (kan ändras)
- Layout och komponenter
- Vilka fält som visas var
- Flödet mellan vyer
- Visuell design

## Translation Layer

### translator.ts
Mappar backend-fält till UI-fält:

```typescript
// Backend → UI
{
  headline: "Coffee Chaos"           → title
  matchPercentage: 89                → match
  estimatedPeopleNeeded: 2           → peopleNeeded
  humorAxis: "contrast"              → mechanism
}
```

### display.ts
Konverterar värden till svenska labels och ikoner:

```typescript
display.mechanism('contrast')   → { label: 'Två Världar Möts', icon: '⚖️' }
display.difficulty('easy')      → { label: 'Enkel', color: '#5A8B6A' }
display.peopleNeeded(2)         → { label: '2 personer' }
```

## Filstruktur

```
app/src/
├── app/
│   ├── app/page.tsx      # Main dashboard (WIP)
│   ├── login/page.tsx    # Auth
│   └── api/              # API routes (auth, stripe)
├── lib/
│   ├── translator.ts     # Backend → UI mapping
│   ├── display.ts        # Swedish labels, icons
│   ├── conceptLoader.ts  # Load clips.json
│   └── profileLoader.ts  # Load brand-profile.json
├── data/
│   ├── clips.json        # Concept data (from backend)
│   ├── brand-profile.json
│   └── locale/sv.json    # Swedish translations
├── contexts/
│   └── AuthContext.tsx   # Supabase auth state
└── components/
    └── ...               # Presentational components
```

## Framtida integration

När backend-API:er är klara:

1. **Byt ut JSON-filer** mot API-anrop
2. **Translation layer** anpassas till API-response
3. **UI förblir oförändrad** — tar emot samma TranslatedConcept

```typescript
// Idag
const concepts = loadConcepts(); // från clips.json

// Framtiden
const concepts = await fetchConcepts(userId); // från API
// Translation layer mappar till samma format
```

## Sammanfattning

| Lager | Ansvar | Exempel |
|-------|--------|---------|
| **Backend** | All logik, beräkningar, AI | Matchning, analys |
| **Translation** | Data-mapping, locale | `headline` → `title` |
| **Display** | Labels, ikoner, färger | `'contrast'` → `'⚖️ Två Världar'` |
| **UI** | Rendering, navigation | React components |

> **Regel:** Om du funderar på att lägga till en `calculate*()` funktion i UI — stoppa. Den hör hemma i backend.
