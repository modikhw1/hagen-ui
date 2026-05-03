# v7.A Training Proposal

## What Gets Fed Into Training

### Current Format (reasoning-chain examples):
```
**Observation:** [Visual/audio evidence from video]

**Första tolkning (felaktig):** [The obvious interpretation]

**Varför den inte stämmer:** [Evidence that contradicts it]

**Korrekt tolkning:** [The actual mechanism with structure]

**Mekanism:** [Pattern name]
**Varför:** [Why it works]
**Målgrupp:** [Target audience]
```

### What This Teaches:
1. **REJECT before COMMIT** - Model learns to question first interpretation
2. **EVIDENCE-BASED** - Must cite visual/audio proof
3. **STRUCTURAL FORMULAS** - Named patterns with repeatable structures

---

## Your Question: Why Not Use Simpsons Visuals?

**You're right.** The Simpsons scripts ARE visual descriptions:
- `action_line`: "an involuntary shudder, then stands up straight"
- `context`: "Burns pokes at them with a yardstick, blows up a paper bag"

These describe EXACTLY what the model needs to recognize in TikTok videos.

### Proposed Solution:
Convert Simpsons entries to reasoning-chain format that shows:
1. The visual action described
2. The structural formula it demonstrates
3. How to recognize this pattern in other content

**Example conversion:**
```
**Observation:** [From Simpsons script]
Homer walks up to plant gate. Hesitates. Suppresses involuntary shudder.
Stands straight. Walks in.

**Structural Pattern:** TIMING_BEAT_CONTRAST
Formula: APPROACH → PAUSE → INTERNAL REACTION → EXTERNAL COMPENSATION

**Why This Works:**
The beat (pause) lets absurdity land. The contrast between internal feeling
(shudder) and external behavior (walks in normally) creates irony.

**Transfer to TikTok:**
Look for: moments where character pauses, shows internal reaction,
then "puts on" external facade.
```

---

## 50+ Reasoning Chains Breakdown

### Source 1: TikTok Candidates (22 high-quality)
- Tier 1: 12 examples (score 90-100)
- Tier 2: 10 examples (score 85-89)

### Source 2: Simpsons Structural (30 selected)
From 223 structural examples, select best representatives:
- Callback: 10 examples showing PLANT → BUILD → PAYOFF
- Timing beats: 8 examples showing pause mechanics
- Escalation: 6 examples showing BUILD → SUBVERT
- Deadpan: 6 examples showing NON-REACTION contrast

### Source 3: User-Note Patterns (10 derived)
New patterns identified from your notes:
- tone_dependent_interpretation (3 examples)
- social_invitation_violation (2 examples)
- coherent_absurdist_world (2 examples)
- cinematic_interiority (2 examples)
- empathetic_humor (1 example)

### Source 4: SPARSE Pattern Mining (8 examples)
From combined datasets:
- rule_of_three: 3 in Simpsons
- competence_mismatch: 5 (17 available, select best)

---

## Total: 70 Reasoning Chain Examples

| Source | Count | Pattern Types |
|--------|-------|---------------|
| TikTok Tier 1+2 | 22 | literal, wordplay, POV, social |
| Simpsons Structural | 30 | callback, timing, escalation, deadpan |
| User-Note Derived | 10 | tone, invitation, world-building |
| SPARSE Mining | 8 | rule_of_three, competence |
| **TOTAL** | **70** | **19+ pattern types** |

---

## What Model Learns

### From TikTok:
- What patterns LOOK LIKE in short-form video
- Service industry social dynamics
- POV conventions and sound tricks

### From Simpsons:
- HOW patterns WORK structurally
- Timing mechanics (beats, pauses)
- Narrative techniques (callbacks, escalation)

### From User Notes:
- NUANCE matters (tone changes meaning)
- World-building vs isolated jokes
- Empathy as humor mechanism

---

## Decision Needed

1. **Generate all 70?** Or start with subset?
2. **Include structural formulas** in output format?
3. **Bilingual?** Simpsons in English, TikTok in Swedish?
