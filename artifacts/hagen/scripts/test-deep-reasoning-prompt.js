/**
 * Test: Show what the deep reasoning prompt looks like
 */

require('dotenv').config({ path: '.env.local' });

// Import the deep reasoning chain
const deepReasoningPath = '../src/lib/services/video/deep-reasoning.ts';

// Since this is TS, let's just read and show the constant
const fs = require('fs');
const content = fs.readFileSync('./src/lib/services/video/deep-reasoning.ts', 'utf8');

// Extract the DEEP_REASONING_CHAIN constant
const match = content.match(/export const DEEP_REASONING_CHAIN = `([\s\S]*?)`/);
if (match) {
  console.log('=== DEEP REASONING CHAIN (injected into every prompt) ===\n');
  console.log(match[1]);
  console.log('\n=== END DEEP REASONING CHAIN ===\n');
}

// Now test the learning context with a sample
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function testRetrieval() {
  // Test with a sample video context
  const testContext = `Restaurant skit where employees estimate how many items they'll serve. Different roles give different numbers. The last person breaks the pattern.`;
  
  console.log('=== TESTING RETRIEVAL ===');
  console.log('Query:', testContext);
  
  // Generate embedding
  const embResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: testContext,
    dimensions: 1536,
  });
  const embedding = embResponse.data[0].embedding;
  
  // Find similar examples
  const { data: examples, error } = await supabase.rpc('find_video_analysis_examples', {
    query_embedding: embedding,
    match_threshold: 0.4,
    match_count: 3
  });
  
  if (error) {
    console.error('Error:', error.message);
    return;
  }
  
  console.log(`\nFound ${examples?.length || 0} similar examples:\n`);
  
  for (const ex of examples || []) {
    console.log(`--- Similarity: ${(ex.similarity * 100).toFixed(1)}% ---`);
    console.log('Video Summary:', ex.video_summary.slice(0, 100) + '...');
    console.log('Tags:', ex.tags?.join(', ') || 'none');
    console.log('Has Deep Reasoning:', ex.humor_type_correction?.deep_reasoning ? 'YES' : 'no');
    console.log('');
  }
}

testRetrieval().catch(console.error);
