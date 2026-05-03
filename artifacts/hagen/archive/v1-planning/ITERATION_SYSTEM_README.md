# Joke Understanding Iteration System

## 🎯 What This Is

A complete system for iteratively improving Gemini's joke understanding through systematic prompt engineering and benchmarking. Built specifically for refining how AI captures joke structure and humor mechanisms.

---

## 📦 What's Included

### Documentation

- **`docs/QUICK_START_ITERATION.md`** - Your practical daily workflow (START HERE!)
- **`docs/JOKE_UNDERSTANDING_ITERATION_GUIDE.md`** - Complete iteration methodology
- **`docs/GCS_VIDEO_ACCESS.md`** - Video storage integration guide

### Iteration Scripts

#### Quick Testing
```bash
# Fast iteration: test prompt changes on 5 examples in 2 minutes
node scripts/quick-iterate.js

# Show full AI analysis output
node scripts/quick-iterate.js --show-analysis --count=10
```

#### Progress Tracking
```bash
# Create progress snapshot (benchmark on 20 examples)
node scripts/track-progress.js

# View progress over time
node scripts/track-progress.js --show

# Quick comparison with last snapshot
node scripts/track-progress.js --compare
```

#### Full Benchmarking
```bash
# Re-analyze with updated prompt and compare scores
node scripts/reanalyze-with-deep-reasoning.js --limit=30

# LLM-as-judge evaluation
node scripts/llm-judge-comparison.js --limit=20

# Compute understanding scores
node scripts/compute-understanding-scores.js --stats
```

#### Teaching Example Helper
```bash
# Interactive: Add new teaching example
node scripts/add-teaching-example.js

# From video correction
node scripts/add-teaching-example.js --video-id=abc123
```

#### Question Battery & Hypothesis Testing (NEW)
```bash
# Generate gap analysis document
node scripts/generate-question-battery.js --categorize --hypotheses

# Output: datasets/question_battery.md (readable with video links)
# Output: datasets/question_battery.json (structured data)

# Test a specific prompt modification
node scripts/test-hypothesis.js --gap=SOCIAL_DYNAMICS --verbose
node scripts/test-hypothesis.js --gap=VISUAL_REVEAL --limit=15
```

**Gap categories identified:**
- `CULTURAL_CONTEXT` - AI missed cultural references, tropes, generational humor
- `VISUAL_REVEAL` - Punchline was visual, AI focused on words
- `SOCIAL_DYNAMICS` - Mean humor, embarrassment, rejection not named
- `QUALITY_MISJUDGED` - AI said funny when human said weak/relatable
- `MECHANISM_WRONG` - AI identified completely different type of humor
- `SUBTLE_ELEMENTS` - Between-the-lines meaning, tone, delivery missed
- `FORMAT_SUBVERSION` - Video structure/format was part of the joke

### Existing Analysis Scripts

- `compute-understanding-scores.js` - Semantic similarity scoring
- `llm-judge-comparison.js` - LLM-as-judge evaluation  
- `reanalyze-with-deep-reasoning.js` - Full re-analysis with new prompts
- `backfill-learning-with-gemini-analysis.js` - Populate RAG system
- `generate-question-battery.js` - Create gap analysis document (NEW)
- `test-hypothesis.js` - Test prompt modifications on specific gaps (NEW)

---

## 🚀 Quick Start (5 minutes)

### 1. Check Your Current Performance
```bash
node scripts/compute-understanding-scores.js --stats
```

**You'll see:**
```
Average understanding: 67.3%
Distribution:
  < 50%: 3 (poor)
  50-65%: 8 (below average)  
  65-75%: 6 (average)
  75-85%: 2 (good)
  > 85%: 1 (excellent)
```

This is your baseline.

### 2. Create Your First Snapshot
```bash
node scripts/track-progress.js
```

Now you have a benchmark to compare against.

### 3. Analyze Some Videos

Go to `/analyze-rate-v1` and analyze 3-5 videos. Add corrections when AI gets it wrong.

### 4. Test a Prompt Improvement

Edit `src/lib/services/video/deep-reasoning.ts` → Make a small change → Test it:

```bash
node scripts/quick-iterate.js --count=5
```

If average score improved by +3% or more, you're on the right track!

### 5. View Your Progress

```bash
node scripts/track-progress.js --show
```

---

## 🎮 Your Daily Workflow

### Morning (15 min)
1. Analyze 3-5 videos via `/analyze-rate-v1`
2. Add corrections for any misunderstandings
3. Note patterns in what AI missed

### Afternoon (20 min)
1. If you spotted a pattern, update the prompt
2. Test with `quick-iterate.js`
3. If improvement > +3%, run full benchmark
4. Commit the improvement

### Friday (10 min)
```bash
# Review your progress
node scripts/track-progress.js --show

# Create new snapshot if you made changes
node scripts/track-progress.js
```

---

## 📊 The System Components

### 1. Deep Reasoning Chain
**File:** `src/lib/services/video/deep-reasoning.ts`

Forces structured thinking before labeling:
1. Character dynamics
2. Underlying tension
3. Format participation
4. Editing contribution
5. Audience surrogate
6. Social dynamics & cruelty
7. Quality assessment
8. The real mechanism

**This is where you make improvements.**

### 2. RAG Learning System
**File:** `src/lib/services/video/learning.ts`

- Retrieves similar human-corrected examples
- Injects as few-shot learning into prompts
- Automatically improves as you add corrections

