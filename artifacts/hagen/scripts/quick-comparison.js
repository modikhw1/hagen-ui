/**
 * Quick batch comparison - run 30 examples for statistical significance
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const DEEP_REASONING_CHAIN = `
DEEP REASONING CHAIN - REQUIRED BEFORE ANY HUMOR CLASSIFICATION

Before assigning ANY humor type, work through these IN ORDER:

1. CHARACTER DYNAMIC - What power structure exists between people?
2. UNDERLYING EXPECTATION - What does audience expect based on format/setup?
3. THE VIOLATION - What rule/norm is being broken, and by whom?
4. FORMAT PARTICIPATION - How does the video structure contribute to comedy?
5. EDITING AS COMEDY - What does the editing communicate?
6. THE REAL MECHANISM - What ACTUALLY explains why this is funny?

ONLY AFTER completing 1-6 should you assign humorType and humorMechanism.
`;

function buildPrompt(example) {
  return `${DEEP_REASONING_CHAIN}

VIDEO: ${example.video_summary || 'No summary'}
${example.transcript ? `TRANSCRIPT: ${example.transcript.substring(0, 500)}` : ''}

Respond with JSON:
{
  "deep_reasoning": {
    "character_dynamic": "...",
    "the_violation": "...", 
    "the_real_mechanism": "..."
  },
  "humorType": "...",
  "humorMechanism": "..."
}`;
}

async function getEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 1536
  });
  return response.data[0].embedding;
}

function cosineSimilarity(a, b) {
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function buildHumanText(example) {
  const parts = [];
  if (example.correct_interpretation) parts.push(example.correct_interpretation);
  if (example.explanation) parts.push(example.explanation);
  const htc = example.humor_type_correction;
  if (htc?.deep_reasoning?.character_dynamic) parts.push(htc.deep_reasoning.character_dynamic);
  if (htc?.humanInsight) parts.push(htc.humanInsight);
  if (htc?.correct) parts.push(`Humor type: ${htc.correct}`);
  return parts.join('\n');
}

async function main() {
  console.log('=== QUICK BATCH COMPARISON (30 samples) ===\n');
  
  const { data: examples } = await supabase
    .from('video_analysis_examples')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30);
  
  console.log(`Processing ${examples.length} examples...\n`);
  
  const results = [];
  
  for (let i = 0; i < examples.length; i++) {
    const example = examples[i];
    const oldScore = example.humor_type_correction?.understanding_score;
    
    try {
      // Re-analyze with deep reasoning
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.0-flash-exp',
        generationConfig: { temperature: 0.3, responseMimeType: 'application/json' }
      });
      
      const result = await model.generateContent(buildPrompt(example));
      const newAnalysis = JSON.parse(result.response.text());
      
      // Build new analysis text
      const parts = [];
      if (newAnalysis.deep_reasoning) {
        Object.values(newAnalysis.deep_reasoning).forEach(v => v && parts.push(v));
      }
      if (newAnalysis.humorMechanism) parts.push(newAnalysis.humorMechanism);
      const newText = parts.join('\n');
      const humanText = buildHumanText(example);
      
      const [newEmbed, humanEmbed] = await Promise.all([
        getEmbedding(newText),
        getEmbedding(humanText)
      ]);
      
      const newScore = Math.round(cosineSimilarity(newEmbed, humanEmbed) * 100);
      const delta = oldScore ? newScore - oldScore : null;
      
      results.push({ oldScore, newScore, delta });
      
      console.log(`[${i+1}/30] Old: ${oldScore || 'N/A'}% → New: ${newScore}% (${delta !== null ? (delta > 0 ? '+' : '') + delta : 'N/A'}%)`);
      
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.log(`[${i+1}/30] Error: ${err.message}`);
    }
  }
  
  // Stats
  const withBoth = results.filter(r => r.delta !== null);
  const improved = withBoth.filter(r => r.delta > 0);
  const avgOld = withBoth.reduce((a, r) => a + r.oldScore, 0) / withBoth.length;
  const avgNew = withBoth.reduce((a, r) => a + r.newScore, 0) / withBoth.length;
  const avgDelta = withBoth.reduce((a, r) => a + r.delta, 0) / withBoth.length;
  
  console.log('\n=== RESULTS ===');
  console.log(`Samples with both scores: ${withBoth.length}`);
  console.log(`Improved: ${improved.length} (${Math.round(improved.length/withBoth.length*100)}%)`);
  console.log(`\nBEFORE (baseline): ${avgOld.toFixed(1)}% average`);
  console.log(`AFTER (deep reasoning): ${avgNew.toFixed(1)}% average`);
  console.log(`IMPROVEMENT: ${avgDelta > 0 ? '+' : ''}${avgDelta.toFixed(1)}%`);
}

main().catch(console.error);
