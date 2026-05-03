# Relational Matrix Prototype

Two clips with complete analysis data, structured for discussing relational matrix concepts.

---

# H1: Clips Similar to Golden Standard

This document contains two clips analyzed through multiple pipelines. The goal is to explore how relationships between clips (and between clips and variables) can be structured, with human notes as pointers rather than 1:1 metavalue matching.

---

## H2: Clips Similarity - Overall Closeness and Difference Towards Gold Standard

### Theoretical Relationship Node

```
RELATIONSHIP_NODE = {
  clip_a: "contraband.coffee/7584667920807103751",
  clip_b: "glamberryltd/7557448130912881942",

  // Inferred or assigned
  overall_strength: 0.0-1.0,

  // Human notes - pointers, not direct mappings
  connection_notes: "",
  disconnection_notes: "",
  reasoning: "",

  // Dimensions being compared
  dimensions_compared: [
    "humor_mechanism",
    "audience_overlap",
    "replicability_profile",
    "production_requirements",
    "tone_alignment"
  ]
}
```

---

## CLIP A: @contraband.coffee/video/7584667920807103751

**URL:** https://www.tiktok.com/@contraband.coffee/video/7584667920807103751

### Humor Analysis (Fine-Tuning Lab)

| Field | Value |
|-------|-------|
| **Handling** | [MEDIOCRE] The script is ok and is fairly replicable. |
| **Mekanism** | Subversion |
| **Varför** | The script is ok and is fairly replicable. It would likely work best for a barista setting, where the script can be replicated without altering the physical gags or the initial script. If in another setting, some of the example gags (small vs large, oat vs not oat) would have to be replaced with something else. The script is also not the funniest or most clever. |
| **Målgrupp** | Viewers who appreciate quality misjudged humor |
| **Source** | question-battery |
| **Original Gap** | QUALITY_MISJUDGED |

### Sigma Taste Analysis (Analyze-Rate-V1)

#### Scene Breakdown

| # | Timestamp | Duration | Audio | Visual | Implied Meaning | Narrative Function |
|---|-----------|----------|-------|--------|-----------------|-------------------|
| 1 | 0:00 | 0:02 | "Which one's iced?" / "The cold one." | Customer asks question over two coffee cups | Customer asking obvious question | setup |
| 2 | 0:02 | 0:05 | "Which one's oat?" / "The one that says oat." | Cups with lid marked "OAT" | Customer not paying attention to marked details | development |
| 3 | 0:07 | 0:05 | "Which is large?" / "The one that isn't small." | Two coffee cups | Customer oblivious or deliberately difficult | payoff |

**Edit as Punchline:** false
**Misdirection:** Relies on viewer assuming customer will ask reasonable questions

#### Analysis Scores

| Category | Field | Value |
|----------|-------|-------|
| **Hook** | style | action |
| **Hook** | curiosity_generated | 3 |
| **Hook** | desperation_signals | none |
| **Narrative** | momentum_type | steady_stream |
| **Narrative** | coherence_score | 3 |
| **Narrative** | story_direction | linear_build |
| **Payoff** | type | dialogue_delivery |
| **Payoff** | predictability | somewhat_expected |
| **Payoff** | earned_vs_cheap | somewhat_earned |
| **Payoff** | memorability | 3 |
| **Production** | pacing_feel | comfortable |
| **Production** | polish_score | 3 |
| **Production** | audio_timing | good |
| **Performer** | concept_selling | 3 |
| **Performer** | performance_dependency | good_delivery_helps |

#### Replicability Decomposed

| Category | Field | Value |
|----------|-------|-------|
| **Actors** | count | solo |
| **Actors** | skill_level | anyone |
| **Actors** | social_risk | none |
| **Production** | editing_skill | basic_cuts |
| **Production** | estimated_time | under_1hr |
| **Environment** | setup_complexity | point_and_shoot |
| **Environment** | backdrop | any_venue |
| **Concept** | humor_travels | false |
| **Concept** | product_swappable | false |
| **Copy Feasibility** | score | 2 |

### Human Overrides

```json
{
  "audience_signals": {
    "primary_ages": [{"primary": "gen_z", "secondary": "millennial"}],
    "vibe_alignments": ["foodies", "locals"],
    "engagement_style": "passive",
    "niche_specificity": 5
  },
  "replicability_signals": {
    "time_investment": 9,
    "skill_requirements": 9,
    "budget_requirements": 3,
    "equipment_requirements": 5
  }
}
```

