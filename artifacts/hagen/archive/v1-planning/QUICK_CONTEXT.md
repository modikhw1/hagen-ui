# Quick Context: Humor Analysis System

**Last Updated**: December 22, 2025

## The Flow (How Gemini Analyzes Videos)

```
                    ┌─────────────────────────────┐
                    │  /analyze-rate-v1 (page)    │
                    │  User uploads video URL     │
                    └─────────────┬───────────────┘
                                  │
                    ┌─────────────▼───────────────┐
                    │  GeminiVideoAnalyzer        │
                    │  src/lib/services/video/    │
                    │  gemini.ts                  │
                    └─────────────┬───────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
          ▼                       ▼                       ▼
┌─────────────────┐   ┌───────────────────┐   ┌─────────────────┐
│ learning.ts     │   │ deep-reasoning.ts │   │ buildPrompt()   │
│ (RAG retrieval) │   │ (reasoning chain) │   │ (scene schema)  │
└────────┬────────┘   └─────────┬─────────┘   └────────┬────────┘
         │                      │                      │
         └──────────────────────┼──────────────────────┘
                                │
                    ┌───────────▼───────────────┐
                    │  COMBINED PROMPT          │
                    │  = Deep Reasoning Chain   │
                    │  + RAG Examples           │
                    │  + Scene/Humor Schema     │
                    └───────────┬───────────────┘
                                │
                    ┌───────────▼───────────────┐
                    │  Gemini 2.0 Flash         │
                    │  Analyzes actual video    │
                    └───────────┬───────────────┘
                                │
                    ┌───────────▼───────────────┐
                    │  Output: visual_analysis  │
                    │  → script.humor.humorType │
                    │  → script.humor.humorMechanism
                    │  → script.deep_reasoning  │
                    └───────────────────────────┘
```

---

## The 3 Key Files to Edit

### 1. `src/lib/services/video/deep-reasoning.ts`
**What it does**: Contains the DEEP_REASONING_CHAIN prompt - the step-by-step instructions that tell Gemini HOW to analyze humor.

**Current steps**:
- STEP 1: Character Dynamics
- STEP 2: Underlying Tension
- STEP 3: Format Participation
- STEP 4: Editing as Comedy
- STEP 4.5: Visual Punchline Detection
- STEP 4.6: Tone & Delivery
- STEP 5: Audience Surrogate
- STEP 5.5: Wordplay & Misunderstanding
- STEP 6: Social Dynamics & Cruelty
- STEP 6.5: Cultural Context & Tropes
- STEP 7: Content Type & Intent
- STEP 8: Quality Assessment
- STEP 9: The Explanation Test

**To iterate**: Add examples, clarify steps, add new sub-steps here.

### 2. `src/lib/services/video/gemini.ts`
**What it does**: The actual Gemini API call. Contains `buildAnalysisPrompt()` with the JSON schema for output.

**Key lines**:
- Line 99: Gets the base prompt
- Line 152: `buildAnalysisPrompt()` - defines the output structure
- Line 306-307: `humorType` and `humorMechanism` fields

**To iterate**: Modify output schema, add new fields to capture.

### 3. `src/lib/services/video/learning.ts`
**What it does**: RAG system - finds similar past videos with human corrections and injects them as examples.

**Key function**: `buildFewShotPrompt(examples)` - combines:
- DEEP_REASONING_CHAIN
- Retrieved examples with human corrections
- "Don't make these mistakes again" framing

**To iterate**: Improve how corrections are presented to the model.

---

## The Data (Where Corrections Live)

### Table: `video_analysis_examples` (143 rows)
| Column | What it is |
|--------|------------|
| `video_summary` | Text description of the video |
| `gemini_interpretation` | Original AI analysis (often wrong) |
| `humor_type_correction` | **YOUR corrections** with: |
| → `.why` | Why Gemini was wrong |
| → `.correct` | What the correct analysis is |
| → `.deep_reasoning` | Structured correction (character_dynamic, etc.) |
| → `.humanInsight` | General notes (rating, observations) |
| → `.understanding_score` | Computed similarity (0-100) |

### Current Stats
- **142 with corrections**
- **6 with structured `why`/`correct`**
- **3 with full `deep_reasoning`**
- **106 with `humanInsight`**
- **Average score: 55.9%**

---

## Gap Categories (From question_battery.json)

| Gap | Count | What to Fix |
|-----|-------|-------------|
| Cultural Context Missing | 57 | Add to STEP 6.5 |
| Quality Assessment Wrong | 31 | Calibrate STEP 8 |
| Social Dynamics Missed | 28 | Add examples to STEP 6 |
| Visual Reveal Not Captured | 21 | Strengthen STEP 4.5 |
| Format Subversion Missed | 3 | Add examples to STEP 3 |
| Subtle Elements Missed | 2 | Add subtext step |

---

## How to Iterate

### Option A: Add to Deep Reasoning Chain
Edit `src/lib/services/video/deep-reasoning.ts`:

```typescript
// Find the relevant STEP section and add:
│ 
│ TEACHING EXAMPLE:
│ Video: "Customer asks 'do you work here?' to uniformed employee"
│ ❌ WRONG: "Subversion humor"
│ ✅ RIGHT: "Sarcasm as social correction. The employee removes uniform and 
│           says 'no' to mock the obviously-answered question. The physical
│           action (removing uniform) amplifies the sarcasm."
│
```

