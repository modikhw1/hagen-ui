/**
 * Re-analyze Videos with Deep Reasoning
 * 
 * Takes videos from video_analysis_examples (which have human corrections),
 * re-analyzes them using the new deep reasoning system, and compares the
 * new output to the human-verified correct interpretation.
 * 
 * This measures whether the deep reasoning prompt actually improves understanding.
 * 
 * Usage:
 *   node scripts/reanalyze-with-deep-reasoning.js          # Re-analyze first 10
 *   node scripts/reanalyze-with-deep-reasoning.js --all    # Re-analyze all
 *   node scripts/reanalyze-with-deep-reasoning.js --id=xxx # Re-analyze specific example
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

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const OUTPUT_FILE = path.join(__dirname, '..', 'datasets', 'deep_reasoning_comparison.json');

/**
 * Import the Deep Reasoning Chain from source so we always test the latest prompt
 */
let DEEP_REASONING_CHAIN;
try {
  // Try to load from compiled TypeScript (requires ts-node or build)
  const deepReasoning = require('../src/lib/services/video/deep-reasoning.ts');
  DEEP_REASONING_CHAIN = deepReasoning.DEEP_REASONING_CHAIN;
  console.log('✓ Loaded deep reasoning chain from source\n');
} catch (e) {
  // Fallback to inline version
  console.log('⚠ Using fallback deep reasoning chain (consider using ts-node)\n');
  DEEP_REASONING_CHAIN = `
═══════════════════════════════════════════════════════════════
DEEP REASONING CHAIN - REQUIRED BEFORE ANY HUMOR CLASSIFICATION
═══════════════════════════════════════════════════════════════

Before assigning ANY humor type or mechanism, you MUST work through these questions IN ORDER:

1. CHARACTER DYNAMIC
   "What relationship or power structure exists between the people?"
   → Look for: boss/employee, customer/worker, expert/novice, authority/rebel
   → What tension does this create?

2. UNDERLYING EXPECTATION
   "What does the audience expect will happen based on the format/setup?"
   → What genre conventions are being invoked?
   → What would normally happen in this scenario?

3. THE VIOLATION
   "What rule, norm, or expectation is being broken?"
   → Is it a social norm? A workplace rule? A format convention?
   → WHO is breaking it, and WHY might that be significant?

4. FORMAT PARTICIPATION
   "How does the video's structure contribute to the comedy?"
   → POV tricks, editing timing, reveal placement, sound design
   → Would this be as funny in a different format?

5. EDITING AS COMEDY
   "What does the editing itself communicate?"
   → Mid-word cuts, held shots, reaction timing
   → What is the EDITING saying that dialogue isn't?

6. CULTURAL CONTEXT
   "What cultural knowledge, tropes, or shared experiences does this joke require?"
   → Generational humor codes, industry tropes, social rituals

7. THE REAL MECHANISM
   "Now that I've analyzed the above, what ACTUALLY explains why this is funny?"
   → Don't just label (subversion, wordplay, etc.)
   → Explain the SPECIFIC mechanism at work

ONLY AFTER completing steps 1-7 should you assign:
- humorType (which should REFLECT your reasoning above)
- humorMechanism (a sentence explaining the specific dynamic)
`;
}

/**
 * Build the analysis prompt with deep reasoning
 * Uses all available context from the example and original analysis
 */