### Replicability Analysis (Replicability-Lab)

**Swedish Structured Replicability Assessment:**

Videon är relativt enkel att replikera för liknande verksamheter, särskilt kaféer och baristabaserade miljöer. Grundkonceptet bygger på en serie uppenbara frågor från en kund, där baristans svar belyser det absurda i frågorna.

**Resurskrav:**
- En person framför kameran (barista)
- Kaffekopp med lock (markerade med text om produkten)
- Standard kafémiljö

**Produktionskomplexitet:**
Redigeringen är grundläggande med enkla klipp mellan fråga och svar. Ingen avancerad efterproduktion krävs. Inspelningen kan göras under en timme.

**Anpassningsbarhet:**
Konceptet är starkt platsberoende - det fungerar bäst i en baristamiljö där de specifika exemplen (stor vs liten, havremjölk vs vanlig) är naturliga. Om konceptet ska replikeras i en annan typ av verksamhet (restaurang, bar) måste gagsarna bytas ut mot kontextrelevanta exempel.

**Svårighetsgrad:** Låg
**Övergripande replikerbarhet:** Medelgod - enkelt genomförande men begränsad överförbarhet till andra miljöer.

---

## CLIP B: @glamberryltd/video/7557448130912881942

**URL:** https://www.tiktok.com/@glamberryltd/video/7557448130912881942

### Humor Analysis (Fine-Tuning Lab)

| Field | Value |
|-------|-------|
| **Handling** | [GOOD] A simple sketch with a wholesome factor to it, including the child. |
| **Mekanism** | Subversion |
| **Varför** | A simple sketch with a wholesome factor to it, including the child. The concept is simple and direct. Replicability: Would require a young child, as well as getting someone in the staff to want to include a young child in internet content, which may not be the easiest. The prop can be replaced, but a coffee makes sense. Would likely fit a similar café environment. But the premise of having a child create the item is somewhat amusing. |
| **Målgrupp** | Viewers who appreciate cultural context humor |
| **Source** | question-battery |
| **Original Gap** | CULTURAL_CONTEXT |

### Sigma Taste Analysis (Analyze-Rate-V1)

#### Scene Breakdown

| # | Timestamp | Duration | Audio | Visual | Implied Meaning | Narrative Function |
|---|-----------|----------|-------|--------|-----------------|-------------------|
| 1 | 0:00 | 2s | "Excuse me, this tastes like a 3-year old made it" | Customer complaining about coffee | Customer expects professionally made drink | development |
| 2 | 0:02 | 3s | "I'm so sorry I'll get that sorted for you. Ina! What are you doing?" | Barista in hijab behind counter | Barista unaware someone else making drinks | development |
| 3 | 0:05 | 3s | "I'm just trying my best." | Small child in apron holding pink cup | Child barista's inexperience is the reason | payoff |

**Edit as Punchline:** true
**Misdirection:** Initial focus on adult barista creates expectation of professional
**Edit Punchline Explanation:** Final cut to child reveals absurdity, viewer understands complaint

#### Analysis Scores

| Category | Field | Value |
|----------|-------|-------|
| **Hook** | style | action |
| **Hook** | curiosity_generated | 3 |
| **Hook** | desperation_signals | none |
| **Narrative** | momentum_type | steady_stream |
| **Narrative** | coherence_score | 3 |
| **Narrative** | story_direction | linear_build |
| **Payoff** | type | dialogue_delivery |
| **Payoff** | predictability | somewhat_expected |
| **Payoff** | earned_vs_cheap | somewhat_earned |
| **Payoff** | memorability | 3 |
| **Production** | pacing_feel | comfortable |
| **Production** | polish_score | 3 |
| **Production** | audio_timing | good |
| **Performer** | concept_selling | 3 |
| **Performer** | performance_dependency | good_delivery_helps |

#### Replicability Decomposed

| Category | Field | Value |
|----------|-------|-------|
| **Actors** | count | solo |
| **Actors** | skill_level | anyone |
| **Actors** | social_risk | none |
| **Production** | editing_skill | basic_cuts |
| **Production** | estimated_time | under_1hr |
| **Environment** | setup_complexity | point_and_shoot |
| **Environment** | backdrop | any_venue |
| **Concept** | humor_travels | false |
| **Concept** | product_swappable | false |
| **Copy Feasibility** | score | 2 |

### Human Overrides

