# Self-Perception Framework v1.0

## The Problem This Solves

Content recommendations fail when they match *external* positioning but miss *internal* stance. Two brands at identical cultural coordinates produce wildly different content because they *relate differently* to occupying that position.

The goal: Capture the psychological stance a brand-holder takes toward their own position, enabling recommendations that "feel right" before they can articulate why.

---

## Core Distinction

**Position** = Where you are (observable)  
**Self-Perception** = How you relate to being there (internal)

Self-perception is orthogonal to position. It's the *interpretation layer*.

---

## The Two Axes

### Axis 1: Security ↔ Threat

How stable does the person feel in their current position?

| Secure | Threatened |
|--------|-----------|
| Can ignore trends | Must chase everything |
| Experiments freely | Defensive positioning |
| Long time horizons | Immediate validation needs |
| "This is working" | "This could collapse" |

**Not about actual stability.** A successful brand can feel threatened; a struggling one can feel secure.

### Axis 2: Satisfaction ↔ Striving

How acceptable is the current position?

| Satisfied | Striving |
|-----------|----------|
| Small ideal-actual gap | Large ideal-actual gap |
| Present-focused | Future-focused |
| "We are where we should be" | "We deserve more" |

**Not about ambition.** Striving isn't inherently good; it can be aggrieved entitlement.

---

## The Four Quadrants

```
                    SATISFIED
                        │
         SETTLED        │        ARRIVED
      (Threatened +     │      (Secure +
       Satisfied)       │       Satisfied)
                        │
THREATENED ─────────────┼───────────────── SECURE
                        │
       DESPERATE        │       HUNGRY
     (Threatened +      │     (Secure +
      Striving)         │      Striving)
                        │
                    STRIVING
```

- **Arrived**: Authority without anxiety. Can take creative risks. Immune to trend pressure.
- **Hungry**: Sustainable growth. Ambitious without desperation. Forward momentum.
- **Desperate**: High-energy but brittle. Chases validation. Burns out creators.
- **Settled**: Rare, unstable. Usually resolves toward another quadrant.

---

## Connection to Existing Dimensions

Self-perception sits *between* observable signals and output decisions:

```
[Survival] ─┐
            ├──→ [Self-Perception] ──→ [Content Decisions]
[Coolness] ─┘
```

High Survival + High Coolness could produce either Arrived or Hungry depending on self-perception.

---

## Implementation Shape

```typescript
interface SelfPerception {
  security: number;      // 1-10: threatened ↔ secure
  satisfaction: number;  // 1-10: striving ↔ satisfied
  stance: 'arrived' | 'hungry' | 'desperate' | 'settled';
  notes: string;
}
```

---

# Self-Perception Framework v1.1

## What The Notes Reveal

Analysis of 8 brand video ratings surfaces recurring observation patterns that challenge and extend v1.0.

### Observed Dimensions

**1. Production Investment** (mentioned in all 8 entries)
- "doesn't use very high production value"
- "video quality is good, implying external team"
- "seems put together quite spontaneously"
- "well produced... edited well"

**2. Intentionality** (mentioned in 7/8 entries)
- "planned in advance meaning planned out script, conscious editing"
- "project-led by an unofficial content-person"
- "the clip looks intentional"
- "seems planned, as the shots are thought out"

**3. Social Risk Appetite** (mentioned in 6/8 entries)
- "safe and bound by safety restrictions"
- "edgier than a family oriented piece"
- "the joke isn't the most clever"
- "not completely safe either"

**4. Status Signaling** (mentioned in 5/8 entries)
- "doesn't contain status symbols or implied status symbols"
- "features a fairly beautiful young woman, signaling social value"
- "not placing emphasis on exerting status"
- "upwards striving (wanting to present social status)"

**5. Effortlessness vs. Effort** (mentioned in 4/8 entries)
- "presentation doesn't seem effortless, rather planned"
- "doesn't give off effortlessness, or an intrinsic coolness"
- "without much effort can record together"
- "silent humor... rather than loud or energetic delivery"

---

## Challenging v1.0

### What Holds

The Security ↔ Threat axis maps reasonably to **Survival scores**:
- Low survival (3-4): "relaxed feeling," "diffused accountability," "fun-oriented"
- High survival (6-7): "seems to care about results," "external team setup," "planned content strategy"

### What Doesn't Map Cleanly

**Coolness ≠ Social Positioning**

v1.0 assumed coolness measures where you stand in social hierarchy. The notes reveal it's measuring something different: **permission to take social risk**.

- Score 3: "very safe... bound by safety restrictions"
- Score 4: "accessible and safe," "bland in how they deliver"
- Score 5: "somewhat clever... confident enough to post it under our brand name"
- Score 7: "a lot of attitude," "puts the brand in a frame where they have power"

This is closer to **frame control** than position. A brand can be high-status but still score low on coolness if they're afraid to take creative risks.

**Satisfaction ↔ Striving Is Missing**

v1.0's second axis (satisfaction vs. striving) doesn't appear in any observation. The notes don't assess whether brands *want more* or *feel content*. They assess:
- What the brand *is doing* (production quality, intentionality)
- What the brand *signals* (status, risk appetite)
- Who the brand *speaks to* (audience targeting)

This suggests v1.0's model was aspirational rather than observable. We can't see satisfaction/striving—we can only infer it.

---

## The Gap Problem

You identified a gap between **conceptualization** (what we want) and **production** (what we make). The notes reveal this gap manifests as:

### Mismatch Patterns

