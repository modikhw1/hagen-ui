/**
 * Hypothesis Tester
 * 
 * Tests specific prompt modifications against a subset of videos where that gap was identified.
 * This allows targeted iteration: "Does adding X to the prompt improve Y?"
 * 
 * Workflow:
 * 1. Run generate-question-battery.js --categorize --hypotheses
 * 2. Choose a hypothesis to test
 * 3. Modify the prompt (deep-reasoning.ts or create a variant)
 * 4. Run this script to test on relevant videos
 * 5. Compare before/after scores
 * 
 * Usage:
 *   node scripts/test-hypothesis.js --gap=SOCIAL_DYNAMICS    # Test on social dynamics gaps
 *   node scripts/test-hypothesis.js --gap=VISUAL_REVEAL      # Test on visual reveal gaps
 *   node scripts/test-hypothesis.js --ids=abc,def,ghi        # Test specific video IDs
 *   node scripts/test-hypothesis.js --prompt=variant.md      # Use alternate prompt file
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const OUTPUT_FILE = path.join(__dirname, '..', 'datasets', 'hypothesis_test_results.json');

// Parse args
const args = {
  gap: process.argv.find(a => a.startsWith('--gap='))?.split('=')[1],
  ids: process.argv.find(a => a.startsWith('--ids='))?.split('=')[1]?.split(','),
  promptFile: process.argv.find(a => a.startsWith('--prompt='))?.split('=')[1],
  limit: parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '10'),
  verbose: process.argv.includes('--verbose'),
};

/**
 * Load the deep reasoning chain (current or variant)
 */
function loadPrompt() {
  if (args.promptFile) {
    const promptPath = path.join(__dirname, '..', 'prompts', args.promptFile);
    if (fs.existsSync(promptPath)) {
      console.log(`📄 Loading prompt variant: ${args.promptFile}\n`);
      return fs.readFileSync(promptPath, 'utf-8');
    }
    console.warn(`⚠️ Prompt file not found: ${promptPath}, using default\n`);
  }
  
  // Use default from deep-reasoning.ts
  try {
    const deepReasoning = require('../src/lib/services/video/deep-reasoning.ts');
    console.log('📄 Using current deep reasoning chain from source\n');
    return deepReasoning.DEEP_REASONING_CHAIN;
  } catch (e) {
    console.error('Failed to load deep reasoning:', e.message);
    process.exit(1);
  }
}

/**
 * Load question battery to find relevant examples
 */
function loadQuestionBattery() {
  const batteryFile = path.join(__dirname, '..', 'datasets', 'question_battery.json');
  if (fs.existsSync(batteryFile)) {
    return JSON.parse(fs.readFileSync(batteryFile, 'utf-8'));
  }
  return null;
}

/**
 * Get examples matching the target gap type
 */
async function getTargetExamples() {
  const battery = loadQuestionBattery();
  
  if (args.ids) {
    // Specific IDs provided
    const { data } = await supabase
      .from('video_analysis_examples')
      .select('*')
      .in('id', args.ids);
    return data || [];
  }
  
  if (args.gap && battery) {
    // Filter by gap type
    const matching = battery.examples
      .filter(e => e.gap_classification?.primary_gap === args.gap)
      .slice(0, args.limit);
    
    // Fetch full data for these
    const ids = matching.map(e => e.id);
    const { data } = await supabase
      .from('video_analysis_examples')
      .select('*')
      .in('id', ids);
    
    return data || [];
  }
  
  // Default: get lowest scoring examples
  const { data } = await supabase
    .from('video_analysis_examples')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(args.limit);
  
  return data || [];
}

/**
 * Run analysis with current prompt
 */
async function runAnalysis(example, promptChain) {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  
  // Build context
  let context = `Video: ${example.video_summary}`;
  
  if (example.humor_type_correction?.transcript) {
    context += `\n\nTranscript:\n${example.humor_type_correction.transcript}`;
  } else if (example.humor_type_correction?.scenes) {
    context += `\n\nScenes:\n${example.humor_type_correction.scenes}`;
  }
  
  const prompt = `${promptChain}

VIDEO TO ANALYZE:
${context}

Respond with JSON:
{
  "deep_reasoning": {
    "character_dynamic": "...",
    "underlying_tension": "...",
    "format_participation": "...",
    "editing_contribution": "...",
    "audience_surrogate": "...",
    "social_dynamic": "...",
    "quality_assessment": "..."
  },
  "humorType": "...",
  "humorMechanism": "..."
}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    // Extract JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { raw: text, error: 'No JSON found' };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Compare new analysis to human correction using LLM judge
 */
async function judgeAnalysis(example, newAnalysis) {
  const prompt = `Compare this AI analysis to the human expert correction:

HUMAN EXPERT SAYS:
${example.correct_interpretation}
${example.explanation ? `\nExplanation: ${example.explanation}` : ''}

AI ANALYSIS:
${JSON.stringify(newAnalysis, null, 2)}

ORIGINAL AI ERROR:
${example.gemini_interpretation || 'Not recorded'}

Rate the NEW analysis on these criteria (0-100):

1. MECHANISM_MATCH: Did AI identify the same humor mechanism?
2. INSIGHT_CAPTURED: Did AI capture the key insight, including social dynamics?
3. ERROR_AVOIDED: Did AI avoid the original mistake?
4. DEPTH: Is the reasoning chain thorough and insightful?

Also identify:
- WHAT_IMPROVED: What did the new analysis get right that was wrong before?
- STILL_MISSING: What is still missing?

Respond with JSON:
{
  "scores": {
    "mechanism_match": 0-100,
    "insight_captured": 0-100,
    "error_avoided": 0-100,
    "depth": 0-100
  },
  "overall": 0-100,
  "what_improved": "...",
  "still_missing": "..."
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2
    });
    
    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    return { error: error.message, overall: 0 };
  }
}

