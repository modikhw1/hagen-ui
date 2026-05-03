#!/usr/bin/env node
/**
 * Backfill video_analysis_examples with actual Gemini analysis
 * 
 * The learning system needs to know:
 * 1. What Gemini originally said (gemini_interpretation)
 * 2. What the human corrected it to (correct_interpretation)
 * 3. The explicit difference/delta
 * 
 * This script populates gemini_interpretation from the analyzed_videos.visual_analysis
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Extract key interpretation fields from Gemini analysis
function extractGeminiInterpretation(visualAnalysis) {
  if (!visualAnalysis) return null;
  
  const parts = [];
  
  // Content analysis
  if (visualAnalysis.content) {
    const c = visualAnalysis.content;
    if (c.humorType) parts.push(`Humor Type: ${c.humorType}`);
    if (c.humorMechanism) parts.push(`Humor Mechanism: ${c.humorMechanism}`);
    if (c.comedyTiming) parts.push(`Comedy Timing: ${c.comedyTiming}`);
    if (c.whyFunny) parts.push(`Why Funny: ${c.whyFunny}`);
    if (c.conceptCore) parts.push(`Concept: ${c.conceptCore}`);
    if (c.keyMessage) parts.push(`Key Message: ${c.keyMessage}`);
    if (c.emotionalTone) parts.push(`Emotional Tone: ${c.emotionalTone}`);
  }
  
  // Script/dialogue
  if (visualAnalysis.script) {
    const s = visualAnalysis.script;
    if (s.transcript) parts.push(`Transcript: ${s.transcript.slice(0, 200)}`);
    if (s.hooks?.opening) parts.push(`Opening Hook: ${s.hooks.opening}`);
  }
  
  // Visual elements
  if (visualAnalysis.visual) {
    const v = visualAnalysis.visual;
    if (v.punchlineDelivery) parts.push(`Punchline: ${v.punchlineDelivery}`);
  }
  
  // Summary
  if (visualAnalysis.summary) {
    parts.push(`Summary: ${visualAnalysis.summary}`);
  }
  
  return parts.length > 0 ? parts.join('\n') : null;
}

// Extract delta between Gemini interpretation and human correction
function extractLearningDelta(geminiInterpretation, correction) {
  if (!geminiInterpretation || !correction) return null;
  
  // Look for specific mismatches
  const delta = {
    pattern: null,
    geminiMissed: [],
    humanCorrected: []
  };
  
  // Check for humor type corrections
  const humorMatch = geminiInterpretation.match(/Humor Type:\s*([^\n]+)/i);
  if (humorMatch) {
    const geminiHumor = humorMatch[1].trim().toLowerCase();
    // Check if the correction mentions a different humor type
    const humorKeywords = ['subversion', 'absurdist', 'relatable', 'slapstick', 'wordplay', 'irony', 'deadpan'];
    for (const keyword of humorKeywords) {
      if (correction.toLowerCase().includes(keyword) && !geminiHumor.includes(keyword)) {
        delta.pattern = 'humor_type_mismatch';
        delta.geminiMissed.push(`Gemini said "${geminiHumor}" but human noted "${keyword}"`);
      }
    }
  }
  
  // Check for visual element corrections
  if (correction.toLowerCase().includes('visual') || 
      correction.toLowerCase().includes('expression') ||
      correction.toLowerCase().includes('physical')) {
    if (!geminiInterpretation.toLowerCase().includes('visual')) {
      delta.pattern = 'missed_visual_element';
      delta.geminiMissed.push('Visual elements not emphasized in Gemini analysis');
    }
  }
  
  // Check for cultural/generational context
  if (correction.toLowerCase().includes('millennial') ||
      correction.toLowerCase().includes('gen z') ||
      correction.toLowerCase().includes('cultural') ||
      correction.toLowerCase().includes('generational')) {
    delta.pattern = 'missed_cultural_context';
    delta.geminiMissed.push('Cultural/generational context needed');
  }
  
  return delta.pattern ? delta : null;
}

async function regenerateEmbedding(example) {
  // Build comprehensive text for embedding
  const parts = [
    example.video_summary,
    example.gemini_interpretation,
    example.correct_interpretation,
    example.explanation
  ].filter(Boolean);
  
  const text = parts.join('\n\n').slice(0, 8000);
  
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text
  });
  
  return response.data[0].embedding;
}

async function backfill() {
  console.log('🔄 Backfilling learning examples with Gemini analysis...\n');
  
  // Get examples that need backfilling
  const { data: examples, error } = await supabase
    .from('video_analysis_examples')
    .select(`
      id,
      video_id,
      gemini_interpretation,
      correct_interpretation,
      explanation,
      video_summary
    `)
    .or('gemini_interpretation.is.null,gemini_interpretation.eq.Original Gemini analysis');
  
  if (error) {
    console.error('Error fetching examples:', error.message);
    return;
  }
  
  console.log(`📊 Found ${examples?.length || 0} examples to backfill\n`);
  
  let updated = 0;
  let skipped = 0;
  
  for (const example of examples || []) {
    if (!example.video_id) {
      skipped++;
      continue;
    }
    
    // Get the original Gemini analysis from analyzed_videos
    const { data: video } = await supabase
      .from('analyzed_videos')
      .select('visual_analysis')
      .eq('id', example.video_id)
      .single();
    
    if (!video?.visual_analysis) {
      skipped++;
      continue;
    }
    
    const geminiInterpretation = extractGeminiInterpretation(video.visual_analysis);
    
    if (!geminiInterpretation) {
      skipped++;
      continue;
    }
    
    // Extract the learning delta
    const delta = extractLearningDelta(geminiInterpretation, example.correct_interpretation);
    
    // Update video_summary with better context
    const betterSummary = video.visual_analysis.content?.conceptCore ||
      video.visual_analysis.content?.keyMessage ||
      video.visual_analysis.summary ||
      example.video_summary;
    
    // Regenerate embedding with full context
    const embedding = await regenerateEmbedding({
      ...example,
      gemini_interpretation: geminiInterpretation,
      video_summary: betterSummary
    });
    
    // Update the example
    const { error: updateError } = await supabase
      .from('video_analysis_examples')
      .update({
        gemini_interpretation: geminiInterpretation,
        video_summary: betterSummary?.slice(0, 500),
        humor_type_correction: delta ? { 
          pattern: delta.pattern,
          geminiMissed: delta.geminiMissed,
          humanCorrected: delta.humanCorrected
        } : example.humor_type_correction,
        embedding: embedding
      })
      .eq('id', example.id);
    
    if (updateError) {
      console.log(`❌ Error updating ${example.id}:`, updateError.message);
    } else {
      console.log(`✅ Updated: ${betterSummary?.slice(0, 50)}...`);
      if (delta) {
        console.log(`   Pattern: ${delta.pattern}`);
      }
      updated++;
    }
    
    // Rate limiting
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log('\n📈 Backfill Summary:');
  console.log(`   ✅ Updated: ${updated}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
}

backfill().catch(console.error);