```json
{
  "audience_signals": {
    "primary_ages": [{"primary": "gen_z", "secondary": "millennial"}],
    "vibe_alignments": ["foodies", "families", "locals", "tourists", "comfort_seeking"],
    "engagement_style": "passive",
    "niche_specificity": 5
  },
  "replicability_signals": {
    "time_investment": 9,
    "skill_requirements": 9,
    "budget_requirements": 3,
    "equipment_requirements": 5
  }
}
```

### Replicability Analysis (Replicability-Lab)

**Swedish Structured Replicability Assessment:**

Videon har en unik premiss som bygger på att ett litet barn faktiskt har gjort drycken - en bokstavlig tolkning av kundens hyperboliska klagomål. Konceptet är enkelt och direkt, men replikeringen innebär specifika utmaningar.

**Resurskrav:**
- Minst två vuxna framför kameran (kund + barista)
- Ett litet barn (cirka 3 år) som är bekväm framför kameran
- Barnförkläde och rekvisita (kaffekopp)
- Kafémiljö

**Produktionskomplexitet:**
Redigeringen är relativt enkel med grundläggande klipp, men den slutliga "avslöjningen" av barnet fungerar som visuell punchline och kräver bra timing. Inspelningen kräver samordning med ett litet barn, vilket kan ta längre tid.

**Anpassningsbarhet:**
Konceptet är platsberoende och lämpar sig bäst för kaféliknande miljöer. Den stora utmaningen är tillgången till ett litet barn som personal är villig att inkludera i marknadsföringsinnehåll - detta är inte lätt att organisera för de flesta verksamheter. Premissen (barn gör produkten) är överförbar till andra sammanhang (restaurang, bageri) men kräver fortfarande barndeltagande.

**Svårighetsgrad:** Medel (pga. barnets involvering)
**Övergripande replikerbarhet:** Begränsad - konceptet är enkelt men barntillgång och samtyckesfrågor skapar praktiska hinder.

**Särskild anmärkning:** Videon har en wholesome-faktor som förstärker engagemanget. Detta är svårt att replikera utan autentiskt barndeltagande.

---

# RELATIONAL MATRIX STRUCTURE - preset

## Text Field: Human Notes on Relationship

```
CONNECTION_NOTES:
[To be filled by user - pointers to why these clips relate]

DISCONNECTION_NOTES:
[To be filled by user - pointers to why these clips differ]

REASONING:
[To be filled by user - deeper explanation of relationship logic]
```

## Key Observations for Matrix Design

### Shared Dimensions (Potential Connection Points)
- **Humor Mechanism:** Both use "subversion"
- **Setting:** Both are café/coffee environments
- **Audience Age:** Both target gen_z/millennial
- **Replicability Profile:** Identical scores (time: 9, skill: 9, budget: 3, equipment: 5)
- **Production Level:** Both are basic_cuts, under_1hr, point_and_shoot
- **Narrative Structure:** Both linear_build with steady_stream momentum

### Differing Dimensions (Potential Differentiation Points)
- **Quality Rating:** MEDIOCRE vs GOOD
- **Edit as Punchline:** false vs true
- **Wholesome Factor:** None vs "wholesome factor including child"
- **Vibe Alignments:** ["foodies", "locals"] vs ["foodies", "families", "locals", "tourists", "comfort_seeking"]
- **Child Involvement:** None vs central to concept
- **Misdirection Technique:** Obvious questions vs person-reveal

---

## Framework for User Input

### When you feed in data, consider:

1. **What makes these clips "similar"?**
   - Is it the mechanism? The setting? The tone? The production level?

2. **What makes these clips "different"?**
   - Quality perception? Audience breadth? Emotional tone?

3. **If a brand matched to Clip A, would they match to Clip B?**
   - Why or why not?
   - What would be the differentiating factor?

4. **What variables are NOT captured that you feel are important?**
   - What's missing from the analysis that would help distinguish or connect these clips?

5. **How would you describe the relationship in a way embeddings might miss?**
   - e.g., "Clip B has higher emotional warmth due to child, which changes brand fit even though mechanism is identical"

---

## The Core Problem Statement

> "The intelligent matching between dimensions, finding meaning where it may not be found, could (if I'm not misunderstanding) be lost. The human notes are pointers, and cannot be taken at face value to match metavalue1 to metavalue2 1:1"

### What This Means for the Matrix:

1. **Notes as Training Signal, Not Labels**
   - Human notes like "more wholesome" don't map to `wholesome_score = 0.7`
   - They point to WHY the relationship matters in context