**High intention, low execution:**
- "The premise does seem planned out, and the execution is good. The (visual) feeling is that the business isn't looking for growth."

The observer detects *intention* but concludes the brand doesn't *want* growth. The gap here is between effort and ambition.

**Low risk despite high capability:**
- "Although the overall brand content feels intentional, the social arena positioning seems very safe... making the team seem somewhat 'bland'"

The observer detects *capability* but sees *timidity*. The gap here is between resources and permission.

**Clever concept, weak delivery:**
- "The video doesn't give off effortlessness, or an intrinsic coolness to the characters, but is well put together."

The observer detects *competence* but not *ease*. The gap here is between knowing and being.

---

## Revised Model

v1.0 proposed:
```
Security ↔ Threat
Satisfaction ↔ Striving
```

Based on actual observations, the operative dimensions are:

### Axis 1: Resource Commitment (Observable)
How much is the brand investing in content?

| Low | High |
|-----|------|
| Spontaneous, one-shot | Planned, multi-shot |
| Staff-produced | External team |
| Simple backdrop | Curated environment |
| Minimal editing | Conscious pacing |

This is **not** v1.0's Security. A brand can feel secure while under-investing, or threatened while over-investing. Resource commitment reveals *behavior*, not *feeling*.

### Axis 2: Social Permission (Observable)
How much risk does the brand allow itself?

| Low | High |
|-----|------|
| Safe, family-oriented | Edgy, confrontational |
| Accessible humor | Clever/subtext humor |
| Bland delivery | Attitude, frame control |
| No status signaling | Explicit status play |

This is related to but distinct from v1.0's Coolness. It's not about *being* cool but about *allowing* yourself to act cool.

### The Interpretation Layer (Inferred)

Self-perception remains the interpretation layer, but it now sits between:

```
[Resource Commitment] ─┐
                       ├──→ [Self-Perception] ──→ [Content Character]
[Social Permission] ───┘
```

Two brands with identical resources and identical permission produce different content based on how they *interpret* their position:

- **Entitled**: "We deserve attention" → loud, demanding content
- **Grateful**: "We're lucky to be here" → humble, service-oriented content  
- **Defiant**: "We don't need approval" → experimental, polarizing content
- **Anxious**: "We might lose this" → defensive, trend-chasing content

---

## The Effortlessness Problem

A recurring theme: **effortlessness signals authenticity**.

- "without much effort can record together" (positive)
- "presentation doesn't seem effortless, rather planned" (negative)
- "doesn't give off effortlessness, or an intrinsic coolness" (negative)

This creates a paradox:
- High production requires effort
- Effort undermines perceived authenticity
- Authenticity requires appearing effortless
- Effortlessness requires either genuine ease OR skill at hiding effort

**Implication**: The highest self-perception state isn't "Arrived" (secure + satisfied). It's **Effortless**—where high capability produces without visible strain.

---

## Proposed v1.1 Quadrants

Replacing Security/Threat and Satisfaction/Striving:

```
                    HIGH PERMISSION
                         │
       RECKLESS          │         EFFORTLESS
    (Low Resource +      │      (High Resource +
     High Permission)    │       High Permission)
                         │
    "We don't care       │    "This is just who
     enough to try"      │     we are"
                         │
LOW RESOURCE ────────────┼───────────── HIGH RESOURCE
                         │
       INVISIBLE         │        STRAINING
    (Low Resource +      │      (High Resource +
     Low Permission)     │       Low Permission)
                         │
    "We're not really    │    "We're trying so hard
     trying to be seen"  │     but playing it safe"
                         │
                    LOW PERMISSION
```

### Effortless (High Resource + High Permission)
The aspirational state. Investment without strain. Risk without desperation. Content feels inevitable rather than produced.

### Reckless (Low Resource + High Permission)
High risk tolerance without backup. Can produce viral moments or catastrophic failures. Feels authentic but unsustainable.

### Straining (High Resource + Low Permission)
The "corporate" failure mode. Money and planning visible, but content feels sanitized. Effort undermines authenticity.

### Invisible (Low Resource + Low Permission)
Default mode for most brands. Minimal investment, minimal risk. Content exists but doesn't register.

---

## Detection Signals

| Signal | Indicates |
|--------|-----------|
| Production value | Resource commitment |
| Editing sophistication | Resource commitment |
| Use of staff vs. actors | Resource commitment |
| Premise cleverness | Permission level |
| Status symbol inclusion | Permission level |
| Safe vs. edgy framing | Permission level |
| Apparent effort | Gap between resource and permission |
| Effortless feel | Alignment of resource and permission |

---

## What v1.1 Adds

1. **Observable axes replace felt axes**: Resource Commitment and Social Permission can be measured from content. Security and Satisfaction cannot.

2. **Effortlessness as target state**: The goal isn't feeling good about your position—it's producing content that doesn't reveal its production.

3. **The gap is measurable**: Distance between Resource Commitment and Social Permission reveals the strain/recklessness tension.

4. **Self-perception becomes the interpretation**: How does the brand *read* its own position? This drives tone, not just production choices.

---

## Open Questions (Updated)

1. **Can permission be taught?** A brand with high resources but low permission is "Straining." Can they learn to take more risk, or is permission culturally embedded?

2. **Is effortlessness achievable or performed?** When content *appears* effortless, is the brand genuinely at ease, or skilled at hiding work?

3. **Does the gap matter directionally?** Is "High Resource + Low Permission" (Straining) worse than "Low Resource + High Permission" (Reckless)?

4. **Audience perception vs. creator perception**: The notes describe what *I* see. Does the target audience see the same signals?
