# V6 vs V7.B Model Comparison Analysis

**Date:** 2025-12-31
**Videos Tested:** 12 (11 successful, 1 rate-limited)

## Summary

| Metric | V6 | V7.B |
|--------|----|----- |
| Correct core interpretation | 4/11 | 5/11 |
| Captured user-note nuance | 1/11 | 2/11 |
| Wrong video/content issue | 3/11 | 3/11 |
| Mechanism label quality | Medium | Medium |

## Detailed Analysis by Test Case

### 1. take-your-time (tone_dependent)
**Ground Truth:** NOT malicious compliance - playful/absurdist with soft inviting tone

| Model | Assessment | Notes |
|-------|------------|-------|
| V6 | ❌ MISS | Describes as "situationskomik" and standard bokstavlig tolkning. Doesn't address tone at all. |
| V7.B | ⚠️ PARTIAL | Mentions "lurigt leende" (mischievous smile) and that she intentionally misunderstands, but still doesn't distinguish playful vs malicious. |

**Verdict:** Neither model captures the TONE distinction that makes this NOT malicious compliance.

---

### 2. rigged-bottle-flip (social_invitation_violation)
**Ground Truth:** Fun game invitation violated with meanness by PHYSICALLY hitting bottle away

| Model | Assessment | Notes |
|-------|------------|-------|
| V6 | ⚠️ PARTIAL | Gets "subversion" and unexpected price increase, but doesn't mention physical sabotage. |
| V7.B | ⚠️ PARTIAL | Similar analysis. Misses the PHYSICAL hitting of the bottle. |

**Verdict:** Both miss the key physical action that defines this as "invitation violation" vs just "rigged game."

---

### 3. colleague-gets-extra (coherent_absurdist_world)
**Ground Truth:** Frames business as nonchalant dream-like place where no rules apply

| Model | Assessment | Notes |
|-------|------------|-------|
| V6 | ❌ MISS | Frames as contrast/behind-the-scenes. Just "bakom kulisserna." |
| V7.B | ❌ MISS | Same interpretation - contrast between professional/informal. |

**Verdict:** Neither captures the "wonderland" world-building aspect. Both see it as simple contrast.

---

### 4. tip-pov-flip (cinematic_interiority)
**Ground Truth:** POV + sound perspective implies internal thoughts - revealed to be cashier's not customer's

| Model | Assessment | Notes |
|-------|------------|-------|
| V6 | ❌ WRONG VIDEO | Analyzed lamb chops video instead |
| V7.B | ❌ WRONG VIDEO | Same - lamb chops video |

**Verdict:** Technical issue - wrong video content downloaded/analyzed.

---

### 5. tack-detsamma (social_script_absurdist)
**Ground Truth:** NOT exploitation - absurdist playing along, like person who doesn't understand social boundaries

| Model | Assessment | Notes |
|-------|------------|-------|
| V6 | ❌ WRONG VIDEO | Analyzed meta-trend video |
| V7.B | ❌ WRONG VIDEO | Same video |

**Verdict:** Wrong video content.

---

### 6. waitress-hammer (absurdist_frustration)
**Ground Truth:** NOT tool threat - absurdist reaction to frustration after service rejection then blamed

| Model | Assessment | Notes |
|-------|------------|-------|
| V6 | ⚠️ PARTIAL | Gets the customer-blames-server dynamic but no hammer visible/mentioned |
| V7.B | ⚠️ PARTIAL | Same - captures irony of customer blaming server |

**Verdict:** Core dynamic captured but hammer element missing (possibly video variant).

---

### 7. pays-with-her-card (character_framing)
**Ground Truth:** Frames man as STUPID, not just inversion - he thinks he's being clever

| Model | Assessment | Notes |
|-------|------------|-------|
| V6 | ❌ MISS | Frames man as "gentleman" - positive interpretation |
| V7.B | ❌ MISS | Same - "chivalry/gallantry-trope" - completely opposite reading |

**Verdict:** Both COMPLETELY miss the satirical framing. They take it at face value.

---

### 8. hurry-chant (petty_theater)
**Ground Truth:** Strange clapping, mean-spirited undertone - pettiness and ineffective action

| Model | Assessment | Notes |
|-------|------------|-------|
| V6 | ⚠️ PARTIAL | Gets "passive aggressive" and "mock cheerleading" - close |
| V7.B | ⚠️ PARTIAL | Gets "sarkasm" and "ironi" - captures some pettiness |

**Verdict:** Both get the sarcasm but miss the "mean-spirited" undertone emphasis.

---

### 9. creature-hunt-beer (expectation_subversion)
**Ground Truth:** NOT a hunt - responsible action toward 'found' animal, beer reveal adds silliness

| Model | Assessment | Notes |
|-------|------------|-------|
| V6 | ❌ MISS | Interprets as finding abandoned drink (reward for self) |
| V7.B | ❌ MISS | Interprets as old beer discovery (2004 label confusion) |

**Verdict:** Neither captures the "responsible action toward animal" framing.

---

### 10. pizza-not-finished (tone_reveals_world)
**Ground Truth:** Chef's funny small scream like a bird (not aggressive) - cultural clash

| Model | Assessment | Notes |
|-------|------------|-------|
| V6 | ⚠️ PARTIAL | Describes "gasp" - somewhat captures non-aggressive sound |
| V7.B | ✅ BETTER | Describes "långt, förvånat 'Wooah!'" - captures the funny, non-aggressive nature |

**Verdict:** V7.B slightly better at capturing the tone of the reaction.

---

### 11. elderly-makes-own (performance_dependent)
**Ground Truth:** Funny because of acting quality and escalating wildness - performance is key

| Model | Assessment | Notes |
|-------|------------|-------|
| V6 | ⚠️ PARTIAL | Gets escalation but doesn't mention acting quality |
| V7.B | ⚠️ PARTIAL | Mentions "absurdism" but not performance-dependent aspect |

**Verdict:** Neither explicitly identifies that PERFORMANCE/ACTING is what makes it funny.

---

## Key Findings

### What Neither Model Captures Well:

1. **Tone-Dependent Interpretation**
   - Both models describe WHAT happens but miss HOW it's performed
   - Playful vs malicious distinction not detected

2. **World-Building Absurdism**
   - Models see individual jokes, not coherent "alternative worlds"
   - Miss the dream-like framing

3. **Character Framing Direction**
   - pays-with-her-card: Both read as positive when it's satirical
   - Need training on "who is the butt of the joke"

4. **Physical Action Significance**
   - bottle-flip: Physical hitting is the key differentiator
   - Models focus on outcome, not the action that causes it

5. **Empathetic Humor**
   - regular-walks-past (rate-limited for v7.B) shows viewer-emotion patterns
   - This category needs more training examples

### V7.B Improvements Over V6:

1. Slightly more structured output format
2. Better at describing specific sounds/reactions (pizza "Wooah!")
3. More detailed scene descriptions

### V7.B Still Needs:

1. Tone reading capability
2. Satirical intent detection
3. World-building pattern recognition
4. Performance quality assessment

## Recommendation

The v7.B model shows marginal improvements but the core issue remains: **both models describe surface mechanics without capturing the nuanced interpretations from user notes.**

**Next training priority should include:**
- The 75 reasoning-chain examples from v7A-complete.jsonl
- Explicit examples showing WRONG interpretation → WHY wrong → CORRECT interpretation
- More tone-dependent examples
- Character-framing satirical examples
