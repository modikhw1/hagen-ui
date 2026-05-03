/**
 * Quick Prompt Iteration Tool
 * 
 * Rapidly test prompt changes by analyzing a few examples and showing immediate results.
 * Perfect for: "I just changed the prompt, did it help?"
 * 
 * Usage:
 *   node scripts/quick-iterate.js                    # Test on 5 recent corrections
 *   node scripts/quick-iterate.js --count=10         # Test on 10 examples
 *   node scripts/quick-iterate.js --video-id=xxx     # Test specific video
 *   node scripts/quick-iterate.js --show-analysis    # Show full AI analysis
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Parse args
const args = {
  count: parseInt(process.argv.find(a => a.startsWith('--count='))?.split('=')[1] || '5'),
  videoId: process.argv.find(a => a.startsWith('--video-id='))?.split('=')[1],
  showAnalysis: process.argv.includes('--show-analysis'),
};

/**
 * IMPORT THE CURRENT DEEP REASONING CHAIN
 * This ensures we're testing the LATEST prompt from the codebase
 */
let DEEP_REASONING_CHAIN;
try {
  // Try to import from TypeScript source (requires ts-node or compiled version)
  const deepReasoning = require('../src/lib/services/video/deep-reasoning.ts');
  DEEP_REASONING_CHAIN = deepReasoning.DEEP_REASONING_CHAIN;
  console.log('✓ Loaded deep reasoning chain from source\n');
} catch (e) {
  // Fallback: inline the prompt (update this if you make changes)
  console.log('⚠ Using fallback deep reasoning chain (consider using ts-node)\n');
  DEEP_REASONING_CHAIN = `
═══════════════════════════════════════════════════════════════════════════════
DEEP HUMOR REASONING CHAIN (Complete BEFORE labeling humor type)
═══════════════════════════════════════════════════════════════════════════════

For EVERY video with humor, answer these questions IN ORDER before assigning labels:

┌─────────────────────────────────────────────────────────────────────────────
│ STEP 1: CHARACTER DYNAMICS
│ Don't describe what characters DO. Describe their RELATIONSHIP and MOTIVATIONS.
└─────────────────────────────────────────────────────────────────────────────

┌─────────────────────────────────────────────────────────────────────────────
│ STEP 2: UNDERLYING TENSION
│ Every joke has tension. Find it. The humor lives in the GAP between opposites.
└─────────────────────────────────────────────────────────────────────────────

┌─────────────────────────────────────────────────────────────────────────────
│ STEP 3: FORMAT PARTICIPATION
│ The STRUCTURE of the video can be part of the joke.
└─────────────────────────────────────────────────────────────────────────────

[... rest of chain ...]
`
}

/**
 * Build analysis prompt with current deep reasoning chain
 */
function buildAnalysisPrompt(example) {
  const contextParts = [];
  
  if (example.video_summary) {
    contextParts.push(`Video: ${example.video_summary}`);
  }
  
  if (example.humor_type_correction?.transcript) {
    contextParts.push(`\nTranscript:\n${example.humor_type_correction.transcript}`);
  } else if (example.humor_type_correction?.scenes) {
    contextParts.push(`\nScenes:\n${example.humor_type_correction.scenes}`);
  }
  
  const context = contextParts.join('\n');
  
  return `${DEEP_REASONING_CHAIN}

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
    "quality_assessment": "...",
    "why_this_is_funny": "...",
    "what_makes_it_work": "..."
  },
  "humorType": "...",
  "humorMechanism": "A specific explanation derived from the reasoning above"
}`;
}

/**
 * Analyze with Gemini
 */
async function analyzeWithGemini(example) {
  const prompt = buildAnalysisPrompt(example);
  
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-exp',
    generationConfig: {
      temperature: 0.3,
      responseMimeType: 'application/json'
    }
  });
  
  const result = await model.generateContent(prompt);
  return JSON.parse(result.response.text());
}

/**
 * Quick LLM-as-Judge evaluation
 */
