# Hagen V2 - Ombyggnadsplan

## Kärnproblemet med V1
RAG försöker matcha videor via keywords/embeddings, men humor är **kulturell och kontextuell**, inte kategorisk.
- Samma visuella element = olika humor beroende på publikens kultur
- "Dark humor" betyder ingenting utan delad kontext
- Tags/keywords kan inte fånga "känsla" eller "varför detta är roligt för Gen Z serviceworkers"

## Kärnprincip för V2
**Kultur-först, brand-profile-driven inlärning**
- Brand profile definierar kulturkontexten
- ALLA exempel inom en kultur laddas (ingen filtrering)
- Inlärningen lär "varför detta fungerar för DEN HÄR publiken", inte "vilken kategori är detta"

---

## Nuvarande V1-arkitektur - Vad behåller vi / tar bort

### ✅ BEHÅLL - Dessa fungerar bra:
- [ ] **Deep Reasoning Chain** (`src/lib/services/video/deep-reasoning.ts`)
  - 400+ rader reasoning-instruktioner
  - Steg-för-steg humoranalys
  - 23-årig persona framing
  - **Beslut:** Portera direkt till V2, kanske förfina
  
- [ ] **Gemini Integration** (`src/lib/services/video/gemini.ts`)
  - Video upload/analys
  - Prompt building
  - **Beslut:** Förenkla - ta bort RAG injection, lägg till brand context injection
  
- [ ] **145 Inlärningsexempel** (databas: `video_analysis_examples`)
  - Mänskliga korrigeringar av Geminis misstag
  - **Beslut:** Migrera till V2, omstrukturera schema för att inkludera cultural_context

- [ ] **Humor Analysis UI** (`src/app/humor-analysis/page.tsx`)
  - Enkelt korrektionsgränssnitt
  - **Beslut:** Behåll men förenkla ytterligare

### ❌ TA BORT - Dessa skadar mer än de hjälper:
- [ ] **RAG System** (`learning.ts`: findRelevantVideoExamples, embeddings)
  - Keyword-baserad filtrering förlorar kontext
  - **Beslut:** Ersätt med "ladda alla exempel i kulturkontext"
  
- [ ] **OpenAI Embeddings** 
  - Behövs inte om vi laddar allt
  - **Beslut:** Ta bort dependency
  
- [ ] **Komplexa Supabase RPC functions** (`find_video_analysis_examples`)
  - **Beslut:** Enkla SELECT * queries istället

- [ ] **Tag/Keyword Extraction** (corrections/route.ts)
  - Försöker tvinga humor i kategorier
  - **Beslut:** Ersätt med intention/kulturella markörer

### 🔄 BYGG OM - Behåll koncept, ny implementation:
- [ ] **Learning System** 
  - V1: RAG hämtar "liknande" videor
  - V2: Ladda ALLA exempel + wrappa i brand/kulturkontext
  - **Beslut:** Ny funktion `getLearningContextForBrand(brandProfile, allExamples)`

- [ ] **Brand Profile**
  - V1: Finns men inte integrerad med learning
  - V2: Grund för hela systemet
  - **Beslut:** Brand profile avgör vilka exempel som är relevanta

---

## V2 Arkitektur - Skiss

```typescript
// Kärnflöde:
1. Användare laddar upp video
2. Systemet identifierar/skapar brand profile för videon
3. Ladda ALLA exempel som matchar denna kulturella kontext
4. Wrappa exempel i kulturell framing
5. Gemini analyserar videon genom den kulturella linsen
6. Användare korrigerar → spara med cultural_context, inte tags
```

### Ny Datamodell:

```typescript
// Brand Profile (kulturell kontext)
interface BrandProfile {
  id: string
  name: string
  targetAudience: string          // "Gen Z service workers"
  culturalContext: string          // "hospitality burnout humor"
  sharedExperiences: string[]      // ["understaffing", "fake smiles"]
  humorStyle: string               // "dark, self-deprecating, nihilistic"
  antiPatterns: string[]           // vad denna publik INTE tycker är roligt
}

// Learning Example (inga tags, bara kulturell kontext)
interface LearningExample {
  id: string
  brandProfileId: string           // Vilken kultur kommer detta från?
  videoSummary: string
  geminiInterpretation: string
  correctInterpretation: string
  whyThisWorks: string             // Mekanismen, den kulturella anledningen
  intention: string                // Vad försökte skaparen uppnå?
  // INGA tags, INGEN humorTypes array
}

// Analysis request
interface AnalysisRequest {
  videoUrl: string
  brandProfileId?: string          // Valfri - kan auto-detektera eller skapa
}
```

---

## Migreringssteg (låt oss göra detta tillsammans)

### Fas 1: Kärnförenkling
- [ ] Skapa förenklad learning.ts utan RAG
- [ ] Skapa brand-profile service
- [ ] Modifiera gemini.ts för att ta emot brand context istället för RAG context

### Fas 2: Datamigrering
- [ ] Exportera 145 exempel från V1
- [ ] Lägg till cultural_context för varje
- [ ] Importera till V2 schema

### Fas 3: UI-förfining
- [ ] Brand profile creator/selector
- [ ] Förenklad analyssida
- [ ] Korrektionsflöde som fångar intention

---

## Frågor att besvara tillsammans

1. **Hur bestämmer vi brand profile för en video?**
   - Manuellt val?
   - Auto-detektera från videoinnehåll?
   - En profile = ett TikTok-konto?

2. **Hur många exempel är för många för context?**
   - Börja med alla 145?
   - Gemini 2.0 har 2M tokens - kan passa tusentals
   - När behöver vi fine-tune istället?

3. **Vad stannar i Supabase, vad flyttar till filer?**
   - Exempel i databas eller JSON-filer?
   - Brand profiles i databas?

4. **Behåller vi Next.js eller förenklar till ren API?**
   - V1 har full UI - behöver vi det?
   - Kanske bara API + enkel admin panel?

---

## Låt oss börja

**Vilken fil ska vi titta på först tillsammans?**
- `learning.ts` - se hur RAG fungerar nu, lista ut ersättning?
- `brand-analysis.types.ts` - se nuvarande brand profile, bestäm vad vi behåller?
- `deep-reasoning.ts` - granska om reasoning chain är bra eller behöver ändringar?
- Eller något annat?
