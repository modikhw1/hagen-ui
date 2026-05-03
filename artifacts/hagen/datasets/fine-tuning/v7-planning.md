# v7 Training Plan

## Prompt Change (v6 - Active Now)

Added third analysis mode "Balanced" between Short & Sharp and Detailed.

**Balanced prompt:**
```
Analysera videon. Hitta den faktiska poängen - inte bara beskriv scenen.

Format:
**Observation:** [Vad i videon stödjer din tolkning? Specifika visuella/auditiva detaljer.]
**Handling:** [Vad händer och varför det är poängen. Längden ska matcha innehållet - kort om det är enkelt, längre om detaljer är relevanta för förståelsen.]
**Mekanism:** [Vilken humormekanism används]
**Varför:** [Varför det fungerar. Om det finns nyanser värda att förklara, ta med dem.]
**Målgrupp:** [Vem uppskattar detta]

Fokusera på att fånga rätt tolkning. Om ordlek eller flertydighet finns, kontrollera visuella ledtrådar för att avgöra vilken tolkning som gäller.
```

**Key differences from concise:**
- Adds Observation field (cite evidence before committing)
- Allows variable length ("längden ska matcha innehållet")
- Explicit instruction to check visual cues for ambiguity
- No "extremt kort" constraint

---

## Output Length = Content Complexity

The model should produce shorter output for simple content, longer for complex. Not through post-processing, but learned from training examples.

**Signals that content is simple (→ short output):**
- Common format (POV, "when X happens") - audience knows the structure
- Single obvious mechanism - self-evident, no need to over-explain
- No ambiguity in interpretation - no justification needed
- Visual = text (what you see is the whole joke)

**Signals that content is complex (→ longer output):**
- Multiple layered mechanisms
- Ambiguous wordplay requiring visual disambiguation
- Background/foreground contrast
- Non-obvious "varför" that needs explanation

**Example - simple clip (engelska-panik):**
```
**Handling:** Anställda flyr och spelar döda när engelsktalande kund kommer.
**Mekanism:** Överdrift, igenkänning.
**Varför:** Förstorar relaterbar språkångest till absurd nivå.
**Målgrupp:** Servicepersonal.
```
4 lines. Nothing more to say. Don't pad simple content.

**Training approach:** Include examples that demonstrate this calibration - simple clips with short analysis, complex clips with longer analysis. The model learns the correlation.

---

## TikTok Background Sounds / Trends

TikTok sounds sometimes carry meaning, sometimes don't. The model must recognize the difference.

**Sound WITH meaning:**
- Sound is part of the joke structure (setup/punchline in audio)
- Lyrics relate to the visual content
- Known trend format where sound defines the template
- Sound creates ironic contrast with visuals

**Sound WITHOUT meaning (decorative):**
- Generic trending audio slapped on for reach
- Music that sets mood but doesn't add to humor
- Sound doesn't interact with the content

**Rule:** Only mention TikTok sound in analysis if it contributes to the humor mechanism. If it's just background music, ignore it. Don't write "ljudet ger videon charm" - that's filler.

**Training approach:** Include examples where sound IS the joke vs examples where sound is irrelevant. Teach the model to recognize when audio matters.

---

## Core Principle
**Output length = relevant information density. Not arbitrary, not padded, not compressed.**

---

## New Training Data Created

### 1. Multi-Interpretation Examples
**File:** `multi-interpretation-examples.jsonl`
**Count:** 15 examples

**Purpose:** Teach model to disambiguate when wordplay has multiple possible meanings.

**Format:**
```json
{
  "wordplay_analysis": {
    "phrase": "högre upp",
    "possible_meanings": [
      {"interpretation": "...", "visual_evidence": "...", "fit": "weak/strong"}
    ],
    "selected": "...",
    "selection_reasoning": "..."
  },
  "analysis": "..."
}
```

**Key lesson:** Check visual evidence before committing to interpretation.

---

### 2. Meta-Observation Examples
**File:** `meta-observation-examples.jsonl`
**Count:** 8 examples

**Purpose:** Teach model WHEN to look deeper (background gags, audio contrast, environmental text, etc.)

**Patterns covered:**
- background_contrast
- environmental_text
- audio_contrast
- missed_signal
- escalating_signs
- creation_as_expression
- object_reveal
- subtitle_commentary