/**
 * Get embedding for similarity comparison
 */
async function getEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 1536
  });
  return response.data[0].embedding;
}

/**
 * Compute cosine similarity
 */
function cosineSimilarity(a, b) {
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Main test runner
 */
async function runHypothesisTest() {
  console.log('🧪 Hypothesis Tester\n');
  console.log('═'.repeat(60));
  
  if (args.gap) {
    console.log(`Testing gap type: ${args.gap}`);
  }
  if (args.promptFile) {
    console.log(`Using prompt: ${args.promptFile}`);
  }
  console.log(`Limit: ${args.limit} examples\n`);
  
  // Load prompt
  const promptChain = loadPrompt();
  
  // Get target examples
  const examples = await getTargetExamples();
  console.log(`Found ${examples.length} examples to test\n`);
  
  if (examples.length === 0) {
    console.log('No examples found. Run generate-question-battery.js first.');
    return;
  }
  
  // Load existing scores for comparison
  const scoresFile = path.join(__dirname, '..', 'datasets', 'understanding_scores.json');
  const existingScores = fs.existsSync(scoresFile) 
    ? JSON.parse(fs.readFileSync(scoresFile, 'utf-8')) 
    : { scores: {} };
  
  // Run tests
  const results = [];
  let totalOldScore = 0;
  let totalNewScore = 0;
  let improvements = 0;
  let regressions = 0;
  
  for (let i = 0; i < examples.length; i++) {
    const example = examples[i];
    const oldScore = existingScores.scores[example.id]?.score || 50;
    
    console.log(`[${i + 1}/${examples.length}] ${example.video_summary?.slice(0, 50)}...`);
    console.log(`   Old score: ${oldScore}%`);
    
    // Run new analysis
    const newAnalysis = await runAnalysis(example, promptChain);
    
    if (newAnalysis.error) {
      console.log(`   ❌ Analysis failed: ${newAnalysis.error}\n`);
      continue;
    }
    
    // Judge the new analysis
    const judgment = await judgeAnalysis(example, newAnalysis);
    const newScore = judgment.overall || 0;
    
    console.log(`   New score: ${newScore}% (${newScore > oldScore ? '📈 +' : newScore < oldScore ? '📉 ' : '➡️ '}${newScore - oldScore})`);
    
    if (args.verbose) {
      console.log(`   Mechanism: ${judgment.scores?.mechanism_match || 'N/A'}%`);
      console.log(`   Insight: ${judgment.scores?.insight_captured || 'N/A'}%`);
      console.log(`   What improved: ${judgment.what_improved || 'N/A'}`);
      console.log(`   Still missing: ${judgment.still_missing || 'N/A'}`);
    }
    
    console.log('');
    
    totalOldScore += oldScore;
    totalNewScore += newScore;
    if (newScore > oldScore) improvements++;
    if (newScore < oldScore) regressions++;
    
    results.push({
      id: example.id,
      video_summary: example.video_summary,
      old_score: oldScore,
      new_score: newScore,
      delta: newScore - oldScore,
      judgment: judgment,
      new_analysis: newAnalysis
    });
    
    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Summary
  const avgOld = totalOldScore / results.length;
  const avgNew = totalNewScore / results.length;
  const avgDelta = avgNew - avgOld;
  
  console.log('═'.repeat(60));
  console.log('RESULTS SUMMARY');
  console.log('═'.repeat(60));
  console.log(`\n📊 Score Comparison:`);
  console.log(`   Average OLD: ${avgOld.toFixed(1)}%`);
  console.log(`   Average NEW: ${avgNew.toFixed(1)}%`);
  console.log(`   Delta: ${avgDelta > 0 ? '+' : ''}${avgDelta.toFixed(1)}%`);
  console.log(`\n📈 Improvements: ${improvements}/${results.length}`);
  console.log(`📉 Regressions: ${regressions}/${results.length}`);
  
  if (avgDelta > 5) {
    console.log(`\n✅ HYPOTHESIS SUPPORTED: Significant improvement (+${avgDelta.toFixed(1)}%)`);
  } else if (avgDelta > 0) {
    console.log(`\n🟡 MARGINAL IMPROVEMENT: Small gain (+${avgDelta.toFixed(1)}%)`);
  } else if (avgDelta > -5) {
    console.log(`\n🟠 NO SIGNIFICANT CHANGE: Delta within noise (${avgDelta.toFixed(1)}%)`);
  } else {
    console.log(`\n❌ HYPOTHESIS REJECTED: Regression observed (${avgDelta.toFixed(1)}%)`);
  }
  
  // Save results
  const output = {
    tested_at: new Date().toISOString(),
    config: {
      gap_type: args.gap,
      prompt_file: args.promptFile,
      limit: args.limit
    },
    summary: {
      total_tested: results.length,
      average_old_score: avgOld,
      average_new_score: avgNew,
      average_delta: avgDelta,
      improvements: improvements,
      regressions: regressions
    },
    results: results
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\n📁 Saved detailed results: ${OUTPUT_FILE}\n`);
}

// Run
runHypothesisTest().catch(console.error);
