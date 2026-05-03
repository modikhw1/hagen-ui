#!/usr/bin/env node
/**
 * Regenerate Learning Example Embeddings
 * 
 * Re-generates embeddings for all learning examples using the improved
 * embedding strategy that includes transcript, scenes, and richer context.
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000),  // Stay within token limits
    encoding_format: 'float'
  });
  return response.data[0].embedding;
}

function buildRichEmbeddingText(example) {
  const parts = [];
  
  // Priority: CONCEPT > MECHANISM > INTERPRETATION > TRANSCRIPT
  // This captures "what makes it funny" not just "what was said"
  
  // 1. Video summary - THE CONCEPT (most important)
  if (example.video_summary) {
    parts.push(`JOKE_CONCEPT: ${example.video_summary}`);
  }
  
  // 2. Gemini interpretation - HUMOR MECHANISM (how the joke works)
  if (example.gemini_interpretation && example.gemini_interpretation !== 'Original Gemini analysis') {
    parts.push(`HUMOR_MECHANISM: ${example.gemini_interpretation}`);
  }
  
  // 3. Human correction - THE INSIGHT
  if (example.correct_interpretation) {
    parts.push(`CORRECT_INTERPRETATION: ${example.correct_interpretation}`);
  }
  
  // 4. Humor pattern/type - CATEGORICAL
  if (example.humor_type_correction?.pattern) {
    parts.push(`HUMOR_PATTERN: ${example.humor_type_correction.pattern}`);
  }
  if (example.humor_types?.length) {
    parts.push(`HUMOR_TYPES: ${example.humor_types.join(', ')}`);
  }
  
  // 5. Explanation - WHY IT'S FUNNY
  if (example.explanation && example.explanation !== example.correct_interpretation) {
    parts.push(`EXPLANATION: ${example.explanation}`);
  }
  
  // 6. Human insight - WHAT AI MISSED
  if (example.humor_type_correction?.humanInsight) {
    parts.push(`INSIGHT: ${example.humor_type_correction.humanInsight}`);
  }
  if (example.humor_type_correction?.geminiMissed?.length) {
    parts.push(`MISSED_ELEMENTS: ${example.humor_type_correction.geminiMissed.join(', ')}`);
  }
  
  // 7. Visual elements - VISUAL PUNCHLINES
  if (example.visual_elements?.length) {
    parts.push(`VISUAL_ELEMENTS: ${example.visual_elements.join(', ')}`);
  }
  
  // 8. Cultural context
  if (example.cultural_context) {
    parts.push(`CULTURAL_CONTEXT: ${example.cultural_context}`);
  }
  
  // 9. Scene breakdown - NARRATIVE STRUCTURE (secondary)
  if (example.humor_type_correction?.scenes) {
    parts.push(`SCENES: ${example.humor_type_correction.scenes}`);
  }
  
  // 10. Transcript - LAST (exact words matter less than concept)
  if (example.humor_type_correction?.transcript) {
    const shortTranscript = example.humor_type_correction.transcript.slice(0, 300);
    parts.push(`TRANSCRIPT_EXCERPT: ${shortTranscript}`);
  }
  
  // 11. Tags
  if (example.tags?.length) {
    parts.push(`TAGS: ${example.tags.join(', ')}`);
  }
  
  return parts.join('\n');
}

async function regenerateEmbeddings() {
  console.log('🔄 Fetching all learning examples...');
  
  const { data: examples, error } = await supabase
    .from('video_analysis_examples')
    .select('*')
    .order('created_at', { ascending: true });
  
  if (error) {
    console.error('Failed to fetch examples:', error);
    process.exit(1);
  }
  
  console.log(`📊 Found ${examples.length} learning examples`);
  
  // Stats
  let updated = 0;
  let errors = 0;
  let withTranscript = 0;
  let withScenes = 0;
  
  for (let i = 0; i < examples.length; i++) {
    const ex = examples[i];
    const progress = `[${i + 1}/${examples.length}]`;
    
    try {
      // Build rich embedding text
      const embeddingText = buildRichEmbeddingText(ex);
      
      if (ex.humor_type_correction?.transcript) withTranscript++;
      if (ex.humor_type_correction?.scenes) withScenes++;
      
      // Generate new embedding
      const embedding = await generateEmbedding(embeddingText);
      
      // Update in database
      const { error: updateError } = await supabase
        .from('video_analysis_examples')
        .update({ embedding })
        .eq('id', ex.id);
      
      if (updateError) {
        console.error(`${progress} ❌ Failed to update ${ex.id}:`, updateError.message);
        errors++;
      } else {
        console.log(`${progress} ✅ Updated (${embeddingText.length} chars)`);
        updated++;
      }
      
      // Rate limit: 3000 RPM for OpenAI = 50/sec, be conservative
      await new Promise(r => setTimeout(r, 50));
      
    } catch (err) {
      console.error(`${progress} ❌ Error:`, err.message);
      errors++;
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════');
  console.log('   EMBEDDING REGENERATION COMPLETE');
  console.log('═══════════════════════════════════════════════════');
  console.log(`   ✅ Updated: ${updated}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log(`   📜 With transcript: ${withTranscript}`);
  console.log(`   🎬 With scenes: ${withScenes}`);
  console.log('═══════════════════════════════════════════════════');
}

regenerateEmbeddings();