function buildPrompt(example, originalAnalysis = null) {
  // Build rich context from available sources
  const contextParts = [];
  
  // Video summary (always available)
  contextParts.push(`VIDEO SUMMARY: ${example.video_summary || 'No summary available'}`);
  
  // Try to get transcript from various sources
  const transcript = example.transcript || 
    example.humor_type_correction?.transcript ||
    originalAnalysis?.script?.transcript;
  if (transcript) {
    contextParts.push(`\nTRANSCRIPT:\n${transcript}`);
  }
  
  // Try to get scene breakdown from original analysis
  if (originalAnalysis?.scenes?.sceneBreakdown) {
    const scenes = originalAnalysis.scenes.sceneBreakdown.map(s => 
      `Scene ${s.sceneNumber} (${s.timestamp}): ${s.visualContent}${s.audioContent ? ` [Audio: ${s.audioContent}]` : ''}`
    ).join('\n');
    contextParts.push(`\nSCENE BREAKDOWN:\n${scenes}`);
  } else if (example.scene_breakdown) {
    contextParts.push(`\nSCENE BREAKDOWN:\n${example.scene_breakdown}`);
  }
  
  // Include original humor mechanism if available (for comparison/improvement)
  if (originalAnalysis?.script?.humor?.humorMechanism) {
    contextParts.push(`\nORIGINAL AI ANALYSIS (may be shallow - your goal is to improve on this):\n${originalAnalysis.script.humor.humorMechanism}`);
  }
  
  // Include visual description if available
  if (originalAnalysis?.script?.visualTranscript) {
    contextParts.push(`\nVISUAL DESCRIPTION:\n${originalAnalysis.script.visualTranscript}`);
  }

  return `${DEEP_REASONING_CHAIN}

${contextParts.join('\n')}

TASK: Analyze this video's humor using the Deep Reasoning Chain above.

Respond with JSON in this format:
{
  "deep_reasoning": {
    "character_dynamic": "...",
    "underlying_tension": "...",
    "format_participation": "...",
    "editing_contribution": "...",
    "audience_surrogate": "...",
    "social_dynamic": "...",
    "cultural_context": "...",
    "quality_assessment": "...",
    "why_this_is_funny": "...",
    "what_makes_it_work": "..."
  },
  "humorType": "...",
  "humorMechanism": "...",
  "fullAnalysis": "..." 
}

The humorType and humorMechanism should REFLECT and be DERIVED FROM your deep_reasoning.
Do not just label - explain the SPECIFIC dynamic at work in THIS video.`;
}

/**
 * Get embedding for text
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
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Build human text for comparison
 */
function buildHumanText(example) {
  const parts = [];
  
  if (example.correct_interpretation) {
    parts.push(example.correct_interpretation);
  }
  
  if (example.explanation) {
    parts.push(example.explanation);
  }
  
  if (example.humor_type_correction?.deep_reasoning) {
    const dr = example.humor_type_correction.deep_reasoning;
    if (dr.character_dynamic) parts.push(`Character dynamic: ${dr.character_dynamic}`);
    if (dr.underlying_tension) parts.push(`Underlying tension: ${dr.underlying_tension}`);
  }
  
  if (example.humor_type_correction?.humanInsight) {
    parts.push(example.humor_type_correction.humanInsight);
  }
  
  if (example.humor_type_correction?.correct) {
    parts.push(`Correct humor type: ${example.humor_type_correction.correct}`);
  }
  
  return parts.join('\n');
}

/**
 * Analyze a video with Gemini using deep reasoning prompt
 */
async function analyzeWithDeepReasoning(example, originalAnalysis = null, useProModel = false) {
  const prompt = buildPrompt(example, originalAnalysis);
  
  // Use gemini-2.5-pro for more nuanced understanding, or flash for speed
  const modelName = useProModel ? 'gemini-2.5-pro' : 'gemini-2.0-flash-exp';
  
  const model = genAI.getGenerativeModel({ 
    model: modelName,
    generationConfig: {
      temperature: 0.3,
      responseMimeType: 'application/json'
    }
  });
  
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  
  try {
    return JSON.parse(text);
  } catch (e) {
    // Try to extract JSON from markdown
    const match = text.match(/```json\n?([\s\S]*?)\n?```/);
    if (match) {
      return JSON.parse(match[1]);
    }
    throw new Error('Failed to parse Gemini response as JSON');
  }
}

/**
 * Fetch original analysis from analyzed_videos table
 */
async function getOriginalAnalysis(videoId) {
  if (!videoId) return null;
  
  const { data, error } = await supabase
    .from('analyzed_videos')
    .select('visual_analysis')
    .eq('id', videoId)
    .single();
  
  if (error || !data) return null;
  return data.visual_analysis;
}

/**
 * Compute understanding score for new analysis
 */