### Option B: Add Seed Example
Edit `src/lib/services/video/deep-reasoning.ts` → `SEED_DEEP_REASONING_EXAMPLES[]`:

```typescript
{
  video_summary: "Customer asks 'do you work here?' to person in uniform",
  original_analysis: "Subversion humor",
  deep_reasoning: {
    character_dynamic: "Customer asks obvious question, worker responds with exaggerated sarcasm",
    underlying_tension: "Gap between obvious visual cues and the question asked",
    format_participation: "none",
    editing_contribution: "Mid-action cut as uniform is removed",
    visual_punchline: "The removal of the uniform IS the punchline",
    tone_delivery: "Deadpan 'no' delivered while actively removing proof of employment",
    social_dynamic: "Social correction - making the asker feel foolish for asking the obvious",
    // ... etc
  },
  correct_interpretation: "Sarcasm as response to obvious question. The physical commitment (removing uniform) elevates simple sarcasm to visual comedy.",
  key_teaching: "When sarcasm is accompanied by exaggerated physical action, the action IS the joke",
  humor_types: ['sarcasm', 'visual-punchline', 'social-correction']
}
```

### Option C: Test Changes
```bash
# Re-analyze a specific video with updated prompt
node scripts/reanalyze-with-deep-reasoning.js --id=c43d3e95-b01a-4e29-af3f-dc542be870a4

# Check if score improved
cat datasets/deep_reasoning_comparison.json | jq '.comparisons["c43d3e95-b01a-4e29-af3f-dc542be870a4"]'

# Run on multiple to see average improvement
node scripts/reanalyze-with-deep-reasoning.js --limit=10
cat datasets/deep_reasoning_comparison.json | jq '.summary'
```

---

## Current Scores (LLM-as-Judge)

From `datasets/llm_judge_comparison.json`:

| Metric | Score |
|--------|-------|
| Mechanism Match | 88.5% |
| Key Insight Captured | 69.2% |
| Error Avoided | 100% |
| Depth of Analysis | 73.1% |
| **Overall** | **82.5%** |

**Best performers** (100%): Videos 4b5b4312, 255317ed, 50f1a673, 3dff9f31

**Needs work** (62%): c43d3e95 (POV tipping), 5908a069 (works here)

---

## Your 6 Key Corrections (with `why` field)

These are your most detailed corrections - gold standard for iteration:

1. **POV Misdirection** (c43d3e95)
   - Gemini: "Subversion"
   - You: "POV misdirection + power-dynamic-reveal"
   - Teaching: The specific subversion is of POV conventions

2. **Malicious Compliance** (00112449)
   - Gemini: "Wordplay"
   - You: "Malicious compliance + absurdist escalation"
   - Teaching: Wordplay is the vehicle, not the humor source

3. **Silent Resistance** (371f02fe)
   - Gemini: "Absurdist"
   - You: "Silent resistance + visual absurdity"
   - Teaching: The absurdity serves workplace resistance

4. **Sarcasm as Correction** (7f9ec1a1 / 5908a069)
   - Gemini: "Subversion"
   - You: Physical removal of uniform = mocking the obvious question
   - Teaching: Action amplifies sarcasm

5. **Caustic Tone** (4b5b4312)
   - Gemini: "Subversion"
   - You: Multiple small jokes, caustic but restrained tone
   - Teaching: Tone/delivery IS the humor, not just script

6. **Mean Humor** (dcf549d0)
   - Gemini: "Absurdist"
   - You: "Mean in an unexpected way" - implied rejection
   - Teaching: The insult is what's NOT said

---

## Next Steps

1. **Pick a gap category** (e.g., Social Dynamics - 28 cases)
2. **Find a correction with `why`** that demonstrates the pattern
3. **Add to deep-reasoning.ts** as teaching example or seed
4. **Test** with `node scripts/reanalyze-with-deep-reasoning.js --limit=10`
5. **If improvement > 5%**, commit the change

The goal is 85%+ on focused evaluation, measured by whether AI answers Core/Nuance/Quality questions correctly.

---

## Session Log: December 22, 2024

### Work Completed This Session

**1. Added 8 New Seed Examples** (deep-reasoning.ts now has 17 total)
- 3 for CULTURAL_CONTEXT (kitchen bell, pregnancy cravings, child negotiation)
- 3 for QUALITY_MISJUDGED (thin premise, flat execution, surface pun)
- 2 for VISUAL_REVEAL (pig edit, selfie reveal)

**2. Created v5.0 Documentation**
- See `/prompts/v5.0_current_state.md`
- Summarizes current prompt architecture, metrics, and gaps

**3. Key Findings**
- Terminal commands to Supabase timing out (may be temporary)
- Live testing needs environment variables (`OPENAI_API_KEY`, etc.)
- The prompt itself is mature - adding examples helps more than changing instructions

**Next Agent Should:**
1. Run live test when terminal is stable: `npm run scripts/test-learning-pipeline.ts`
2. Re-run LLM-as-Judge to measure improvement: `npm run scripts/llm-judge-comparison.js`
3. If SOCIAL_DYNAMICS still failing (28 cases), add seed examples for that gap type
