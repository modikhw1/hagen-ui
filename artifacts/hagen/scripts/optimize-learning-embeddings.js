#!/usr/bin/env node
/**
 * Optimize learning example embeddings using human corrections
 * 
 * Since we can't easily re-analyze 108 videos with Gemini (no stored Gemini File URIs),
 * we optimize what we DO have - the human corrections.
 * 
 * This script:
 * 1. Regenerates embeddings focused on the HUMAN CORRECTION content
 * 2. Extracts patterns from human corrections (keywords, humor types)
 * 3. Groups similar corrections for pattern learning
 * 4. Creates better video summaries from the correction text
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Extract patterns from human correction text
function extractPatterns(correction) {
  const text = (correction || '').toLowerCase();
  const patterns = {
    humorTypes: [],
    themes: [],
    keywords: [],
    quality: null
  };
  
  // Quality indicators
  if (text.includes('[good]') || text.includes('good') && text.includes('replicable')) {
    patterns.quality = 'good';
  } else if (text.includes('[mediocre]') || text.includes('[average]')) {
    patterns.quality = 'mediocre';
  } else if (text.includes('[bad]') || text.includes('[poor]')) {
    patterns.quality = 'bad';
  }
  
  // Humor types mentioned
  const humorKeywords = {
    'visual': 'visual-reveal',
    'expression': 'visual-reveal',
    'facial': 'visual-reveal',
    'physical': 'physical-comedy',
    'slapstick': 'physical-comedy',
    'wordplay': 'wordplay',
    'literal': 'wordplay',
    'double meaning': 'wordplay',
    'pun': 'wordplay',
    'subvert': 'subversion',
    'expect': 'subversion',
    'twist': 'subversion',
    'relatable': 'relatable',
    'observational': 'observational',
    'absurd': 'absurdist',
    'deadpan': 'deadpan',
    'edit': 'edit-punchline',
    'cut': 'edit-punchline',
    'timing': 'comedy-timing',
    'pause': 'comedy-timing'
  };
  
  for (const [keyword, humorType] of Object.entries(humorKeywords)) {
    if (text.includes(keyword) && !patterns.humorTypes.includes(humorType)) {
      patterns.humorTypes.push(humorType);
    }
  }
  
  // Themes
  const themeKeywords = {
    'customer': 'customer-service',
    'barista': 'cafe',
    'coffee': 'cafe',
    'bartender': 'bar',
    'waiter': 'restaurant',
    'server': 'restaurant',
    'kitchen': 'restaurant',
    'staff': 'workplace',
    'employee': 'workplace',
    'manager': 'workplace',
    'gen z': 'generational',
    'millennial': 'generational',
    'boomer': 'generational',
    'cultural': 'cultural',
    'tiktok': 'internet-culture'
  };
  
  for (const [keyword, theme] of Object.entries(themeKeywords)) {
    if (text.includes(keyword) && !patterns.themes.includes(theme)) {
      patterns.themes.push(theme);
    }
  }
  
  // Extract key insight (first meaningful sentence)
  const sentences = correction?.split(/[.!?]+/).filter(s => s.trim().length > 30);
  if (sentences?.length > 0) {
    patterns.keyInsight = sentences[0].trim();
  }
  
  return patterns;
}

// Build a better video summary from correction text
function buildSummaryFromCorrection(correction) {
  const text = correction || '';
  
  // Remove quality markers
  let cleaned = text
    .replace(/\[(GOOD|MEDIOCRE|BAD|AVERAGE|POOR)\]/gi, '')
    .trim();
  
  // Get first 2-3 sentences that describe the video
  const sentences = cleaned.split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 20 && s.length < 200);
  
  if (sentences.length > 0) {
    return sentences.slice(0, 2).join('. ') + '.';
  }
  
  return cleaned.slice(0, 200);
}

async function generateEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000)
  });
  return response.data[0].embedding;
}

async function optimize() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('   OPTIMIZING LEARNING EMBEDDINGS FROM HUMAN CORRECTIONS');
  console.log('═══════════════════════════════════════════════════════════════════\n');
  
  // Get all learning examples
  const { data: examples, error } = await supabase
    .from('video_analysis_examples')
    .select('id, video_summary, correct_interpretation, explanation, example_type, humor_types, tags');
  
  if (error) {
    console.error('Error:', error.message);
    return;
  }
  
  console.log(`📊 Processing ${examples?.length || 0} learning examples\n`);
  
  let updated = 0;
  let errors = 0;
  
  for (const example of examples || []) {
    try {
      const correction = example.correct_interpretation || example.explanation;
      const patterns = extractPatterns(correction);
      
      // Build optimized embedding text
      // Focus on: what the video is about + the human insight + humor patterns
      const embeddingParts = [
        // Summary/concept
        buildSummaryFromCorrection(correction),
        // The full correction (human knowledge)
        correction,
        // Extracted patterns as keywords
        patterns.humorTypes.join(' '),
        patterns.themes.join(' ')
      ].filter(Boolean);
      
      const embeddingText = embeddingParts.join('\n\n');
      
      // Generate new embedding
      const embedding = await generateEmbedding(embeddingText);
      
      // Better video summary
      const betterSummary = buildSummaryFromCorrection(correction);
      
      // Merge humor types
      const allHumorTypes = [...new Set([
        ...(example.humor_types || []),
        ...patterns.humorTypes
      ])];
      
      // Merge tags
      const allTags = [...new Set([
        ...(example.tags || []),
        ...patterns.themes
      ])];
      
      // Update
      const { error: updateError } = await supabase
        .from('video_analysis_examples')
        .update({
          video_summary: example.video_summary?.startsWith('Video ') 
            ? betterSummary.slice(0, 500) 
            : example.video_summary,
          humor_types: allHumorTypes,
          tags: allTags,
          embedding: embedding,
          quality_score: patterns.quality === 'good' ? 0.95 
            : patterns.quality === 'mediocre' ? 0.7 
            : patterns.quality === 'bad' ? 0.4 
            : 0.8
        })
        .eq('id', example.id);
      
      if (updateError) {
        errors++;
      } else {
        updated++;
        if (patterns.humorTypes.length > 0) {
          console.log(`✅ ${betterSummary.slice(0, 40)}... [${patterns.humorTypes.join(', ')}]`);
        }
      }
      
      // Rate limiting
      await new Promise(r => setTimeout(r, 50));
      
    } catch (err) {
      errors++;
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(`   ✅ Updated: ${updated}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log('═══════════════════════════════════════════════════════════════════\n');
  
  // Show pattern distribution
  const { data: stats } = await supabase
    .from('video_analysis_examples')
    .select('humor_types, tags');
  
  const humorCounts = {};
  const tagCounts = {};
  
  for (const s of stats || []) {
    for (const h of s.humor_types || []) {
      humorCounts[h] = (humorCounts[h] || 0) + 1;
    }
    for (const t of s.tags || []) {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    }
  }
  
  console.log('📊 Humor Type Distribution:');
  Object.entries(humorCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => console.log(`   ${type}: ${count}`));
  
  console.log('\n📊 Theme Distribution:');
  Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([tag, count]) => console.log(`   ${tag}: ${count}`));
}

optimize().catch(console.error);