---

### 3. Observation-Enhanced Format
**File:** `observation-enhanced-examples.jsonl`
**Count:** 8 examples

**Purpose:** Add checkpoint before interpretation to reduce first-guess errors.

**Format change:**
```
**Observation:** [specific visual evidence]
**Handling:** [interpretation based on observation]
**Mekanism:** ...
**Varför:** ...
**Målgrupp:** ...
```

The observation field forces model to cite evidence before committing.

---

## Problem Being Solved

v6 issue: Same video can produce different quality outputs. Short outputs sometimes miss the point (just describe scene). Longer outputs tend to be more accurate (80-90%).

**Root cause:** Model generates token-by-token. Short format = commits early, no revision. Long format = more "thinking" happens mid-generation.

**Solution:** Observation field creates a "pause and check" moment. Model must ground interpretation in visual evidence before writing analysis.

---

## Length Principle

NOT: "complex = long, simple = short"

INSTEAD: "relevant information determines length"

- All relevant details included
- No irrelevant padding
- No compression that loses meaning

The training examples should demonstrate this naturally - the model learns from seeing appropriate lengths for different content types.

---

## Files to Merge for v7

1. `gold_standard.jsonl` (existing ~200 examples)
2. `simpsons_training.jsonl` (existing ~400 examples)
3. `multi-interpretation-examples.jsonl` (15 new)
4. `meta-observation-examples.jsonl` (8 new)
5. `observation-enhanced-examples.jsonl` (8 new)

**Decision needed:** Convert all examples to observation-enhanced format, or mix formats?

---

## Open Questions

1. Should observation field be required in all outputs, or only when disambiguation needed?
2. How to validate that model learned "relevant length" vs "arbitrary length"?
3. Should multi-interpretation reasoning be visible in output or internal only?

---

## New Finding: Model Satisfices, Doesn't Verify (2025-12-31)

### Experiment Run
Tested knee-creak video (7583035463624051990) with 8 different configurations:
- 3 prompt modes (concise, balanced, detailed)
- 3 temperatures (0.3, 0.7, 1.0)
- Custom reasoning prompts
- Base Gemini vs fine-tuned

**Result:** ALL 8 got the same wrong interpretation.

### The Error
Model interpreted: "Fridge makes soft sound, knees make loud sound → contrast/exaggeration humor"

Actual structure: Three-part deductive elimination sequence:
1. Squat + open door = creak (ambiguous source)
2. Door only (standing) = no creak (eliminates door)
3. Squat only (no door) = creak (confirms knees)

The humor is the methodical "diagnostic test" approach to discovering your own body is broken.

### Root Cause
Model pattern-matches to first plausible interpretation and stops. It doesn't:
- Track narrative sequences as logical arguments
- Question obvious interpretations
- Look for why specific actions were included

### Solution: Reasoning-Chain Training Examples
**File:** `reasoning-chain-examples.jsonl`

Format shows:
1. Detailed observation of ALL elements
2. First/obvious interpretation
3. Evidence that contradicts it
4. Correct interpretation with reasoning

This teaches the model to REJECT before committing, not just to recognize patterns.

### New Pattern Identified
**Deductive Elimination / Diagnostic Sequence**
- Multiple actions that systematically isolate variables
- One action serves as "control" that eliminates a hypothesis
- Final action confirms the real source
- Humor: methodical approach to discovering something obvious/unfortunate

---

## Next Steps

- [ ] Decide on format unification
- [ ] Merge training files
- [ ] **Add 10-20 reasoning-chain examples showing rejection process**
- [ ] Run v7 fine-tuning
- [ ] Test on same clips that v6 got wrong (högre upp, knee-creak, etc.)

---

## v7.B Status (2025-12-31)

**Training job submitted:** `projects/1061681256498/locations/us-central1/tuningJobs/3677736429200343040`

