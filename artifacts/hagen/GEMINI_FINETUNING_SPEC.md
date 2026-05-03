# Gemini Fine-Tuning Specifikation

**Datum:** 2025-12-22  
**Status:** Implementation påbörjad, träningsjobb körs  
**Syfte:** Definiera hur Gemini ska tränas att tolka TikTok-humor enligt ägarens perspektiv

---

## Teknisk Uppdatering (2025-12-22)
Efter initiala problem med `gemini-2.0-flash` och `gemini-2.0-flash-lite` (som inte stödde video-tuning i us-central1 trots dokumentation), identifierades `gemini-2.5-flash` som den fungerande modellen.

**Fungerande konfiguration:**
- **Modell:** `gemini-2.5-flash`
- **Region:** `us-central1`
- **Format:** Video via GCS URI, text via `text`-fältet i JSONL.
- **Pågående jobb:** `humor-analysis-2025-12-22`
- **Modell-ID:** `projects/1061681256498/locations/us-central1/models/1031349603435282432@1` (Preliminärt)

---

## Avgränsning för implementerande instans

**REGLER:**
1. Utgå från detta dokument, inte befintlig kod
2. Befintlig kod ska betraktas som legacy tills motsatsen bevisas
3. Undersök endast befintlig integration om specifikt refererad
4. Bygg nytt från grunden baserat på specifikationen nedan

---

## Problemformulering

### Vad vi vill uppnå
Ett system som analyserar TikTok-klipp och producerar:
1. En mänskligt läsbar förklaring av varför något är roligt/effektivt
2. Strukturerad data för filtrering och jämförelse

### Varför befintlig lösning inte fungerar
- 850 rader prompt-text som försöker instruera Gemini hur den ska tänka
- RAG-system med 55% träffsäkerhet (embeddings matchar text, inte humor)
- Feedback opererar på text, men problemet är Geminis urval från video
- Lager på lager av "patching" istället för fundamental lösning

### Kärninsikten
Gemini är ögonen. Den ser videon. Men den väljer vad den uttrycker och hur den tolkar det.

Att instruera Gemini via prompt ändrar inte dess grundläggande perception.  
Att fine-tuna Gemini ändrar vad den ser som relevant och hur den formulerar det.

---

## Arkitekturellt beslut

**Fine-tuning av Gemini på video → tolkning-par.**

```
Input:  [video-fil i GCS]
Output: [ägarens korrekta tolkning]
```

Gemini lär sig: "när jag ser denna typ av video, producera denna typ av analys."

---

## Tekniska krav

### 1. Träningsdata

**Format per exempel:**
```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "Analysera denna video. Förklara vad som händer och varför det är roligt eller effektivt. Var specifik."
        },
        {
          "fileData": {
            "mimeType": "video/mp4",
            "fileUri": "gs://[bucket]/videos/[video-id].mp4"
          }
        }
      ]
    }
  ],
  "response": "[ägarens korrekta tolkning]"
}
```

**Datakällor:**
- 143 korrigerade exempel finns i `datasets/question_battery.json`
- Varje exempel har:
  - `video_url`: TikTok-länk (måste konverteras till GCS)
  - `gemini_said`: Vad Gemini sa (felaktigt)
  - `human_said`: Vad ägaren korrigerade till (korrekt)

### 2. Video-lagring

Videorna måste ligga i Google Cloud Storage.

**Konvertering krävs:**
```
TikTok URL → yt-dlp download → GCS upload → gs:// URI
```

**Bucket-struktur:**
```
gs://[bucket-name]/
  training/
    videos/
      [video-id-1].mp4
      [video-id-2].mp4
      ...
    train.jsonl
    validation.jsonl
```

### 3. Vertex AI Fine-tuning

**Bas-modell:** `gemini-2.5-flash-preview-05-20` (eller senaste tillgängliga)

**Begränsningar:**
- Max 1 timme total video per träningsjobb
- Rekommenderat: 100-500 exempel
- Nuvarande: 143 exempel (underkant, men möjligt)

**Hyperparametrar att testa:**
- `epochCount`: 3-5
- `learningRateMultiplier`: 0.5-2.0
- `adapterSize`: 4-16

---

## Output-specifikation

Den fine-tunade modellen ska producera:

### Narrativ output (för mänsklig läsare)
```
Det roliga i detta klipp är [mekanismen]. 

[Person/situation] gör [handling] vilket skapar [spänning/kontrast/överraskning].

Det fungerar för att [förklaring av varför publiken reagerar].
```

### Strukturerad output (för system)
```json
{
  "summary": "En mening som beskriver vad som händer",
  "mechanism": "Kärnmekanismen i 5-10 ord",
  "why_it_works": "Förklaring av varför det fungerar",
  "audience": "Vem uppskattar detta",
  "category": "comedy|wholesome|relatable|clever|chaotic",
  "quality": "weak|average|good|exceptional",
  "replicable": true|false
}
```

---

## Implementationssteg

### Fas 1: Datapreparering
1. Skapa skript som hämtar alla 143 TikTok-videor via yt-dlp
2. Ladda upp till GCS bucket
3. Skapa mapping: `video_id → gs:// URI`
4. Generera JSONL-fil i Vertex AI-format

### Fas 2: Träning
1. Dela data: 80% train, 20% validation
2. Skicka fine-tuning job till Vertex AI
3. Monitorera träningstatus
4. Vänta på completion (kan ta timmar)

### Fas 3: Evaluering
1. Testa fine-tunad modell på nya videor
2. Jämför output mot ägarens förväntning
3. Iterera på träningsdata om nödvändigt

### Fas 4: Integration
1. Ersätt befintlig Gemini-prompt med anrop till fine-tunad modell
2. Ta bort RAG-systemet
3. Ta bort 850-raders-prompten
4. Förenkla pipeline till: video → fine-tunad modell → output

---

## Vad som INTE ska göras

1. **Lägg inte till fler prompt-instruktioner** - det är inte lösningen
2. **Bygg inte ut RAG-systemet** - det opererar på fel nivå
3. **Skapa inte fler "STEP:s" i prompten** - det är symptombehandling
4. **Använd inte OpenAI embeddings** - de matchar text, inte humor-förståelse

---

## Befintliga resurser att återanvända

| Resurs | Plats | Användning |
|--------|-------|------------|
| Vertex AI service | `src/lib/services/vertex/training.ts` | Referens för API-anrop |
| Träningsexempel | `datasets/question_battery.json` | Källa för fine-tuning data |
| GCS credentials | `credentials/` | Autentisering |
| yt-dlp | Systeminstallation | Video-nedladdning |

---

## Framtida utökning

När fine-tuning fungerar:

1. **Kontinuerlig träning** - nya korrigeringar blir ny träningsdata
2. **Specialiserade modeller** - en modell per nisch (restaurang, service, etc.)
3. **A/B-testning** - jämför olika modellversioner
4. **Feedback-loop** - UI för att korrigera → automatisk re-training

---

## Kontaktpunkt

Ägaren är den enda källan till sanning om vad som är korrekt tolkning.  
All automatisering ska möjliggöra, inte ersätta, ägarens bedömning.