**This learns from your analyze-rate-v1 corrections automatically.**

### 3. LLM-as-Judge
**File:** `src/lib/services/video/quality-judge.ts`

Evaluates analysis quality with 4 metrics:
- Mechanism match (did AI identify correct humor mechanism?)
- Key insight captured (did AI capture YOUR main insight?)
- Error avoided (did AI avoid previous mistakes?)
- Depth of analysis (how nuanced is the explanation?)

**This tells you if your prompt improvements are working.**

### 4. Primary Interface
**Route:** `/analyze-rate-v1`

- Analyze video → See Gemini's analysis
- Compare to your interpretation
- Save corrections
- Corrections feed into RAG system

**This is your main tool for adding corrections.**

---

## 📈 Metrics That Matter

### Primary: LLM-as-Judge Scores (0-100)
- **Mechanism Match**: > 85% (target)
- **Key Insight Captured**: > 80% (target)
- **Error Avoided**: > 85% (target)
- **Depth of Analysis**: > 75% (target)
- **Overall**: > 80% (target)

### Secondary: Understanding Score (0-100)
- Embedding similarity between AI and your analysis
- Target: > 75%

### Qualitative
- % of analyses needing correction (target: < 30%)
- Upward trend in progress chart
- AI explanations match how YOU would explain

---

## 🎓 Improvement Strategy

### Phase 1: Establish Baseline (Week 1)
- [ ] Run `compute-understanding-scores.js --stats`
- [ ] Create first snapshot with `track-progress.js`
- [ ] Analyze 10+ videos, add corrections
- [ ] Identify top 3 patterns AI misses

### Phase 2: First Improvements (Week 2-3)
- [ ] Pick #1 pattern (e.g., "doesn't recognize mean humor")
- [ ] Update deep reasoning chain
- [ ] Test with `quick-iterate.js`
- [ ] If +3% improvement, commit
- [ ] Create new snapshot

### Phase 3: Systematic Iteration (Week 4+)
- [ ] Weekly: Analyze videos, spot patterns
- [ ] Weekly: Make 1-2 targeted improvements
- [ ] Weekly: Track progress
- [ ] Monthly: Review overall trend (target: +5-10% per month)

### Phase 4: Fine-Tuning (Month 3+)
- [ ] Average score > 80%
- [ ] Add teaching examples for edge cases
- [ ] Focus on nuance and depth
- [ ] Maintain improvements (don't regress)

---

## 🔬 Advanced Features

### A/B Testing Prompts

1. Backup current prompt
2. Make variant
3. Test both with `reanalyze-with-deep-reasoning.js`
4. Compare results
5. Keep winner

### Adding Teaching Examples

Best examples come from YOUR corrections:

```bash
node scripts/add-teaching-example.js --video-id=xxx
```

Add to `SEED_DEEP_REASONING_EXAMPLES` in `deep-reasoning.ts`.

### Analyzing Specific Patterns

Filter video_analysis_examples by:
- Humor type (find all "mean humor" misunderstandings)
- Understanding score (find all < 60% scores)
- Tags (find all "format-subversion" examples)

---

## 📁 Key Files to Know

### Prompts
- `prompts/v4.0_humor_deep_reasoning.md` - Teaching document for deep reasoning
- `prompts/v3.5_humor_teaching.md` - Original humor taxonomy teaching

### Services
- `src/lib/services/video/deep-reasoning.ts` - **Main prompt engineering file**
- `src/lib/services/video/learning.ts` - RAG system
- `src/lib/services/video/quality-judge.ts` - LLM-as-judge

### Data
- `datasets/llm_judge_comparison.json` - LLM-as-judge results
- `datasets/deep_reasoning_comparison.json` - Re-analysis comparisons
- `datasets/understanding_scores.json` - Semantic similarity scores
- `datasets/progress_snapshots.json` - Your progress over time

---

## 🎯 Success Looks Like

**After 1 Month:**
- Average understanding: 67% → 75% (+8%)
- Clear upward trend in progress chart
- 2-3 prompt improvements committed
- Fewer major misunderstandings

**After 3 Months:**
- Average understanding: > 85%
- AI captures YOUR key insights consistently
- Only minor corrections needed
- AI explanations teach YOU something about jokes

**The Goal:**
Not to make AI "funny" but to make AI **understand what makes things funny** the way YOU understand it.

---

## 🆘 Support

### Common Issues

**"My prompt change made things worse"**
→ Revert and try a more targeted change. Test on smaller sample first.

**"No improvement after multiple iterations"**
→ Check if you have enough corrections for that pattern (need 10+)

**"Improvement on one pattern, regression on another"**
→ Add qualifiers to balance specificity with generality

### Need Help?

1. Review `docs/QUICK_START_ITERATION.md` - Most common workflows
2. Review `docs/JOKE_UNDERSTANDING_ITERATION_GUIDE.md` - Detailed methodology
3. Check existing scripts for examples

---

## 🚀 Next Steps

1. **Right now**: `node scripts/compute-understanding-scores.js --stats`
2. **Today**: Analyze 3 videos, add corrections
3. **This week**: Make first prompt improvement
4. **This month**: Achieve +10% improvement

You have a complete system. Now iterate! 🎯

---

## 📝 Notes

- All scripts work with current codebase structure
- Progress snapshots persist across sessions
- RAG system improves automatically as you add corrections
- Commit prompt improvements with metrics in commit message

**Version:** 1.0
**Last Updated:** December 22, 2025

