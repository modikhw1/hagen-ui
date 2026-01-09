# UI Field Map - Vad behövs var

## Data Flow

```
clips.json → conceptLoader.ts → translator.ts → Concept → UI
                ↓                    ↓
           overrides             display.ts
           defaults          (category → label)
```

## Preview Page (före unlock)

| UI-element | Datakälla | Status |
|------------|-----------|--------|
| Headline (titel) | `headline_sv` (override/default) | ✅ Finns |
| Match % badge | `matchPercentage` | ✅ Finns |
| Market badge (SE) | `market` → display.market() | ✅ Fungerar |
| Mechanism badge | `mechanism` → display.mechanism() | ✅ Fungerar |
| Difficulty badge | `difficulty` → display.difficulty() | ✅ Fungerar |
| People badge | `peopleNeeded` → display.peopleNeededGrammar() | ✅ Fungerar |
| Description | `description_sv` | ✅ Finns |
| "VAD DU FÅR" lista | `locale/sv.json` → whatYouGetItems | ✅ Fungerar |
| Match-text | Template med brand + peopleNeeded | ✅ Fungerar |

## Brief Page - Manus Tab

| UI-element | Datakälla | Status |
|------------|-----------|--------|
| Video placeholder | `sourceUrl` / `gcsUri` | ✅ Finns |
| Script content | `script_sv` | ✅ Finns |

## Brief Page - Checklista Tab

| UI-element | Datakälla | Status |
|------------|-----------|--------|
| Checklist items | `productionNotes_sv[]` | ✅ Finns |
| SNABBINFO: Personer | `peopleNeeded` → display.peopleNeededGrammar() | ✅ Fungerar |
| SNABBINFO: Svårighet | `difficulty` → display.difficulty() | ✅ Fungerar |

## Brief Page - Analys Tab

| UI-element | Datakälla | Status |
|------------|-----------|--------|
| Humor-mekanism | `mechanism` → display.mechanism() | ✅ Fungerar |
| VARFÖR DET FUNKAR | `whyItWorks_sv` | ✅ Finns |
| Viktiga moment | `locale/sv.json` → keyMoments | ✅ Fungerar |

---

## Swedish Content Fields (per clip)

```json
{
  "headline_sv": "Svensk titel",
  "description_sv": "Beskrivning av konceptet...",
  "whyItWorks_sv": "Förklaring av varför humorn fungerar...",
  "script_sv": "[SCEN: ...]",
  "productionNotes_sv": [
    "En tagning, inga klipp behövs",
    "Funkar bäst med genuin trötthet"
  ],
  "whyItFits_sv": [
    "Perfekt för kaféer",
    "Du kan filma detta själv"
  ]
}
```

## Display Layer Usage

```typescript
import { display } from '@/lib/display'

// Category → Swedish label
display.mechanism('subversion')     // { label: 'Twisten', icon: '🔄', color: '...' }
display.difficulty('easy')          // { label: 'Lätt', color: '#5A8F5A' }
display.peopleNeeded('solo')        // { label: 'Bara du', count: 1 }
display.peopleNeededGrammar('duo')  // "2 personer" (string med grammatik)
display.market('SE')                // { label: 'Sverige', flag: '🇸🇪' }

// UI strings with interpolation
display.ui('conceptsRemaining', { count: 3, total: 5 }) // "3 av 5 kvar"
```

## Fallback Chain

1. `overrides[clip.id].headline_sv` → Clip-specifik override
2. `defaults.headline_sv` → Global default
3. `translateHeadline(clip)` → Auto-genererad från scener
