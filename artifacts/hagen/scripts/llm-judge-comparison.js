/**
 * LLM-as-Judge Comparison
 * 
 * Uses an LLM to evaluate conceptual alignment rather than embedding similarity.
 * This is more robust for comparing analyses that may use different words
 * to express the same insights.
 * 
 * Evaluation criteria:
 * 1. Does the analysis identify the CORRECT humor mechanism?
 * 2. Does it capture the key insight the human identified?
 * 3. Does it understand the underlying tension/dynamic?
 * 4. Does it avoid the original error?
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const OUTPUT_FILE = path.join(__dirname, '..', 'datasets', 'llm_judge_comparison.json');

/**
 * Deep reasoning prompt for analysis - ENHANCED with social dynamics and quality assessment
 */
const DEEP_REASONING_PROMPT = `
DEEP REASONING CHAIN - Complete these steps IN ORDER before classifying:

1. CHARACTER DYNAMIC: What power/relationship structure exists between characters?
2. SETUP vs REALITY: What does the format lead us to expect vs what happens?
3. THE VIOLATION: What norm/expectation is broken? By whom? Why significant?
4. FORMAT/EDITING: How does video structure/editing contribute to the comedy?
5. SOCIAL DYNAMICS: Is someone being embarrassed, rejected, or put down? Name it specifically.
   - Mean humor: Casual cruelty delivered deadpan (e.g., "you're not attractive")
   - Embarrassment: Someone misunderstands and looks foolish
   - Escalation: Small issue builds to absurd proportions
   - Misunderstanding: Literal vs intended interpretation
6. QUALITY ASSESSMENT: Be honest - is this a strong premise, weak premise that relies on delivery, 
   or just relatable content without real humor payoff?
7. THE REAL MECHANISM: What ACTUALLY makes this funny? (Not just a label)

VIDEO CONTEXT:
{context}

Respond with JSON:
{
  "deep_reasoning": {
    "character_dynamic": "...",
    "setup_vs_reality": "...",
    "the_violation": "...",
    "format_editing": "...",
    "social_dynamic": "Specifically: who is embarrassed/rejected/put down and how, or 'none'",
    "quality_assessment": "Strong premise / Weak premise needing delivery / Relatable but not funny / etc.",
    "the_real_mechanism": "..."
  },
  "humorType": "...",
  "humorMechanism": "A specific explanation of what makes this funny"
}`;

/**
 * LLM Judge prompt - evaluates conceptual alignment
 */
const JUDGE_PROMPT = `You are evaluating whether an AI's humor analysis captures the same insights as a human expert.

HUMAN EXPERT ANALYSIS:
{human}

AI ANALYSIS TO EVALUATE:
{ai}

ORIGINAL AI ERROR (what the AI got wrong before):
{original_error}

Evaluate on these criteria (0-100 each):

1. MECHANISM MATCH: Does the AI identify the same core humor mechanism as the human?
   - 100 = Exact same mechanism identified
   - 50 = Related but different mechanism
   - 0 = Completely different/wrong mechanism

2. KEY INSIGHT CAPTURED: Does the AI capture the human's main insight about WHY this is funny?
   This includes:
   - Social dynamics (if someone is embarrassed, rejected, put down - did AI name it?)
   - Power dynamics (who has power, who doesn't)
   - Quality assessment (if human said "weak premise" or "not really funny", did AI recognize this?)
   
   - 100 = Captures the exact insight including social/power dynamics
   - 50 = Partially captures it, misses important nuance
   - 0 = Misses it entirely

3. ERROR AVOIDED: Does the AI avoid the original mistake?
   - 100 = Completely avoids the error, shows deeper understanding
   - 50 = Partially avoids it
   - 0 = Makes the same or similar error

4. DEPTH OF ANALYSIS: How well does the AI explain the underlying dynamics?
   Look for: specific naming of social dynamics, acknowledgment of quality issues,
   recognition of mean humor vs light humor, escalation patterns, etc.
   - 100 = Deep, nuanced analysis matching human depth
   - 50 = Surface-level but correct
   - 0 = Shallow or incorrect

Respond with JSON only:
{
  "mechanism_match": <0-100>,
  "key_insight_captured": <0-100>,
  "error_avoided": <0-100>,
  "depth_of_analysis": <0-100>,
  "overall_score": <0-100>,
  "brief_explanation": "One sentence explaining the score"
}`;

/**
 * Build context for analysis
 */
function buildContext(example) {
  const parts = [];
  if (example.video_summary) parts.push(`Summary: ${example.video_summary}`);
  if (example.transcript) parts.push(`Transcript: ${example.transcript.substring(0, 500)}`);
  if (example.scene_breakdown) parts.push(`Scenes: ${example.scene_breakdown.substring(0, 300)}`);
  return parts.join('\n');
}

/**
 * Build human analysis text for comparison
 */
function buildHumanAnalysis(example) {
  const parts = [];
  
  if (example.correct_interpretation) {
    parts.push(`CORRECT INTERPRETATION:\n${example.correct_interpretation}`);
  }
  
  if (example.explanation) {
    parts.push(`EXPLANATION:\n${example.explanation}`);
  }
  
  const htc = example.humor_type_correction;
  if (htc) {
    if (htc.correct) parts.push(`CORRECT HUMOR TYPE: ${htc.correct}`);
    if (htc.why) parts.push(`WHY: ${htc.why}`);
    if (htc.humanInsight) parts.push(`KEY INSIGHT: ${htc.humanInsight}`);
    if (htc.deep_reasoning) {
      parts.push(`DEEP REASONING: ${JSON.stringify(htc.deep_reasoning, null, 2)}`);
    }
  }
  
  return parts.join('\n\n');
}

