# Replicability Fine-Tuning Strategy (v1)

Detta dokument beskriver strategin för att träna en specialiserad Gemini-modell för att analysera videoreplikerbarhet på svenska.

## 🎯 Mål
Att skapa en modell som kan ta emot tekniska signaler och råa anteckningar från en video och producera en **neutral, strukturerad analys av replikerbarhet på svenska**, utan behov av few-shot prompting.

## 📂 Dataset & Struktur
Vi använder ett dataset med 115 videos, där vi har byggt upp en "Gold Standard" genom en kombination av manuell verifiering och stilöverföring.

- **Källa:** `datasets/replicability_dataset_2025-12-23.json`
- **Totalt antal:** 115 videos
- **Verifierade (Gold Standard):** 42 st (används för träning v1)
- **Auto-genererade:** 73 st (används för validering/testning av v1)

### Dataformat (Input -> Output)
Modellen tränas på följande par:

**Input (User Prompt):**
```text
Analysera replikerbarheten för denna video baserat på följande signaler och generella anteckningar.

SIGNALER:
{
  "cuts_per_minute": 12,
  "audio_quality": 8,
  ...
}

GENERELLA ANTECKNINGAR:
[Originalanteckningar på engelska/svenska]

Ge en neutral, strukturerad analys av replikerbarhetsfaktorerna på svenska.
```

**Output (Model Response):**
```text
Videon bygger på ett enkelt koncept som är lätt att replikera i en kontorsmiljö. 
Klipphastigheten är måttlig vilket kräver grundläggande redigeringskunskaper...
[Neutral, professionell ton]
```

## 🛠️ Processflöde

### Fas 1: Dataförberedelse (Klar ✅)
1.  **Extraktion:** Vi extraherade signaler och anteckningar från originaldatabasen.
2.  **Labbet:** Vi skapade `/replicability-lab` för att manuellt skriva/verifiera analyser.
3.  **Batch-översättning:** Vi använde de manuella exemplen för att stil-överföra resten av datasetet till svenska.
4.  **Resultat:** 42 verifierade exempel redo för träning.

### Fas 2: Träning (Nästa steg 🚀)
Vi använder Google Vertex AI för att fine-tuna `gemini-1.5-flash`.

**Steg för att köra träningen:**

1.  **Förbered data:**
    Kör skriptet som konverterar verifierad data till JSONL och laddar upp till Google Cloud Storage (GCS).
    ```bash
    node scripts/fine-tune-replicability-pipeline.js prepare
    ```

2.  **Starta jobbet:**
    Skicka träningsjobbet till Vertex AI.
    ```bash
    node scripts/fine-tune-replicability-pipeline.js train
    ```

3.  **Övervaka:**
    Kolla status på jobbet (tar ca 30-60 min).
    ```bash
    node scripts/fine-tune-replicability-pipeline.js status
    ```

### Fas 3: Utvärdering & Iteration
När modellen `replicability-v1` är klar:

1.  **Uppdatera Labbet:** Vi kopplar `/replicability-lab` till den nya modellen.
2.  **Testa på o-verifierad data:** Vi kör de 73 "lila" (auto-genererade) videorna genom den nya modellen.
3.  **Human-in-the-loop:** Du godkänner eller korrigerar modellens nya analyser.
4.  **Resultat:** Fler gröna (verifierade) exempel -> Bättre dataset -> Träna `replicability-v2`.

## 📄 Referensfiler

*   **Pipeline-skript:** `scripts/fine-tune-replicability-pipeline.js` (Hanterar GCS-uppladdning och Vertex AI-jobb)
*   **Labbet:** `src/app/replicability-lab/page.tsx` (UI för verifiering)
*   **Dataset:** `datasets/replicability_dataset_2025-12-23.json` (Master-data)
*   **Träningsdata (genereras):** `datasets/fine-tuning/replicability_train_v1.jsonl`

## ⚠️ Viktiga Noteringar
*   **Modellval:** Vi använder `gemini-1.5-flash-001-tuning` eftersom `gemini-1.0-pro` fasas ut för tuning.
*   **Kvot:** Se till att ditt Google Cloud-projekt har kvot för `Vertex AI Tuning`.
*   **Kostnad:** Fine-tuning kostar pengar per timme, men Flash-modellen är mycket kostnadseffektiv.