### What v7.B includes:
- **675 examples** (262 video + 413 text)
- **8 mechanism corrections** from gold_standard:
  1. Line 37: "Transformation, humor" → "Subversion av förväntan, ironi"
  2. Line 85: "Subversion, humor" → "Överdrift, absurdism"
  3. Line 8: "Subversion, Humor" → "Subversion, reveal"
  4. Line 57: "Subversion, Komedi" → "Kontrast, subversion"
  5. Line 68: "Subversion, Humor, Oväntad twist" → "Bokstavlig tolkning, ordvits, subversion"
  6. Line 104: "Ordlek, Absurd humor" → "Bokstavlig tolkning, absurdism, igenkänning"
  7. Line 212: "Subversion, Humor, Rollspel" → "Eskalering, rollspel, subversion"
  8. Line 230: "Humor, subversion" → "Eskalering, absurdism"
- Fixed JSON parse error (missing newline at line 692)

### v7.B vs v7.A
- **v7.B (this job):** Corrected mechanism labels in existing data
- **v7.A (pending review):** Reasoning-chain examples that teach rejection process

Both will be evaluated separately to understand which changes have more impact.

---

## Reasoning-Chain Examples Created

**File:** `reasoning-chain-v7A-complete.jsonl`
**Count:** 10 examples (4 original approved + 6 new tier 1)

### Original Examples (User Reviewed):
1. **Knee-creak** - Deductive elimination (three-part sequence) ✓
2. **Skur/Laugh** - Sound-source misdirection ✓
3. ~~**Sallad** - Internal monolog as misdirection~~ ✗ REJECTED (obvious interpretation was correct)
4. **3-year-old coffee** - Accidental truth (hyperbole becomes literal) ✓
5. **Högre upp** - Multi-interpretation with visual disambiguation ✓

### New Tier 1 Examples (Score 90+):
6. **97-year-old-icecream** - Accidental truth with sympathy layer
7. **short-staffed-height** - Wordplay visual disambiguation ("short" = physically short)
8. **photo-id-photo-drink** - Logic mirroring (reductio ad absurdum)
9. **perfect-shift-exhausted** - Audio-visual contradiction (robot voice vs body language)
10. **use-your-head-literal** - Literal idiom interpretation
11. **compliments-to-chef** - Phrase disambiguation

### Pattern Types Covered:
- deductive_elimination
- sound_source_misdirection
- accidental_truth / accidental_truth_with_sympathy
- multi_interpretation_wordplay
- wordplay_visual_disambiguation
- logic_mirroring
- audio_visual_contradiction
- literal_idiom_interpretation
- phrase_disambiguation

### Files:
- `reasoning-chain-examples-approved.jsonl` - Original 4 approved
- `reasoning-chain-tier1-new.jsonl` - 6 new tier 1 examples
- `reasoning-chain-v7A-complete.jsonl` - Combined 10 examples
- `reasoning-chain-simpsons-structural.jsonl` - 5 structural pattern examples from Simpsons

---

## Simpsons Structural Pattern Mining (2025-12-31)

**Purpose:** Teach model STRUCTURAL PRINCIPLES that transfer across content types.

### Structural Patterns Extracted:

| Pattern | Structural Formula | Source |
|---------|-------------------|--------|
| callback_payoff | PLANT → BUILD EXPECTATION → PAYOFF | Life on the Fast Lane |
| deadpan_non_reaction | ABSURD SITUATION → EXPECTED REACTION → NON-REACTION | Summer of 4 Ft 2 |
| escalation_subversion | BUILD ESCALATION → EXPECT CONTINUATION → SUBVERT | Bart's Friend Falls in Love |
| timing_beat_contrast | APPROACH → PAUSE → INTERNAL REACTION → EXTERNAL COMPENSATION | Homer the Smithers |
| rule_of_three_subversion | ESTABLISH (1) → CONFIRM (2) → SUBVERT (3) | Structural principle |

### Key Insight:
Simpsons examples teach HOW patterns unfold structurally. TikTok examples teach WHAT patterns look like in short-form. Combined, they give the model both recognition AND understanding.

### Cross-Reference with Taxonomy:
The `humor-pattern-taxonomy.json` file contains 39 patterns:
- 12 WELL_COVERED (sufficient examples)
- 14 PARTIAL (need augmentation)
- 13 SPARSE (HIGH training need)

Simpsons strengths fill gaps in:
- Callbacks (27 examples in dataset)
- Timing beats (61 examples)
- Deadpan/non-reaction (25 examples)
- Escalation (29 examples)
