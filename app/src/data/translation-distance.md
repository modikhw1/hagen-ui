# Translation Distance Analysis

## Datakällor → UI-fält

### Nivå 1: Direkt mappning (låg distans)
Fält som finns i model-data och kan användas direkt.

| UI-fält | Källa | Transform |
|---------|-------|-----------|
| `videoUrl` | `clip.url` | Direkt |
| `gcsUri` | `clip.gcs_uri` | Direkt |
| `mechanism` | `clip.humor_analysis.mechanism` | lowercase() |
| `matchPercentage` | `override.matchPercentage` | Direkt |
| `price` | `override.price` | Direkt |

### Nivå 2: Genererbar (medel distans)
Fält som kan AUTO-GENERERAS från befintlig model-data.

| UI-fält | Källa | Generering |
|---------|-------|------------|
| `script_sv` | `clip.scene_breakdown[].audio` | Formatera dialog + översätt |
| `whyItWorks_sv` | `clip.humor_analysis.why` | Översätt till svenska |
| `headline_sv` | `clip.scene_breakdown[0].audio` | Sammanfatta + översätt |
| `difficulty` | `clip.replicability.execution_skill` | Map 1-10 → easy/medium/advanced |
| `peopleNeeded` | `clip.replicability.talent_requirement` | Map till solo/duo/team |

**Exempel - Auto-generera script från scene_breakdown:**
```json
// Input (model data):
"scene_breakdown": [
  { "audio": "Which one's iced? / The cold one.", "narrative_function": "setup" },
  { "audio": "Which one's oat? / The one that says oat.", "narrative_function": "development" }
]

// Output (genererat script_sv):
"[SCEN: Setup]\nKUND: Vilken är iskall?\nBARISTA: Den kalla.\n\n[SCEN: Development]\nKUND: Vilken är havremjölk?\nBARISTA: Den som det står havremjölk på."
```

### Nivå 3: Manuellt (hög distans)
Fält som SAKNAS i model-data och kräver manuell input.

| UI-fält | Status | Kommentar |
|---------|--------|-----------|
| `productionNotes_sv` | ⚠️ Delvis | `replicability_notes` finns men är generell |
| `whyItFits_sv` | ❌ Manuell | Brand-specifik matchning saknas |
| "VIKTIGA MOMENT ATT SPIKA" | ❌ Hårdkodad | Ingen modell-data |

---

## Datakällor per klipp

### clip-contraband-coffee
```
✅ scene_breakdown     → Kan generera script_sv
✅ humor_analysis.why  → Kan generera whyItWorks_sv
✅ replicability_signals → Kan generera difficulty
⚠️ replicability_notes → Saknas (använd defaults)
```

### clip-bankhotel-reconciliation
```
❌ scene_breakdown     → SAKNAS i clips.json (finns i sigma_taste_dataset!)
✅ humor_analysis.why  → Kan generera whyItWorks_sv
✅ replicability       → Har full data inkl. replicability_notes
```

---

## Fullständig data finns i:
`hagen-main/datasets/sigma_taste_dataset_2025-12-18.json`

Innehåller för varje klipp:
- `analysis.scenes[]` - Full scene breakdown
- `analysis.replicability` - Alla replicability-värden
- `rating.notes` - Detaljerad analys (kan → whyItWorks)
- `analysis.quality_signals` - Hook, payoff, etc.

---

## Rekommendation

1. **Kort sikt**: Importera `scene_breakdown` från sigma_taste_dataset till clips.json
2. **Medel sikt**: Bygg auto-translator som genererar `_sv`-fält från model-data
3. **Lång sikt**: Pipeline som kör LLM för översättning + anpassning per brand
