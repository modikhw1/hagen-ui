# Strategi för Iterativ Förfining av Gemini

Denna strategi beskriver hur vi går från en "grov" första finjustering till en högprecisionsmodell för humoranalys.

## Fas 1: Bootstrap (Nuvarande status)
Vi tränar `humor-analysis-v1` på befintlig data.
- **Data:** Blandad kvalitet, "komplement till instruktioner".
- **Mål:** Få modellen att förstå *domänen* (TikTok, humor, snabba klipp) bättre än basmodellen.
- **Förväntat resultat:** Modellen kommer "fatta grejen" men kanske missa specifika formatkrav eller nyanser.

## Fas 2: Active Learning (Människan i loopen)
När v1-modellen är klar, använder vi den för att skapa nästa generations träningsdata. Detta är mycket snabbare än att skriva data från grunden.

1. **Generera:** Kör v1 på 50-100 *nya* videor.
2. **Granska & Korrigera:**
   - Istället för att skriva analysen från noll, *rätta* modellens svar.
   - Om modellen säger "Det är roligt för att han ramlar", ändra till "Humorn bygger på slapstick och den oväntade timingen i fallet."
3. **Spara:** Spara den korrigerade versionen som "Gold Standard".

## Fas 3: Specialisering (v2 och framåt)
Träna `humor-analysis-v2` på den korrigerade datan.
- Nu lär sig modellen inte bara domänen, utan exakt *din* röst och dina analyskriterier.
- Instruktioner som "spela en roll" blir överflödiga eftersom rollen är inbakad i vikterna.

## Fas 4: Hybrid-användning
Även med en finjusterad modell bör vi använda en lättviktig system-prompt för att garantera format:

```javascript
const prompt = "Du är en expert på humoranalys. Svara endast med JSON enligt detta schema...";
const model = "tunedModels/humor-analysis-v2";
```

## Konkret Arbetsflöde för Förfining

Vi kan bygga ett enkelt verktyg för detta:

1. `node scripts/generate-candidates.js` -> Skapar 20 analyser med v1.
2. En enkel webbvy (eller fil) där du redigerar analyserna.
3. `node scripts/add-to-dataset.js` -> Lägger till dina rättningar i träningsdatan.
4. `node scripts/fine-tune-gemini.js train` -> Startar träning av v2.