async function judgeAnalysis(aiAnalysis, humanCorrection) {
  const prompt = `Evaluate how well this AI analysis captures the human expert's understanding.

HUMAN EXPERT ANALYSIS:
${humanCorrection.correct_interpretation}
${humanCorrection.explanation}

AI ANALYSIS:
${JSON.stringify(aiAnalysis, null, 2)}

Rate on a simple scale:
- EXCELLENT (90-100): AI captures the exact insight, names mechanisms specifically
- GOOD (75-89): AI gets the main point but misses some nuance  
- ACCEPTABLE (60-74): AI is partially correct but shallow
- POOR (0-59): AI misses the key insight or is incorrect

Respond with JSON:
{
  "rating": "<EXCELLENT|GOOD|ACCEPTABLE|POOR>",
  "score": <0-100>,
  "what_ai_got_right": "...",
  "what_ai_missed": "...",
  "one_line_verdict": "..."
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.1
  });
  
  return JSON.parse(response.choices[0].message.content);
}

/**
 * Format rating with color
 */
function formatRating(rating, score) {
  const colors = {
    EXCELLENT: '\x1b[32m', // green
    GOOD: '\x1b[36m',      // cyan
    ACCEPTABLE: '\x1b[33m', // yellow
    POOR: '\x1b[31m'       // red
  };
  const reset = '\x1b[0m';
  
  return `${colors[rating] || ''}${rating} (${score}%)${reset}`;
}

/**
 * Main function
 */
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║         QUICK PROMPT ITERATION TESTER                     ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  // Fetch examples
  let query = supabase
    .from('video_analysis_examples')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (args.videoId) {
    query = query.eq('id', args.videoId);
  } else {
    query = query.limit(args.count);
  }
  
  const { data: examples, error } = await query;
  
  if (error || !examples?.length) {
    console.error('No examples found');
    return;
  }
  
  console.log(`Testing on ${examples.length} example(s)\n`);
  console.log('─'.repeat(60));
  
  const results = [];
  
  for (let i = 0; i < examples.length; i++) {
    const example = examples[i];
    const preview = example.video_summary?.substring(0, 50) || 'No summary';
    
    console.log(`\n[${i + 1}/${examples.length}] ${preview}...\n`);
    
    try {
      // Re-analyze with current prompt
      console.log('  🤖 Analyzing with current prompt...');
      const newAnalysis = await analyzeWithGemini(example);
      
      // Judge the analysis
      console.log('  ⚖️  Evaluating with LLM-as-Judge...');
      const judgment = await judgeAnalysis(newAnalysis, example);
      
      // Display results
      console.log(`  ${formatRating(judgment.rating, judgment.score)}`);
      console.log(`  ✓ Got right: ${judgment.what_ai_got_right}`);
      if (judgment.what_ai_missed !== 'none' && judgment.what_ai_missed.length > 0) {
        console.log(`  ✗ Missed: ${judgment.what_ai_missed}`);
      }
      console.log(`  → ${judgment.one_line_verdict}`);
      
      if (args.showAnalysis) {
        console.log('\n  📄 Full AI Analysis:');
        console.log('  ' + JSON.stringify(newAnalysis, null, 2).replace(/\n/g, '\n  '));
      }
      
      results.push({
        video_summary: preview,
        rating: judgment.rating,
        score: judgment.score,
        verdict: judgment.one_line_verdict,
        analysis: newAnalysis
      });
      
      // Rate limiting
      await new Promise(r => setTimeout(r, 500));
      
    } catch (err) {
      console.log(`  ❌ Error: ${err.message}`);
      results.push({
        video_summary: preview,
        error: err.message
      });
    }
  }
  
  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60) + '\n');
  
  const scored = results.filter(r => r.score !== undefined);
  if (scored.length > 0) {
    const avgScore = scored.reduce((a, r) => a + r.score, 0) / scored.length;
    const distribution = {
      EXCELLENT: scored.filter(r => r.rating === 'EXCELLENT').length,
      GOOD: scored.filter(r => r.rating === 'GOOD').length,
      ACCEPTABLE: scored.filter(r => r.rating === 'ACCEPTABLE').length,
      POOR: scored.filter(r => r.rating === 'POOR').length
    };
    
    console.log(`Average Score: ${avgScore.toFixed(1)}%\n`);
    console.log('Distribution:');
    console.log(`  ${formatRating('EXCELLENT', '')} : ${'█'.repeat(distribution.EXCELLENT)} ${distribution.EXCELLENT}`);
    console.log(`  ${formatRating('GOOD', '')}      : ${'█'.repeat(distribution.GOOD)} ${distribution.GOOD}`);
    console.log(`  ${formatRating('ACCEPTABLE', '')}: ${'█'.repeat(distribution.ACCEPTABLE)} ${distribution.ACCEPTABLE}`);
    console.log(`  ${formatRating('POOR', '')}      : ${'█'.repeat(distribution.POOR)} ${distribution.POOR}`);
    
    console.log('\n' + '─'.repeat(60));
    console.log('INTERPRETATION:');
    if (avgScore >= 85) {
      console.log('  🎉 Excellent! Your prompt is working well.');
    } else if (avgScore >= 75) {
      console.log('  👍 Good progress. Look at ACCEPTABLE/POOR cases for improvements.');
    } else if (avgScore >= 60) {
      console.log('  ⚠️  Acceptable, but room for improvement. Review missed insights.');
    } else {
      console.log('  ⚠️  Needs work. AI is missing key insights. Review your prompt changes.');
    }
  }
  
  console.log('\n' + '─'.repeat(60));
  console.log('NEXT STEPS:');
  console.log('  1. Review cases where AI missed key insights');
  console.log('  2. Update deep reasoning chain in src/lib/services/video/deep-reasoning.ts');
  console.log('  3. Run this script again to test improvement');
  console.log('  4. When satisfied, commit changes and run full benchmark:');
  console.log('     node scripts/reanalyze-with-deep-reasoning.js --limit=30\n');
}

main().catch(console.error);