async function computeScore(newAnalysis, example) {
  // Build text from new Gemini analysis
  const parts = [];
  
  if (newAnalysis.deep_reasoning) {
    const dr = newAnalysis.deep_reasoning;
    if (dr.character_dynamic) parts.push(`Character dynamic: ${dr.character_dynamic}`);
    if (dr.underlying_tension) parts.push(`Underlying tension: ${dr.underlying_tension}`);
    if (dr.format_participation) parts.push(`Format: ${dr.format_participation}`);
    if (dr.editing_contribution) parts.push(`Editing: ${dr.editing_contribution}`);
    if (dr.visual_punchline && dr.visual_punchline !== 'none') parts.push(`Visual punchline: ${dr.visual_punchline}`);
    if (dr.audience_surrogate) parts.push(`Audience: ${dr.audience_surrogate}`);
    if (dr.social_dynamic && dr.social_dynamic !== 'none') parts.push(`Social dynamic: ${dr.social_dynamic}`);
    if (dr.cultural_context && dr.cultural_context !== 'none') parts.push(`Cultural context: ${dr.cultural_context}`);
    if (dr.quality_assessment) parts.push(`Quality: ${dr.quality_assessment}`);
    if (dr.why_this_is_funny) parts.push(`Why funny: ${dr.why_this_is_funny}`);
    if (dr.what_makes_it_work) parts.push(`What makes it work: ${dr.what_makes_it_work}`);
  }
  
  if (newAnalysis.humorMechanism) {
    parts.push(`Humor mechanism: ${newAnalysis.humorMechanism}`);
  }
  
  if (newAnalysis.fullAnalysis) {
    parts.push(newAnalysis.fullAnalysis);
  }
  
  const newText = parts.join('\n');
  const humanText = buildHumanText(example);
  
  if (!newText || !humanText) {
    return null;
  }
  
  const [newEmbed, humanEmbed] = await Promise.all([
    getEmbedding(newText),
    getEmbedding(humanText)
  ]);
  
  return Math.round(cosineSimilarity(newEmbed, humanEmbed) * 100);
}

/**
 * Main function
 */
