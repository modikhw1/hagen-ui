#!/usr/bin/env node
/**
 * Re-analyze videos that have corrections but missing Gemini interpretations
 * 
 * This script:
 * 1. Finds learning examples missing the original Gemini analysis
 * 2. Re-analyzes each video to capture the full interpretation
 * 3. Updates the learning example with:
 *    - Full Gemini interpretation (humor, scenes, script)
 *    - Scene breakdown
 *    - Transcript
 *    - Regenerated embedding including all context
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Extract comprehensive Gemini interpretation from visual_analysis
function extractFullGeminiContext(visualAnalysis) {
  if (!visualAnalysis) return null;
  
  const context = {
    interpretation: [],
    scenes: [],
    script: null,
    transcript: null
  };
  
  // 1. Core interpretation
  if (visualAnalysis.content) {
    const c = visualAnalysis.content;
    if (c.humorType) context.interpretation.push(`Humor Type: ${c.humorType}`);
    if (c.humorMechanism) context.interpretation.push(`Humor Mechanism: ${c.humorMechanism}`);
    if (c.comedyTiming) context.interpretation.push(`Comedy Timing: ${c.comedyTiming}`);
    if (c.whyFunny) context.interpretation.push(`Why Funny: ${c.whyFunny}`);
    if (c.conceptCore) context.interpretation.push(`Concept: ${c.conceptCore}`);
    if (c.keyMessage) context.interpretation.push(`Key Message: ${c.keyMessage}`);
    if (c.emotionalTone) context.interpretation.push(`Emotional Tone: ${c.emotionalTone}`);
    if (c.format) context.interpretation.push(`Format: ${c.format}`);
  }
  
  // 2. Script analysis
  if (visualAnalysis.script) {
    const s = visualAnalysis.script;
    context.script = {
      transcript: s.transcript || null,
      hooks: s.hooks || null,
      humor: s.humor || null,
      structure: s.structure || null
    };
    context.transcript = s.transcript;
    
    if (s.humor?.humorType) context.interpretation.push(`Script Humor Type: ${s.humor.humorType}`);
    if (s.humor?.punchlineDelivery) context.interpretation.push(`Punchline: ${s.humor.punchlineDelivery}`);
    if (s.hooks?.opening) context.interpretation.push(`Opening Hook: ${s.hooks.opening}`);
  }
  
  // 3. Scene breakdown
  if (visualAnalysis.scenes && Array.isArray(visualAnalysis.scenes)) {
    context.scenes = visualAnalysis.scenes.map((scene, i) => ({
      number: i + 1,
      description: scene.description || scene.summary,
      action: scene.action,
      dialogue: scene.dialogue,
      timing: scene.timestamp || scene.timing
    }));
  }
  
  // 4. Visual elements
  if (visualAnalysis.visual) {
    const v = visualAnalysis.visual;
    if (v.punchlineDelivery) context.interpretation.push(`Visual Punchline: ${v.punchlineDelivery}`);
    if (v.keyMoments) context.interpretation.push(`Key Moments: ${JSON.stringify(v.keyMoments)}`);
  }
  
  // 5. Summary
  if (visualAnalysis.summary) {
    context.interpretation.push(`Summary: ${visualAnalysis.summary}`);
  }
  
  return context;
}

// Build comprehensive text for embedding that captures the full video model
function buildEmbeddingText(example, geminiContext) {
  const parts = [];
  
  // Video summary/concept
  parts.push(`VIDEO: ${example.video_summary || 'Unknown video'}`);
  
  // Full transcript for semantic matching
  if (geminiContext?.transcript) {
    parts.push(`\nTRANSCRIPT:\n${geminiContext.transcript}`);
  }
  
  // Scene breakdown
  if (geminiContext?.scenes?.length > 0) {
    parts.push('\nSCENES:');
    for (const scene of geminiContext.scenes) {
      parts.push(`  Scene ${scene.number}: ${scene.description || scene.action}`);
    }
  }
  
  // Gemini's interpretation
  if (geminiContext?.interpretation?.length > 0) {
    parts.push('\nAI INTERPRETATION:');
    parts.push(geminiContext.interpretation.join('\n'));
  }
  
  // Human correction (this is key for learning)
  if (example.correct_interpretation) {
    parts.push('\nHUMAN CORRECTION:');
    parts.push(example.correct_interpretation);
  }
  
  // Explanation of what was missed
  if (example.explanation && example.explanation !== example.correct_interpretation) {
    parts.push('\nWHY THE CORRECTION:');
    parts.push(example.explanation);
  }
  
  return parts.join('\n').slice(0, 8000);
}

// Analyze the delta between AI and human interpretation
function analyzeInterpretationDelta(geminiContext, humanCorrection) {
  const delta = {
    pattern: null,
    geminiMissed: [],
    humanInsight: null
  };
  
  const correctionLower = (humanCorrection || '').toLowerCase();
  const geminiText = (geminiContext?.interpretation || []).join(' ').toLowerCase();
  
  // Detect pattern: Visual elements missed
  if (correctionLower.includes('visual') || 
      correctionLower.includes('expression') ||
      correctionLower.includes('physical') ||
      correctionLower.includes('face') ||
      correctionLower.includes('reaction')) {
    if (!geminiText.includes('visual') && !geminiText.includes('expression')) {
      delta.pattern = 'missed_visual_element';
      delta.geminiMissed.push('Visual comedy elements not emphasized');
    }
  }
  
  // Detect pattern: Cultural/generational context
  if (correctionLower.includes('millennial') ||
      correctionLower.includes('gen z') ||
      correctionLower.includes('cultural') ||
      correctionLower.includes('generational') ||
      correctionLower.includes('tiktok') ||
      correctionLower.includes('trend')) {
    delta.pattern = 'missed_cultural_context';
    delta.geminiMissed.push('Cultural or generational context needed');
  }
  
  // Detect pattern: Edit/cut is the punchline
  if (correctionLower.includes('cut') ||
      correctionLower.includes('edit') ||
      correctionLower.includes('timing') ||
      correctionLower.includes('pause')) {
    if (!geminiText.includes('cut') && !geminiText.includes('edit')) {
      delta.pattern = 'edit_punchline';
      delta.geminiMissed.push('The edit/cut timing IS the punchline');
    }
  }
  
  // Detect pattern: Subversion misidentified
  if (geminiText.includes('subversion') && 
      (correctionLower.includes('relatable') || correctionLower.includes('observational'))) {
    delta.pattern = 'humor_type_mismatch';
    delta.geminiMissed.push('Called "subversion" but actually relatable/observational humor');
  }
  
  // Detect pattern: Wordplay/literal interpretation
  if (correctionLower.includes('literal') ||
      correctionLower.includes('wordplay') ||
      correctionLower.includes('double meaning')) {
    delta.pattern = 'missed_wordplay';
    delta.geminiMissed.push('Literal interpretation or wordplay humor');
  }
  
  // Extract the key human insight
  const sentences = humanCorrection?.split(/[.!?]+/).filter(s => s.trim().length > 20);
  if (sentences?.length > 0) {
    delta.humanInsight = sentences[0].trim();
  }
  
  return delta;
}

async function generateEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000)
  });
  return response.data[0].embedding;
}

async function reanalyze() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('   RE-ANALYZING VIDEOS FOR COMPLETE LEARNING CONTEXT');
  console.log('═══════════════════════════════════════════════════════════════════\n');
  
  // Find examples that need Gemini interpretation
  const { data: examples, error } = await supabase
    .from('video_analysis_examples')
    .select(`
      id,
      video_id,
      video_url,
      video_summary,
      gemini_interpretation,
      correct_interpretation,
      explanation,
      example_type
    `)
    .or('gemini_interpretation.is.null,gemini_interpretation.eq.Original Gemini analysis');
  
  if (error) {
    console.error('Error fetching examples:', error.message);
    return;
  }
  
  console.log(`📊 Found ${examples?.length || 0} examples needing Gemini context\n`);
  
  // Group by whether they have video_id or just video_url
  const withVideoId = examples?.filter(e => e.video_id) || [];
  const withUrlOnly = examples?.filter(e => !e.video_id && e.video_url) || [];
  
  console.log(`   - With video_id: ${withVideoId.length}`);
  console.log(`   - With URL only: ${withUrlOnly.length}`);
  console.log(`   - Without reference: ${(examples?.length || 0) - withVideoId.length - withUrlOnly.length}\n`);
  
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  
  // Process examples with video_id first (can get analysis directly)
  console.log('🔄 Processing examples with video_id...\n');
  
  for (const example of withVideoId) {
    try {
      // Get the analyzed video with visual_analysis
      const { data: video } = await supabase
        .from('analyzed_videos')
        .select('id, video_url, visual_analysis, metadata')
        .eq('id', example.video_id)
        .single();
      
      if (!video?.visual_analysis) {
        console.log(`⏭️  No analysis for ${example.video_id}`);
        skipped++;
        continue;
      }
      
      // Extract full context
      const geminiContext = extractFullGeminiContext(video.visual_analysis);
      
      if (!geminiContext || geminiContext.interpretation.length === 0) {
        console.log(`⏭️  Empty analysis for ${example.video_id}`);
        skipped++;
        continue;
      }
      
      // Analyze the delta
      const delta = analyzeInterpretationDelta(geminiContext, example.correct_interpretation);
      
      // Build better video summary
      const betterSummary = video.visual_analysis.content?.conceptCore ||
        video.visual_analysis.content?.keyMessage ||
        video.visual_analysis.summary ||
        video.metadata?.title ||
        example.video_summary;
      
      // Build comprehensive embedding text
      const embeddingText = buildEmbeddingText(
        { ...example, video_summary: betterSummary },
        geminiContext
      );
      
      // Generate new embedding
      const embedding = await generateEmbedding(embeddingText);
      
      // Format scenes for storage
      const scenesText = geminiContext.scenes?.length > 0
        ? geminiContext.scenes.map(s => `Scene ${s.number}: ${s.description || s.action}`).join('\n')
        : null;
      
      // Update the example
      const { error: updateError } = await supabase
        .from('video_analysis_examples')
        .update({
          video_summary: betterSummary?.slice(0, 500),
          gemini_interpretation: geminiContext.interpretation.join('\n'),
          humor_type_correction: {
            pattern: delta.pattern,
            geminiMissed: delta.geminiMissed,
            humanInsight: delta.humanInsight,
            scenes: scenesText?.slice(0, 1000),
            transcript: geminiContext.transcript?.slice(0, 2000)
          },
          embedding: embedding,
          quality_score: 0.9 // Higher quality now with full context
        })
        .eq('id', example.id);
      
      if (updateError) {
        console.log(`❌ Error updating ${example.id}:`, updateError.message);
        errors++;
      } else {
        console.log(`✅ Updated: ${betterSummary?.slice(0, 50)}...`);
        if (delta.pattern) {
          console.log(`   🎯 Pattern: ${delta.pattern}`);
        }
        if (geminiContext.transcript) {
          console.log(`   📜 Has transcript (${geminiContext.transcript.length} chars)`);
        }
        updated++;
      }
      
      // Rate limiting
      await new Promise(r => setTimeout(r, 150));
      
    } catch (err) {
      console.log(`❌ Error processing ${example.id}:`, err.message);
      errors++;
    }
  }
  
  // Process examples with URL only (need to find matching analyzed_video)
  console.log('\n🔄 Processing examples with URL only...\n');
  
  for (const example of withUrlOnly) {
    try {
      // Find the analyzed video by URL
      const { data: video } = await supabase
        .from('analyzed_videos')
        .select('id, video_url, visual_analysis, metadata')
        .eq('video_url', example.video_url)
        .single();
      
      if (!video?.visual_analysis) {
        skipped++;
        continue;
      }
      
      // Extract full context
      const geminiContext = extractFullGeminiContext(video.visual_analysis);
      
      if (!geminiContext || geminiContext.interpretation.length === 0) {
        skipped++;
        continue;
      }
      
      // Analyze the delta
      const delta = analyzeInterpretationDelta(geminiContext, example.correct_interpretation);
      
      // Build better video summary
      const betterSummary = video.visual_analysis.content?.conceptCore ||
        video.visual_analysis.content?.keyMessage ||
        video.visual_analysis.summary ||
        example.video_summary;
      
      // Build comprehensive embedding text
      const embeddingText = buildEmbeddingText(
        { ...example, video_summary: betterSummary },
        geminiContext
      );
      
      // Generate new embedding
      const embedding = await generateEmbedding(embeddingText);
      
      // Format scenes for storage
      const scenesText = geminiContext.scenes?.length > 0
        ? geminiContext.scenes.map(s => `Scene ${s.number}: ${s.description || s.action}`).join('\n')
        : null;
      
      // Update the example with video_id link
      const { error: updateError } = await supabase
        .from('video_analysis_examples')
        .update({
          video_id: video.id, // Link it now
          video_summary: betterSummary?.slice(0, 500),
          gemini_interpretation: geminiContext.interpretation.join('\n'),
          humor_type_correction: {
            pattern: delta.pattern,
            geminiMissed: delta.geminiMissed,
            humanInsight: delta.humanInsight,
            scenes: scenesText?.slice(0, 1000),
            transcript: geminiContext.transcript?.slice(0, 2000)
          },
          embedding: embedding,
          quality_score: 0.9
        })
        .eq('id', example.id);
      
      if (updateError) {
        errors++;
      } else {
        console.log(`✅ Updated (linked): ${betterSummary?.slice(0, 50)}...`);
        updated++;
      }
      
      await new Promise(r => setTimeout(r, 150));
      
    } catch (err) {
      errors++;
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('   RE-ANALYSIS COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`   ✅ Updated: ${updated}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Errors:  ${errors}`);
  console.log('═══════════════════════════════════════════════════════════════════\n');
}

reanalyze().catch(console.error);
