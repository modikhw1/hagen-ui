#!/usr/bin/env node
/**
 * Re-analyze videos that have corrections but old-schema analysis
 * 
 * Uses Vertex AI which can access GCS URIs DIRECTLY - no re-download needed!
 * 
 * These 108 videos have human corrections in video_analysis_examples,
 * but their analyzed_videos.visual_analysis uses the OLD schema that
 * doesn't include humor/script data needed for learning.
 * 
 * Usage: node scripts/reanalyze-old-schema-videos.js [--limit N] [--dry-run]
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { GoogleAuth } = require('google-auth-library');
const OpenAI = require('openai');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Vertex AI configuration
const VERTEX_PROJECT_ID = process.env.VERTEX_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || 'us-central1';
const VERTEX_ENDPOINT = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1`;

// Parse command line args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit'));
const limit = limitArg ? parseInt(limitArg.split('=')[1] || args[args.indexOf('--limit') + 1]) : 10;

// Analysis prompt optimized for learning data extraction
const LEARNING_ANALYSIS_PROMPT = `Analyze this video for humor and content understanding. Return JSON with:

{
  "transcript": "Full dialogue/text spoken in the video",
  "scenes": [
    {"number": 1, "description": "What happens", "dialogue": "What is said", "timing": "0:00-0:05"}
  ],
  "humor": {
    "humorType": "primary humor mechanism (wordplay/visual-reveal/subversion/observational/absurdist/relatable/deadpan/physical/edit-punchline)",
    "humorMechanism": "How the humor works technically",
    "whyFunny": "Why this is funny to the target audience",
    "punchlineDelivery": "How the punchline is delivered (verbal/visual/edit-cut/reaction)",
    "comedyTiming": "Description of timing and pacing"
  },
  "content": {
    "conceptCore": "One sentence summary of the core concept",
    "keyMessage": "Main takeaway",
    "format": "skit/pov/talking-head/montage/etc",
    "emotionalTone": "The emotional feel"
  },
  "culturalContext": "Any generational, cultural, or internet-culture references needed to understand the humor"
}

Be specific about WHY things are funny, not just what happens.`;

// Get Vertex AI access token
async function getAccessToken() {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token;
}

// Analyze video using Vertex AI (direct GCS access!)
async function analyzeVideoWithVertex(gcsUri) {
  const model = 'gemini-2.0-flash-001';
  const endpoint = `${VERTEX_ENDPOINT}/projects/${VERTEX_PROJECT_ID}/locations/${VERTEX_LOCATION}/publishers/google/models/${model}:generateContent`;

  const requestBody = {
    contents: [{
      role: "user",
      parts: [
        {
          fileData: {
            mimeType: "video/mp4",
            fileUri: gcsUri
          }
        },
        { text: LEARNING_ANALYSIS_PROMPT }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192
    }
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${await getAccessToken()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vertex AI error: ${errorText.slice(0, 200)}`);
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  
  // Parse JSON from response
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[1] || jsonMatch[0]);
  }
  
  throw new Error('Could not parse JSON from Vertex response');
}

async function updateLearningExample(exampleId, geminiAnalysis, humanCorrection) {
  // Build comprehensive embedding text
  const embeddingParts = [
    geminiAnalysis.content?.conceptCore,
    geminiAnalysis.transcript,
    humanCorrection,
    geminiAnalysis.humor?.whyFunny
  ].filter(Boolean);
  
  const embeddingText = embeddingParts.join('\n\n').slice(0, 8000);
  
  // Generate new embedding
  const embRes = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: embeddingText
  });
  
  // Build Gemini interpretation string
  const interpretationParts = [];
  if (geminiAnalysis.humor?.humorType) interpretationParts.push(`Humor Type: ${geminiAnalysis.humor.humorType}`);
  if (geminiAnalysis.humor?.humorMechanism) interpretationParts.push(`Mechanism: ${geminiAnalysis.humor.humorMechanism}`);
  if (geminiAnalysis.humor?.whyFunny) interpretationParts.push(`Why Funny: ${geminiAnalysis.humor.whyFunny}`);
  if (geminiAnalysis.humor?.punchlineDelivery) interpretationParts.push(`Punchline: ${geminiAnalysis.humor.punchlineDelivery}`);
  if (geminiAnalysis.content?.conceptCore) interpretationParts.push(`Concept: ${geminiAnalysis.content.conceptCore}`);
  
  // Analyze delta between AI and human
  const humanLower = (humanCorrection || '').toLowerCase();
  const aiLower = interpretationParts.join(' ').toLowerCase();
  
  let pattern = null;
  const geminiMissed = [];
  
  if (humanLower.includes('visual') && !aiLower.includes('visual')) {
    pattern = 'missed_visual_element';
    geminiMissed.push('Visual comedy not emphasized');
  }
  if (humanLower.includes('cultural') || humanLower.includes('gen z') || humanLower.includes('millennial')) {
    pattern = 'missed_cultural_context';
    geminiMissed.push('Cultural/generational context needed');
  }
  if (humanLower.includes('edit') || humanLower.includes('cut')) {
    pattern = 'edit_punchline';
    geminiMissed.push('Edit/cut timing is the punchline');
  }
  
  // Update the learning example (only existing columns)
  // Store transcript/scenes inside humor_type_correction JSON (visual_elements is an array, not object)
  const { error } = await supabase
    .from('video_analysis_examples')
    .update({
      video_summary: geminiAnalysis.content?.conceptCore?.slice(0, 500) || undefined,
      gemini_interpretation: interpretationParts.join('\n'),
      humor_type_correction: {
        pattern,
        geminiMissed,
        transcript: geminiAnalysis.transcript?.slice(0, 2000),
        scenes: geminiAnalysis.scenes?.map((s, i) => `Scene ${i + 1}: ${s.description}`).join('\n').slice(0, 1000),
        original: geminiAnalysis.humor?.humorType,
        humanInsight: humanCorrection?.split(/[.!?]/)[0]?.slice(0, 200),
        // Also store audio/visual analysis here
        audio: geminiAnalysis.audio,
        visual: geminiAnalysis.visual
      },
      // visual_elements is text[] array - extract key visual descriptors
      visual_elements: [
        geminiAnalysis.visual?.visualStyle,
        geminiAnalysis.visual?.colorPalette,
        geminiAnalysis.visual?.cameraWork,
        ...(geminiAnalysis.scenes?.slice(0, 3).map(s => s.description?.slice(0, 100)) || [])
      ].filter(Boolean),
      embedding: embRes.data[0].embedding,
      quality_score: 0.95
    })
    .eq('id', exampleId);
  
  return { error };
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('   RE-ANALYZING OLD-SCHEMA VIDEOS WITH VERTEX AI');
  console.log('   (Direct GCS access - no re-download needed!)');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`   Limit: ${limit} videos`);
  console.log(`   Project: ${VERTEX_PROJECT_ID}`);
  console.log('═══════════════════════════════════════════════════════════════════\n');
  
  if (!VERTEX_PROJECT_ID) {
    console.error('❌ VERTEX_PROJECT_ID not set. Set VERTEX_PROJECT_ID or GOOGLE_CLOUD_PROJECT env var.');
    return;
  }
  
  // Find learning examples that need re-analysis
  const { data: examples, error } = await supabase
    .from('video_analysis_examples')
    .select(`
      id,
      video_id,
      correct_interpretation,
      explanation,
      analyzed_videos!inner(
        id,
        gcs_uri,
        video_url,
        visual_analysis
      )
    `)
    .or('gemini_interpretation.is.null,gemini_interpretation.eq.Original Gemini analysis')
    .limit(limit);
  
  if (error) {
    console.error('Error fetching examples:', error.message);
    return;
  }
  
  // Filter to only old-schema videos with GCS URI
  const toProcess = (examples || []).filter(ex => {
    const va = ex.analyzed_videos?.visual_analysis;
    const hasOldSchema = va?.quality_signals || va?.execution_signals;
    const hasGcsUri = ex.analyzed_videos?.gcs_uri;
    return hasOldSchema && hasGcsUri;
  });
  
  console.log(`📊 Found ${examples?.length || 0} examples missing Gemini interpretation`);
  console.log(`📊 ${toProcess.length} have old-schema analysis with GCS URI\n`);
  
  if (toProcess.length === 0) {
    console.log('No videos to process!');
    return;
  }
  
  let processed = 0;
  let errors = 0;
  
  for (const example of toProcess) {
    const video = example.analyzed_videos;
    console.log(`\n🎬 Processing: ${video.video_url?.slice(0, 50) || example.id}`);
    console.log(`   GCS: ${video.gcs_uri?.slice(0, 60)}`);
    
    if (dryRun) {
      console.log('   [DRY RUN] Would analyze with Vertex AI and update');
      processed++;
      continue;
    }
    
    try {
      // Analyze with Vertex AI (direct GCS access!)
      console.log('   📤 Sending to Vertex AI (direct GCS access)...');
      const analysis = await analyzeVideoWithVertex(video.gcs_uri);
      console.log('   ✅ Got analysis:', analysis.humor?.humorType, '/', analysis.content?.format);
      
      // Update learning example
      console.log('   💾 Updating learning example...');
      const humanCorrection = example.correct_interpretation || example.explanation;
      const { error: updateError } = await updateLearningExample(example.id, analysis, humanCorrection);
      
      if (updateError) {
        console.log('   ❌ Update failed:', updateError.message);
        errors++;
      } else {
        console.log('   ✅ Updated successfully');
        processed++;
      }
      
      // Also update the analyzed_videos with new analysis
      await supabase
        .from('analyzed_videos')
        .update({
          visual_analysis: {
            ...video.visual_analysis,
            // Merge new analysis
            content: analysis.content,
            script: {
              transcript: analysis.transcript,
              humor: analysis.humor
            },
            scenes: analysis.scenes,
            humor: analysis.humor,
            culturalContext: analysis.culturalContext
          }
        })
        .eq('id', video.id);
      
      // Rate limiting - Gemini has quotas
      await new Promise(r => setTimeout(r, 2000));
      
    } catch (err) {
      console.log('   ❌ Error:', err.message);
      errors++;
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('   COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`   ✅ Processed: ${processed}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log('═══════════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