async function main() {
  const processAll = process.argv.includes('--all');
  const specificId = process.argv.find(a => a.startsWith('--id='))?.split('=')[1];
  const limitArg = process.argv.find(a => a.startsWith('--limit='))?.split('=')[1];
  const customLimit = limitArg ? parseInt(limitArg, 10) : null;
  const richOnly = process.argv.includes('--rich'); // Only examples with rich notes
  const randomize = process.argv.includes('--random'); // Randomize selection
  const skipProcessed = process.argv.includes('--skip-processed'); // Skip already processed
  const useProModel = process.argv.includes('--pro'); // Use gemini-1.5-pro for better quality
  
  console.log('=== RE-ANALYZE WITH DEEP REASONING ===\n');
  if (useProModel) {
    console.log('Using gemini-1.5-pro for higher quality analysis\n');
  }
  
  // Load existing results
  let existingResults = {};
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      existingResults = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
    } catch (e) {
      existingResults = { comparisons: {} };
    }
  } else {
    existingResults = { comparisons: {} };
  }
  
  // Fetch examples - get more than needed if randomizing
  const fetchLimit = randomize ? 200 : (customLimit || 10);
  
  let query = supabase
    .from('video_analysis_examples')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (specificId) {
    query = query.eq('id', specificId);
  } else if (!processAll) {
    query = query.limit(fetchLimit);
  }
  
  let { data: examples, error } = await query;
  
  if (error) {
    console.error('Error fetching examples:', error);
    return;
  }
  
  // Filter for rich notes if requested (has substantial correct_interpretation or deep_reasoning)
  if (richOnly) {
    examples = examples.filter(ex => {
      const noteLength = (ex.correct_interpretation || '').length;
      const hasDeepReasoning = ex.humor_type_correction?.deep_reasoning || 
                               ex.humor_type_correction?.why;
      return noteLength > 50 || hasDeepReasoning;
    });
    console.log(`Filtered to ${examples.length} examples with rich notes`);
  }
  
  // Skip already processed if requested
  if (skipProcessed) {
    const alreadyProcessed = new Set(Object.keys(existingResults.comparisons || {}));
    const before = examples.length;
    examples = examples.filter(ex => !alreadyProcessed.has(ex.id));
    console.log(`Skipping ${before - examples.length} already processed, ${examples.length} remaining`);
  }
  
  // Randomize if requested
  if (randomize) {
    examples = examples.sort(() => Math.random() - 0.5);
    console.log(`Randomized order`);
  }
  
  // Apply limit after filtering/randomizing
  const finalLimit = customLimit || 10;
  if (!processAll && examples.length > finalLimit) {
    examples = examples.slice(0, finalLimit);
  }
  
  console.log(`\nProcessing ${examples.length} examples...\n`);
  
  let processed = 0;
  let improved = 0;
  let totalOldScore = 0;
  let totalNewScore = 0;
  
  for (const example of examples) {
    try {
      const oldScore = example.humor_type_correction?.understanding_score || 
                       (existingResults.baseline?.[example.id]?.score);
      
      console.log(`\n[${processed + 1}/${examples.length}] ${example.video_summary?.substring(0, 50)}...`);
      console.log(`  Old score: ${oldScore || 'N/A'}%`);
      
      // Fetch original analysis for richer context
      const originalAnalysis = await getOriginalAnalysis(example.video_id);
      if (originalAnalysis) {
        console.log(`  (Using original analysis for context)`);
      }
      
      // Re-analyze with deep reasoning
      const newAnalysis = await analyzeWithDeepReasoning(example, originalAnalysis, useProModel);
      
      // Compute new score
      const newScore = await computeScore(newAnalysis, example);
      
      console.log(`  New score: ${newScore}%`);
      
      if (oldScore && newScore) {
        const delta = newScore - oldScore;
        console.log(`  Delta: ${delta > 0 ? '+' : ''}${delta}%`);
        
        if (delta > 0) improved++;
        totalOldScore += oldScore;
        totalNewScore += newScore;
      }
      
      // Store result
      existingResults.comparisons[example.id] = {
        video_summary: example.video_summary,
        old_score: oldScore,
        new_score: newScore,
        delta: oldScore && newScore ? newScore - oldScore : null,
        deep_reasoning: newAnalysis.deep_reasoning,
        new_humorType: newAnalysis.humorType,
        new_humorMechanism: newAnalysis.humorMechanism,
        analyzed_at: new Date().toISOString()
      };
      
      processed++;
      
      // Rate limiting
      await new Promise(r => setTimeout(r, 500));
      
    } catch (err) {
      console.error(`  Error: ${err.message}`);
    }
  }
  
  // Save results
  const comparisons = Object.values(existingResults.comparisons).filter(c => c.old_score && c.new_score);
  
  existingResults.summary = {
    total_processed: processed,
    comparisons_with_both_scores: comparisons.length,
    improved_count: improved,
    average_old_score: comparisons.length ? Math.round(comparisons.reduce((a, c) => a + c.old_score, 0) / comparisons.length * 10) / 10 : null,
    average_new_score: comparisons.length ? Math.round(comparisons.reduce((a, c) => a + c.new_score, 0) / comparisons.length * 10) / 10 : null,
    average_improvement: comparisons.length ? Math.round(comparisons.reduce((a, c) => a + c.delta, 0) / comparisons.length * 10) / 10 : null,
    last_run: new Date().toISOString()
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(existingResults, null, 2));
  
  console.log('\n\n=== SUMMARY ===');
  console.log(`Processed: ${processed}`);
  console.log(`With both scores: ${comparisons.length}`);
  console.log(`Improved: ${improved} (${Math.round(improved/comparisons.length*100)}%)`);
  console.log(`\nAverage old score: ${existingResults.summary.average_old_score}%`);
  console.log(`Average new score: ${existingResults.summary.average_new_score}%`);
  console.log(`Average improvement: ${existingResults.summary.average_improvement > 0 ? '+' : ''}${existingResults.summary.average_improvement}%`);
  console.log(`\nResults saved to ${OUTPUT_FILE}`);
}

main().catch(console.error);
