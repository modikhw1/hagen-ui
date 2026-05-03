# Hagen Ground Truth Document

**Purpose:** Precise recount of system state, goals, and direction. No assumptions. For future Claude instances and team reference.

**Last Updated:** 2026-01-03
**Source:** Direct conversation with founder

---

## 1. What Hagen IS

### Core Purpose
A service that helps small business owners (SMBs) find and replicate proven TikTok content that fits their brand.

**NOT:**
- A content generator (AI doesn't create concepts)
- A trend predictor
- A view count forecaster

**IS:**
- A content discovery and matching system
- An analysis engine that explains WHY content works
- A bridge between proven content and brands who can naturally recreate it

### The Value Proposition
```
Find high-quality TikTok content →
Analyze why it works →
Match to brands who could recreate it →
Guide the recreation (not rewrite)
```

---

## 2. What Exists (Verified)

### 2.1 Humor Analysis Model (Fine-Tuning Lab)

**Location:** `/fine-tuning-lab`

**What it does:**
- Takes a TikTok URL
- Downloads video, uploads to GCS
- Tuned Gemini model analyzes the humor
- Outputs structured analysis in Swedish:
  - Handling (what happens)
  - Mekanism (humor mechanism)
  - Varför (why it works)
  - Målgrupp (target audience)
- User edits/refines the output
- Saved to `gold_standard.jsonl` for training

**Current state:**
- ~50% reliability (founder assessment)
- Works well for some clips, far off for others
- 270 TikTok clips + 450 Simpsons text entries in training data
- Simpsons data helps: more flowing language, clearer articulation

**Known failure modes:**
1. Audio-visual disconnect - TikTok sounds (trending audio) confuse model
2. Editing-as-joke - Visual gags tied to editing are missed
3. Layered jokes - Stops at first simple insight, doesn't dig deeper
4. Abstract inference - Multi-layer meaning gets lost
5. Running twice helps - Multi-pass improves output

### 2.2 Replicability Model

**What it does:**
- Assesses how a business would approach recreating a video
- Describes what parts can/should be changed
- Explains what can stay the same ("evergreen" elements)

**Current state:**
- ~60 training values (not enough)
- More complex inference chain than humor model
- Based on experience-based considerations, not just visual observation

**Key concept - "Evergreen" formula:**
Good content is generally reusable. If a script is visual (café using coffee, restaurant using kitchen), replicability text explains what could change and what likely stays.

### 2.3 Analyze-Rate-V1

**Location:** `/analyze-rate-v1`

**What it does:**
- Pre-populates meta-values using Gemini Vertex:
  - Target audience
  - Risk level
  - Replicability data (people needed for reproduction)
  - Other filtering metadata

**Current state:**
- Showable to someone, but mix of qualified assumptions and noise
- Precursor to staff-facing view
- Quality rating aspect on hold

### 2.4 Brand Profiling (Conversation)

**Location:** `/brand-profile`

**What it does:**
- 7-phase Claude-driven conversation:
  1. Introduction
  2. Business Goals
  3. Social Goals
  4. Tone Discovery
  5. Audience
  6. References (4-6 videos they admire)
  7. Synthesis

**Current state:**
- Conversation flow works and "feels" good
- Does NOT fill structured values - conceptual gap
- The underlying values are hypotheses, not validated
- Goal is human-level "understanding," not tag extraction

### 2.5 Brand Fingerprint (Concept)

**Intended approach:**
- Analyze 5+ clips from brand's OWN TikTok content
- Plus metadata (profile bio, profile picture)
- Infer "who they are" like a human would:
  - Team type, production value, seriousness
  - Posting patterns, theme consistency
  - The "mind" behind the curation

**Current state:**
- Attempted but not functioning
- Idea: function that takes TikTok profile URL → analyzes grid → creates fingerprint
- Not updated recently

### 2.6 Matching System

**What exists:**
- L1/L2/L3 fingerprinting for videos
- 3 hard filters: Environment, Replicability, Risk
- 4 soft scores: Audience (35%), Tone (30%), Format (20%), Aspiration (15%)

**What it does NOT do:**
- Recommend specific humor mechanisms
- Use the 39-mechanism taxonomy for matching
- Matching is based on tone LEVEL (none/light/moderate/heavy), not mechanism TYPE

### 2.7 39-Mechanism Taxonomy

**Location:** `datasets/fine-tuning/humor-pattern-taxonomy.json`

**What it is:**
- 39 humor patterns categorized (literal interpretation, wordplay, callback, etc.)
- Used for TRAINING DATA DOCUMENTATION
- Tracks which patterns are well-covered vs. sparse

**What it is NOT:**
- NOT connected to brand matching
- NOT used to recommend mechanisms to brands
- Supporting reference, not core model

---

## 3. What Does NOT Exist (Gaps)

| Gap | Notes |
|-----|-------|
| Concept generation | System analyzes, doesn't create new concepts |
| Mechanism-to-brand recommendation | Taxonomy exists but not connected |
| Virality prediction | Only captures engagement snapshots |
| Execution guidance templates | No scripts, shot lists, timing guides |
| Brand fingerprint from clips | Attempted, not working |
| Structured feedback capture | User edits saved, but reasoning lost |
| Audio analysis | Not linked to video understanding |
| Multi-pass processing | Manual workaround (run twice) |

---

## 4. The Roadmap (Founder-Stated)

### Step 1: Current Focus
Make the content-side models reliable (neutral, not brand-connected):

1. **Humor analysis model** → high reliability
2. **Replicability model** → high reliability
3. **Analyze-rate-v1** → high reliability
4. **Combine into concept mapping structure** for staff/SMB interaction

**"High reliability" means:**
- Matches human judgment
- Consistency across runs
- Low edit rate by staffers

### Step 2: Next Phase (Either/Or)
- **2.a:** Build relationality system (simple brand matching)
- **2.b:** Build brand fingerprint to intuitive complexity first

---

## 5. Content Discovery Flow (Intended)

```
Trend-finders (students, different countries)
    ↓
Browse TikTok, find quality content
    ↓
Submit links along criteria
    ↓
Model analyzes: humor + replicability + metadata
    ↓
Staffers edit/refine outputs
    ↓
Content added to library
```

**Key points:**
- NOT automated scraping (human quality control)
- Staffers can edit all model outputs
- Quality assurance filters what enters library

---

## 6. Output to Brands (Intended)

When a brand is matched to a video, they receive:

1. **Original video** - the source content
2. **Humor analysis** - why it's funny, what mechanisms
3. **Replicability guide** - what parts can change, what stays
4. **NOT a rewritten script** - AI doesn't do creative work

---

## 7. Key Definitions (Founder's Words)

### "Virality"
NOT about maximum views or trend-chasing. Means:
- Content that fits brand so well it's a "no brainer" to recreate
- Either proven high spread OR likely to spread (similar content performed well)
- Relative engagement (to profile size), not absolute numbers
- Good quality content, not necessarily "most viral"
- = Good content + good likelihood of enjoyment

### "Fingerprint"
Human-style understanding of a brand/video. Like how a person would describe someone they just met - conscious and subconscious impressions. NOT tag extraction.

### "Reliability"
All three: matches human judgment + consistency + low edit rate

### "Evergreen"
Content formula that is generally reusable. Visual elements can be swapped (café → restaurant) while structure stays.

---

## 8. Technical Notes

### Humor Model Improvement Priorities
1. More training data (currently 270 TikTok + 450 Simpsons)
2. Improve "eyes" - observational mechanic, audio/visual interplay
3. Multiple explanations ranked by likelihood (not single answer)
4. Learn TikTok "culture" - trends, sounds, editing conventions
5. Stay within fine-tuning approach (not abandon it)

### Simpsons Data
- Tested v7.B (with Simpsons) vs v7.X (video only)
- Simpsons helps: more flowing language, clearer ideas
- More video data will "gel" with Simpsons text

### Feedback Loop Gap
- Final edited text is saved as training data
- User's REASONING during edits is not captured
- Structure describes mechanisms but not "viewer understanding"

---

## 9. What to Work On (Session Output)

The founder requested:
1. **Strategic clarity** - This document
2. **Technical improvements** - Only with step-by-step, detailed breakdown
3. **Evaluation framework** - System to measure reliability

For future sessions, start from this document. Do not assume beyond what is written here.
