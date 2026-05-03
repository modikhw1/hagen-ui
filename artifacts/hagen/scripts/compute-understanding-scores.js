/**
 * Understanding Likeness Scorer
 * 
 * Compares Gemini's analysis to human-verified corrections using semantic similarity.
 * This measures how well Gemini "understood" the humor/content relative to human judgment.
 * 
 * Metric: understanding_score (0-100)
 *   - 100 = Gemini's analysis perfectly matches human understanding
 *   - 0 = Completely different interpretations
 * 
 * Stores scores in:
 *   1. humor_type_correction.understanding_score (JSONB field)
 *   2. datasets/understanding_scores.json (local file for analysis)
 * 
 * Usage:
 *   node scripts/compute-understanding-scores.js           # Compute for all examples
 *   node scripts/compute-understanding-scores.js --stats   # Show statistics only
 *   node scripts/compute-understanding-scores.js --force   # Recompute all
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const OUTPUT_FILE = path.join(__dirname, '..', 'datasets', 'understanding_scores.json');

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
 * Build comparison text from Gemini's interpretation
 */
function buildGeminiText(example) {
  const parts = [];
  
  if (example.gemini_interpretation) {
    parts.push(example.gemini_interpretation);
  }
  
  // If there's a humor type in the correction, include the original
  if (example.humor_type_correction?.original) {
    parts.push(`Humor type: ${example.humor_type_correction.original}`);
  }
  
  return parts.join('\n');
}

/**
 * Build comparison text from human correction
 */