/**
 * Get the original error
 */
function getOriginalError(example) {
  const parts = [];
  if (example.gemini_interpretation) {
    parts.push(`Original interpretation: ${example.gemini_interpretation}`);
  }
  if (example.humor_type_correction?.original) {
    parts.push(`Original humor type: ${example.humor_type_correction.original}`);
  }
  return parts.join('\n') || 'Unknown original error';
}

/**
 * Analyze with deep reasoning
 */
async function analyzeWithDeepReasoning(example) {
  const context = buildContext(example);
  const prompt = DEEP_REASONING_PROMPT.replace('{context}', context);
  
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.0-flash-exp',
    generationConfig: { temperature: 0.3, responseMimeType: 'application/json' }
  });
  
  const result = await model.generateContent(prompt);
  return JSON.parse(result.response.text());
}

/**
 * Use LLM to judge the analysis quality
 */
async function judgeAnalysis(humanAnalysis, aiAnalysis, originalError) {
  const prompt = JUDGE_PROMPT
    .replace('{human}', humanAnalysis)
    .replace('{ai}', JSON.stringify(aiAnalysis, null, 2))
    .replace('{original_error}', originalError);
  
  // Use GPT-4 as judge for more reliable evaluation
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.1
  });
  
  return JSON.parse(response.choices[0].message.content);
}

/**
 * Main function
 */
async function main() {
  const limit = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '20');
  
  console.log('=== LLM-AS-JUDGE COMPARISON ===\n');
  console.log(`Evaluating ${limit} examples with conceptual alignment scoring\n`);
  
  // Fetch examples
  const { data: examples } = await supabase
    .from('video_analysis_examples')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  
  const results = [];
  
  for (let i = 0; i < examples.length; i++) {
    const example = examples[i];
    const preview = example.video_summary?.substring(0, 50) || 'No summary';
    
    try {
      console.log(`[${i+1}/${limit}] ${preview}...`);
      
      // Get the human analysis
      const humanAnalysis = buildHumanAnalysis(example);
      const originalError = getOriginalError(example);
      
      // Re-analyze with deep reasoning
      const newAnalysis = await analyzeWithDeepReasoning(example);
      
      // Judge the analysis
      const judgment = await judgeAnalysis(humanAnalysis, newAnalysis, originalError);
      
      console.log(`  → Overall: ${judgment.overall_score}% | Mechanism: ${judgment.mechanism_match}% | Insight: ${judgment.key_insight_captured}%`);
      
      results.push({
        id: example.id,
        video_summary: preview,
        old_embedding_score: example.humor_type_correction?.understanding_score,
        new_scores: {
          mechanism_match: judgment.mechanism_match,
          key_insight_captured: judgment.key_insight_captured,
          error_avoided: judgment.error_avoided,
          depth_of_analysis: judgment.depth_of_analysis,
          overall: judgment.overall_score
        },
        explanation: judgment.brief_explanation,
        new_analysis: newAnalysis
      });
      
      await new Promise(r => setTimeout(r, 500));
      
    } catch (err) {
      console.log(`  → Error: ${err.message}`);
    }
  }
  
  // Compute statistics
  const withScores = results.filter(r => r.new_scores);
  const avgMechanism = withScores.reduce((a, r) => a + r.new_scores.mechanism_match, 0) / withScores.length;
  const avgInsight = withScores.reduce((a, r) => a + r.new_scores.key_insight_captured, 0) / withScores.length;
  const avgError = withScores.reduce((a, r) => a + r.new_scores.error_avoided, 0) / withScores.length;
  const avgDepth = withScores.reduce((a, r) => a + r.new_scores.depth_of_analysis, 0) / withScores.length;
  const avgOverall = withScores.reduce((a, r) => a + r.new_scores.overall, 0) / withScores.length;
  
  // Compare to old embedding scores
  const withBoth = withScores.filter(r => r.old_embedding_score);
  const avgOldEmbedding = withBoth.length > 0 
    ? withBoth.reduce((a, r) => a + r.old_embedding_score, 0) / withBoth.length 
    : null;
  
  const output = {
    evaluated_at: new Date().toISOString(),
    sample_size: withScores.length,
    statistics: {
      mechanism_match: Math.round(avgMechanism * 10) / 10,
      key_insight_captured: Math.round(avgInsight * 10) / 10,
      error_avoided: Math.round(avgError * 10) / 10,
      depth_of_analysis: Math.round(avgDepth * 10) / 10,
      overall_score: Math.round(avgOverall * 10) / 10,
      old_embedding_average: avgOldEmbedding ? Math.round(avgOldEmbedding * 10) / 10 : null
    },
    results
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  
  console.log('\n=== RESULTS ===');
  console.log(`Sample size: ${withScores.length}`);
  console.log(`\nLLM JUDGE SCORES (Deep Reasoning):`);
  console.log(`  Mechanism Match:     ${avgMechanism.toFixed(1)}%`);
  console.log(`  Key Insight:         ${avgInsight.toFixed(1)}%`);
  console.log(`  Error Avoided:       ${avgError.toFixed(1)}%`);
  console.log(`  Depth of Analysis:   ${avgDepth.toFixed(1)}%`);
  console.log(`  OVERALL:             ${avgOverall.toFixed(1)}%`);
  if (avgOldEmbedding) {
    console.log(`\nOLD EMBEDDING SCORES (Baseline): ${avgOldEmbedding.toFixed(1)}%`);
    console.log(`\n→ The LLM judge provides more nuanced evaluation than embeddings`);
  }
  console.log(`\nResults saved to ${OUTPUT_FILE}`);
}

main().catch(console.error);
