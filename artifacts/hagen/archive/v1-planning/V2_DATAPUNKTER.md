# V2 - Verkliga Datapunkter

## Vad har vi FAKTISKT när vi analyserar en video?

### INPUT: Video
```
- platform: 'tiktok' / 'youtube'
- video_url: länk till videon
- video_id: plattformens ID
```

### OUTPUT: Geminis analys (visual_analysis JSONB)
```javascript
{
  script: {
    transcript: "vad som sägs",
    visualTranscript: "scen-för-scen beskrivning",
    humor: {
      humorType: "subversion|absurdist|observational...",
      humorMechanism: "förklaring",
      comedyTiming: 1-10
    },
    deep_reasoning: {
      character_dynamic: "relationsdynamik",
      underlying_tension: "spänningen som skapar humor",
      format_participation: "hur strukturen deltar",
      editing_contribution: "redigeringens bidrag",
      visual_punchline: "visuell poäng",
      tone_delivery: "leverans/ton",
      dark_humor_signals: "mörk humor signaler",
      // osv...
    }
  }
}
```

### CORRECTION: Mänsklig korrigering
```javascript
{
  video_summary: "Kort beskrivning",
  gemini_interpretation: "Vad Gemini sa (fel)",
  correct_interpretation: "Vad människan sa (rätt)",
  explanation: "VARFÖR detta är rätt",
  
  // Strukturerad correction (försök att kategorisera)
  humor_type_correction: {
    original: "observational",
    correct: "dark-humor", 
    why: "Den ler medan hon gör self-harm gester"
  },
  
  // Metadata (keyword-försök)
  tags: ['hospitality', 'christmas', 'implied-harm'],
  humor_types: ['dark-humor', 'juxtaposition'],
  industry: 'restaurant'
}
```

---

## Kärninsikten: Vad är EGENTLIGEN viktigt?

När jag korrigerar Gemini, vad säger jag?

**"Nej, detta är inte observational humor om busy work. Detta är dark humor där servitören upprätthåller en facade av glädje medan hon gör gester som antyder självskada. Kontrastens mellan leendet och gesterna ÄR skämtet. Detta fungerar för Gen Z service workers för att de KÄNNER igen den där fake happiness under högtidsrushen."**

### Bryt ner detta:
1. **Gemini missade**: Facade, kontrasten, mörkheten
2. **Korrekt tolkning**: Dark humor, juxtaposition, implied harm
3. **Mekanismen**: Kontrasten mellan yttre (ler) och inre (desperation)
4. **Kulturell kontext**: "Gen Z service workers känner igen detta"
5. **Varför det är roligt**: Katartisk igenkänning av delad erfarenhet

### Frågan:
**Vilka av dessa 5 punkter behöver vi LAGRA för att kunna lära Gemini nästa gång?**

---

## Problemet med nuvarande system:

```
tags: ['hospitality', 'christmas', 'implied-harm']
humor_types: ['dark-humor', 'juxtaposition']
```

Detta är keywords. De säger INTE:
- Varför det är dark humor (mekanismen)
- Vilken publik det funkar för (kulturen)
- Vad som faktiskt hände (den visuella kontrastens)

---

## Vad behöver vi EGENTLIGEN lagra?

### Förslag på ny struktur:

```typescript
interface VideoCorrection {
  // 1. KONTEXT - Vad hände?
  videoSummary: string
  visualContext: string  // "Server ler mot kamera, gör handrörelser mot ugn/knivar"
  
  // 2. GEMINIS MISS
  geminiSaid: string
  geminiMissed: string[]  // ["Facade av glädje", "Implied self-harm gester", "Kontrasten"]
  
  // 3. KORREKT TOLKNING
  correctInterpretation: string
  mechanism: string       // "Kontrasten mellan yttre glädje och inre desperation"
  intention: string       // "Visa utbrändhet genom dark humor"
  
  // 4. KULTURELL KONTEXT
  whoFindsThisFunny: string     // "Gen Z service workers, 20-30 år"
  whyItWorks: string            // "Katartisk igenkänning av delad erfarenhet"
  sharedExperience: string      // "Fake happiness under högtidsrush"
  
  // 5. INSTRUKTION TILL FRAMTIDA ANALYS
  teachingPoint: string   // "När någon ler men gesten antyder harm = dark humor, inte relatable"
}
```

---

## Frågor att svara på:

1. **Är detta en bättre struktur än tags?**
   - Fångar den "varför" istället för "vad"?
   
2. **Hur bestämmer vi "whoFindsThisFunny"?**
   - Manuellt? 
   - Från video metadata (TikTok account = målgrupp)?
   - AI inference?

3. **Behöver vi "brand profile" eller räcker "cultural context per video"?**
   - En profile = ett TikTok-konto?
   - Eller lagra cultural context per correction?

4. **Hur många correction-exempel behöver Gemini läsa för att "lära sig"?**
   - Alla 145?
   - Bara de som matchar samma cultural context?
   - Bara de som Gemini missade på samma sätt?

---

## Nästa steg tillsammans:

Vad tycker du? Är denna struktur närmare sanningen?
Eller saknar vi något fundamentalt?