2. **Cross-Dimensional Inference**
   - A relationship might exist because of an interaction between:
     - humor_mechanism + audience_age + setting
   - Not because any single dimension matches

3. **Latent Meaning Discovery**
   - The matrix should find connections the human didn't explicitly note
   - But validate them against the human's intent

---

## Ready for Your Input

Feed in:
- Additional clips to compare
- Notes on why clips connect or don't
- Brand profiles to match against
- Variables you think are missing
- Hypotheses about relationships

Let's discuss how this becomes a trainable system.

# RELATIONAL MATRIX STRUCTURE, considerations (edited)

## Text Field: Human Notes on Relationship

```

Node inserted (a commentation)
Notes describing how these clips fit or not fit, in relating to the grander intention (H1) where the model is meant to train, by creating relationalities using notes.

CONNECTION_NOTES:
[To be filled by user - pointers to why these clips relate]

DISCONNECTION_NOTES:
[To be filled by user - pointers to why these clips differ]

REASONING:
[To be filled by user - deeper explanation of relationship logic]

The AI model looks through both data-models, the notes, and puts it in a greater context (maybe perusing 20-30 clips and their relatability make-up, updating and self-reinforcing the schema with each save). Relatability becomes more reliable with more additions, and pre-set values and node-dependencies can update, while notes stay the same (With notes *anchoring* the relative weight depending on the note - variable likeliness, the note language, the meaning inferred).
```

## Key Observations for Matrix Design

### Shared Dimensions (Potential Connection Points)

Anything and everything. Assuming clips are similar in all ways, until distinctings, rankings are applied. If the H1 is - "which type of humor is more similar to clip 1", having 200+ nodes to different clips - some may be more similar than other types, showing layerings and segments of distance between categories.

- **Humor Mechanism:** Both use "subversion"
- **Setting:** Both are café/coffee environments
- **Audience Age:** Both target gen_z/millennial
- **Replicability Profile:** Identical scores (time: 9, skill: 9, budget: 3, equipment: 5)
- **Production Level:** Both are basic_cuts, under_1hr, point_and_shoot
- **Narrative Structure:** Both linear_build with steady_stream momentum

### Differing Dimensions (Potential Differentiation Points)
- **Quality Rating:** MEDIOCRE vs GOOD
- **Edit as Punchline:** false vs true
- **Wholesome Factor:** None vs "wholesome factor including child"
- **Vibe Alignments:** ["foodies", "locals"] vs ["foodies", "families", "locals", "tourists", "comfort_seeking"]
- **Child Involvement:** None vs central to concept
- **Misdirection Technique:** Obvious questions vs person-reveal

---

## Framework for User Input

### When you feed in data, consider:

1. **What makes these clips "similar"?**
   - Is it the mechanism? The setting? The tone? The production level?

2. **What makes these clips "different"?**
   - Quality perception? Audience breadth? Emotional tone?

3. **If a brand matched to Clip A, would they match to Clip B?**
   - Why or why not?
   - What would be the differentiating factor?

4. **What variables are NOT captured that you feel are important?**
   - What's missing from the analysis that would help distinguish or connect these clips?

5. **How would you describe the relationship in a way embeddings might miss?**
   - e.g., "Clip B has higher emotional warmth due to child, which changes brand fit even though mechanism is identical"

---

## The Core Problem Statement

> "The intelligent matching between dimensions, finding meaning where it may not be found, could (if I'm not misunderstanding) be lost. The human notes are pointers, and cannot be taken at face value to match metavalue1 to metavalue2 1:1"

### What This Means for the Matrix:

Assumption is that any information can be drawn from the datafields, and then another LLM based layer uses that to infer connections.

1. **Notes as Training Signal, Not Labels**
   - Human notes like "more wholesome" don't map to `wholesome_score = 0.7`
   - They point to WHY the relationship matters in context

2. **Cross-Dimensional Inference**
   - A relationship might exist because of an interaction between:
     - humor_mechanism + audience_age + setting
   - Not because any single dimension matches

3. **Latent Meaning Discovery**
   - The matrix should find connections the human didn't explicitly note
   - But validate them against the human's intent

---

## Ready for Your Input

Feed in:
- Additional clips to compare
- Notes on why clips connect or don't
- Brand profiles to match against
- Variables you think are missing
- Hypotheses about relationships

Let's discuss how this becomes a trainable system.