function buildHumanText(example) {
  const parts = [];
  
  if (example.correct_interpretation) {
    parts.push(example.correct_interpretation);
  }
  
  if (example.explanation) {
    parts.push(example.explanation);
  }
  
  // Include deep reasoning if available
  if (example.humor_type_correction?.deep_reasoning) {
    const dr = example.humor_type_correction.deep_reasoning;
    if (dr.character_dynamic) parts.push(`Character dynamic: ${dr.character_dynamic}`);
    if (dr.underlying_tension) parts.push(`Underlying tension: ${dr.underlying_tension}`);
    if (dr.format_participation) parts.push(`Format: ${dr.format_participation}`);
    if (dr.editing_contribution) parts.push(`Editing: ${dr.editing_contribution}`);
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
 * Compute understanding score for a single example
 */
async function computeScore(example) {
  const geminiText = buildGeminiText(example);
  const humanText = buildHumanText(example);
  
  if (!geminiText || !humanText) {
    return null;
  }
  
  // Get embeddings
  const [geminiEmbed, humanEmbed] = await Promise.all([
    getEmbedding(geminiText),
    getEmbedding(humanText)
  ]);
  
  // Compute similarity
  const similarity = cosineSimilarity(geminiEmbed, humanEmbed);
  
  // Convert to 0-100 score (similarity is -1 to 1, but usually 0-1 for similar content)
  const score = Math.round(similarity * 100);
  
  return {
    score,
    geminiTextLength: geminiText.length,
    humanTextLength: humanText.length,
    geminiPreview: geminiText.substring(0, 100),
    humanPreview: humanText.substring(0, 100)
  };
}

/**
 * Main function
 */
async function main() {
  const showStatsOnly = process.argv.includes('--stats');
  const forceRecompute = process.argv.includes('--force');
  
  console.log('=== UNDERSTANDING LIKENESS SCORER ===\n');
  
  // Load existing scores from file if exists
  let existingScores = {};
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      existingScores = data.scores || {};
      console.log(`Loaded ${Object.keys(existingScores).length} existing scores from file\n`);
    } catch (e) {
      console.log('No existing scores file or invalid format\n');
    }
  }
  
  // Fetch all learning examples
  const { data: examples, error } = await supabase
    .from('video_analysis_examples')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching examples:', error);
    return;
  }
  
  console.log(`Found ${examples.length} learning examples\n`);
  
  // Check for existing scores (from file or JSONB)
  const hasScore = (e) => {
    if (existingScores[e.id]) return true;
    if (e.humor_type_correction?.understanding_score !== undefined) return true;
    return false;
  };
  
  const withScores = examples.filter(hasScore);
  const needScoring = forceRecompute ? examples : examples.filter(e => !hasScore(e));
  
  console.log(`Already scored: ${withScores.length}`);
  console.log(`Need scoring: ${needScoring.length}\n`);
  
  if (showStatsOnly) {
    // Gather all scores from file and JSONB
    const allScores = examples.map(e => {
      if (existingScores[e.id]) return existingScores[e.id].score;
      if (e.humor_type_correction?.understanding_score) return e.humor_type_correction.understanding_score;
      return null;
    }).filter(s => s !== null);
    
    if (allScores.length > 0) {
      showStatistics(allScores);
    } else {
      console.log('No scores computed yet. Run without --stats first.');
    }
    return;
  }
  
  if (needScoring.length === 0) {
    console.log('All examples already scored! Use --force to recompute.');
    return;
  }
  
  // Process examples
  console.log('Computing understanding scores...\n');
  
  let processed = 0;
  let errors = 0;
  const allResults = { ...existingScores };
  
  for (const example of needScoring) {
    try {
      const result = await computeScore(example);
      
      if (result) {
        // Store in JSONB field
        const updatedCorrection = {
          ...(example.humor_type_correction || {}),
          understanding_score: result.score,
          score_computed_at: new Date().toISOString()
        };
        
        const { error: updateError } = await supabase
          .from('video_analysis_examples')
          .update({ humor_type_correction: updatedCorrection })
          .eq('id', example.id);
        
        if (updateError) {
          console.error(`Error updating ${example.id}:`, updateError.message);
          errors++;
        } else {
          processed++;
          
          // Store for file output
          allResults[example.id] = {
            score: result.score,
            video_summary: example.video_summary,
            gemini_original: example.gemini_interpretation?.substring(0, 200),
            computed_at: new Date().toISOString()
          };
          
          const preview = example.video_summary?.substring(0, 50) || 'No summary';
          console.log(`[${processed}/${needScoring.length}] ${result.score}% - ${preview}...`);
        }
      }
    } catch (err) {
      console.error(`Error processing ${example.id}:`, err.message);
      errors++;
    }
    
    // Rate limiting for OpenAI API
    await new Promise(r => setTimeout(r, 100));
  }
  
  // Save all scores to file
  const scores = Object.values(allResults).map(r => r.score);
  const outputData = {
    computed_at: new Date().toISOString(),
    total_examples: examples.length,
    scored_count: Object.keys(allResults).length,
    statistics: scores.length > 0 ? {
      average: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10,
      median: [...scores].sort((a, b) => a - b)[Math.floor(scores.length / 2)],
      min: Math.min(...scores),
      max: Math.max(...scores)
    } : null,
    scores: allResults
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2));
  console.log(`\nSaved scores to ${OUTPUT_FILE}`);
  
  console.log('\n=== RESULTS ===');
  console.log(`Processed: ${processed}`);
  console.log(`Errors: ${errors}`);
  
  if (scores.length > 0) {
    showStatistics(scores);
  }
}

function showStatistics(scores) {
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const sorted = [...scores].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  
  console.log('=== UNDERSTANDING STATISTICS ===');
  console.log(`Total scored: ${scores.length}`);
  console.log(`Average understanding: ${avg.toFixed(1)}%`);
  console.log(`Median: ${median}%`);
  console.log(`Range: ${min}% - ${max}%`);
  console.log(`\nDistribution:`);
  console.log(`  < 50%: ${scores.filter(s => s < 50).length} (poor)`);
  console.log(`  50-65%: ${scores.filter(s => s >= 50 && s < 65).length} (below average)`);
  console.log(`  65-75%: ${scores.filter(s => s >= 65 && s < 75).length} (average)`);
  console.log(`  75-85%: ${scores.filter(s => s >= 75 && s < 85).length} (good)`);
  console.log(`  > 85%: ${scores.filter(s => s >= 85).length} (excellent)`);
}

main().catch(console.error);
