#!/usr/bin/env node
/**
 * Migrate video_signals.notes to video_analysis_examples
 * 
 * Parses [Analysis Notes:] and similar sections from video_signals.notes
 * and creates learning examples with embeddings for the RAG system.
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Parse notes sections from video_signals.notes
function parseNotes(notesText) {
  if (!notesText) return null;
  
  const sections = {};
  
  // Match [Section Name:] patterns
  const sectionRegex = /\[([\w\s]+):\]\s*([\s\S]*?)(?=\[[\w\s]+:\]|$)/g;
  let match;
  
  while ((match = sectionRegex.exec(notesText)) !== null) {
    const sectionName = match[1].trim().toLowerCase();
    const content = match[2].trim();
    if (content) {
      sections[sectionName] = content;
    }
  }
  
  // Also check for notes without section headers (plain text corrections)
  if (Object.keys(sections).length === 0 && notesText.trim().length > 20) {
    sections['general'] = notesText.trim();
  }
  
  return Object.keys(sections).length > 0 ? sections : null;
}

// Determine example type from parsed sections
function determineExampleType(sections) {
  if (sections['analysis notes'] || sections['humor notes']) {
    return 'humor_interpretation';
  }
  if (sections['replicability notes']) {
    return 'replicability';
  }
  if (sections['cultural notes'] || sections['context notes']) {
    return 'cultural_context';
  }
  if (sections['visual notes']) {
    return 'visual_punchline';
  }
  return 'humor_interpretation'; // Default
}

// Build explanation text from all sections
function buildExplanation(sections) {
  const parts = [];
  
  for (const [key, value] of Object.entries(sections)) {
    if (value) {
      const sectionTitle = key.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      parts.push(`${sectionTitle}: ${value}`);
    }
  }
  
  return parts.join('\n\n');
}

// Generate embedding for text
async function generateEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000) // Limit input length
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('Embedding error:', error.message);
    return null;
  }
}

// Extract tags from video signals (from extracted JSONB)
function extractTags(signal) {
  const tags = [];
  const extracted = signal.extracted || {};
  
  if (extracted.industry) tags.push(extracted.industry);
  if (extracted.contentFormat) tags.push(extracted.contentFormat);
  if (extracted.humorTypes?.length > 0) {
    extracted.humorTypes.forEach(h => tags.push(h));
  }
  if (extracted.humor?.type) tags.push(extracted.humor.type);
  
  return tags;
}

// Extract humor types from extracted JSONB
function extractHumorTypes(signal) {
  const extracted = signal.extracted || {};
  const types = [];
  
  if (extracted.humorTypes) {
    return Array.isArray(extracted.humorTypes) ? extracted.humorTypes : [extracted.humorTypes];
  }
  if (extracted.humor?.type) {
    types.push(extracted.humor.type);
  }
  
  return types;
}

async function migrate() {
  console.log('🔄 Starting migration of video_signals.notes to learning examples...\n');
  
  // Fetch all video_signals with notes
  // Schema: id, video_id, brand_id, extracted, human_overrides, rating, notes, embedding, fingerprint
  const { data: signals, error: fetchError } = await supabase
    .from('video_signals')
    .select(`
      id,
      video_id,
      notes,
      extracted,
      analyzed_videos!inner(
        id,
        video_url,
        visual_analysis
      )
    `)
    .not('notes', 'is', null)
    .neq('notes', '');
  
  if (fetchError) {
    console.error('❌ Error fetching video_signals:', fetchError.message);
    process.exit(1);
  }
  
  console.log(`📊 Found ${signals?.length || 0} video_signals with notes\n`);
  
  if (!signals || signals.length === 0) {
    console.log('No signals with notes found.');
    return;
  }
  
  let migrated = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const signal of signals) {
    const parsedSections = parseNotes(signal.notes);
    
    if (!parsedSections) {
      skipped++;
      continue;
    }
    
    const video = signal.analyzed_videos;
    const exampleType = determineExampleType(parsedSections);
    const explanation = buildExplanation(parsedSections);
    
    // Build summary from video analysis
    const videoSummary = video?.visual_analysis?.summary 
      || video?.visual_analysis?.content?.keyMessage
      || `Video ${signal.video_id}`;
    
    // Get the correct interpretation (the note itself is the correction)
    const correctInterpretation = parsedSections['analysis notes'] 
      || parsedSections['humor notes']
      || parsedSections['general']
      || explanation;
    
    // Generate embedding for semantic matching
    const embeddingText = `${videoSummary}\n\n${explanation}`;
    const embedding = await generateEmbedding(embeddingText);
    
    if (!embedding) {
      console.log(`⚠️  Skipping ${signal.id} - embedding failed`);
      errors++;
      continue;
    }
    
    // Check if already migrated
    const { data: existing } = await supabase
      .from('video_analysis_examples')
      .select('id')
      .eq('video_id', video?.id)
      .single();
    
    if (existing) {
      console.log(`⏭️  Already exists for video ${video?.id}`);
      skipped++;
      continue;
    }
    
    // Insert learning example
    const { error: insertError } = await supabase
      .from('video_analysis_examples')
      .insert({
        video_id: video?.id,
        video_url: video?.video_url,
        example_type: exampleType,
        video_summary: videoSummary.slice(0, 500),
        gemini_interpretation: 'Original Gemini analysis',
        correct_interpretation: correctInterpretation.slice(0, 2000),
        explanation: explanation.slice(0, 2000),
        cultural_context: parsedSections['cultural notes'] || parsedSections['context notes'] || null,
        tags: extractTags(signal),
        humor_types: extractHumorTypes(signal),
        industry: signal.extracted?.industry || null,
        content_format: signal.extracted?.contentFormat || null,
        embedding: embedding,
        quality_score: 0.85,
        created_by: 'migrated_from_signals'
      });
    
    if (insertError) {
      console.log(`❌ Error inserting example for ${signal.id}:`, insertError.message);
      errors++;
    } else {
      console.log(`✅ Migrated: ${videoSummary.slice(0, 50)}...`);
      migrated++;
    }
    
    // Rate limiting for OpenAI
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log('\n📈 Migration Summary:');
  console.log(`   ✅ Migrated: ${migrated}`);
  console.log(`   ⏭️  Skipped:  ${skipped}`);
  console.log(`   ❌ Errors:   ${errors}`);
}

// Also migrate from analysis_corrections table
async function migrateAnalysisCorrections() {
  console.log('\n🔄 Migrating analysis_corrections table...\n');
  
  const { data: corrections, error } = await supabase
    .from('analysis_corrections')
    .select(`
      id,
      video_id,
      correction_type,
      original_values,
      corrected_values,
      notes,
      analyzed_videos(
        id,
        video_url,
        visual_analysis
      )
    `);
  
  if (error) {
    console.error('❌ Error fetching analysis_corrections:', error.message);
    return;
  }
  
  console.log(`📊 Found ${corrections?.length || 0} analysis_corrections\n`);
  
  let migrated = 0;
  
  for (const correction of corrections || []) {
    const video = correction.analyzed_videos;
    
    // Build explanation
    const explanation = correction.notes || 
      `Corrected ${correction.correction_type}: ${JSON.stringify(correction.corrected_values)}`;
    
    const videoSummary = video?.visual_analysis?.summary 
      || video?.visual_analysis?.content?.keyMessage
      || `Video correction`;
    
    // Generate embedding
    const embeddingText = `${videoSummary}\n\nCorrection: ${explanation}`;
    const embedding = await generateEmbedding(embeddingText);
    
    if (!embedding) continue;
    
    // Check if already exists
    const { data: existing } = await supabase
      .from('video_analysis_examples')
      .select('id')
      .eq('video_id', video?.id)
      .limit(1);
    
    if (existing?.length > 0) {
      console.log(`⏭️  Already exists for video ${video?.id}`);
      continue;
    }
    
    // Map correction type to example type
    const exampleType = correction.correction_type === 'humor' 
      ? 'humor_interpretation' 
      : 'cultural_context';
    
    const { error: insertError } = await supabase
      .from('video_analysis_examples')
      .insert({
        video_id: video?.id,
        video_url: video?.video_url,
        example_type: exampleType,
        video_summary: videoSummary.slice(0, 500),
        gemini_interpretation: JSON.stringify(correction.original_values),
        correct_interpretation: JSON.stringify(correction.corrected_values),
        explanation: explanation,
        humor_type_correction: correction.correction_type === 'humor' 
          ? { original: correction.original_values, correct: correction.corrected_values }
          : null,
        embedding: embedding,
        quality_score: 0.9,
        created_by: 'migrated_from_corrections'
      });
    
    if (insertError) {
      console.log(`❌ Error:`, insertError.message);
    } else {
      console.log(`✅ Migrated correction: ${correction.id}`);
      migrated++;
    }
    
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log(`\n✅ Migrated ${migrated} analysis_corrections`);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('   VIDEO ANALYSIS LEARNING - MIGRATION SCRIPT');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  await migrate();
  await migrateAnalysisCorrections();
  
  // Show final count
  const { count } = await supabase
    .from('video_analysis_examples')
    .select('*', { count: 'exact', head: true });
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`   📚 Total learning examples: ${count}`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
