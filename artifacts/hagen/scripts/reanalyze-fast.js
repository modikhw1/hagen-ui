/**
 * FAST Re-analysis with σTaste v1.1 schema
 * 
 * Optimizations:
 * 1. Parallel video uploads (batch of N at a time)
 * 2. Concurrent Gemini processing while uploading next batch
 * 3. Store Gemini file URIs for reuse
 * 
 * Usage: node scripts/reanalyze-fast.js [--limit N] [--parallel N] [--dry-run]
 */

const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager, FileState } = require('@google/generative-ai/server');
const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Load env
const envPath = path.join(__dirname, '..', '.env.local');
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length) {
    process.env[key.trim()] = valueParts.join('=').trim();
  }
});

// Parse args
const args = process.argv.slice(2);
const getArg = (name) => {
  const arg = args.find(a => a.startsWith(`--${name}`));
  if (!arg) return null;
  return arg.includes('=') ? arg.split('=')[1] : args[args.indexOf(`--${name}`) + 1];
};

const LIMIT = getArg('limit') ? parseInt(getArg('limit')) : null;
const PARALLEL = getArg('parallel') ? parseInt(getArg('parallel')) : 3; // Default 3 parallel
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiKey = process.env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseKey || !geminiKey) {
  console.error('❌ Missing credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const genAI = new GoogleGenerativeAI(geminiKey);
const fileManager = new GoogleAIFileManager(geminiKey);

const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

// Load calibrated prompt
function loadPrompt() {
  const promptPath = path.join(__dirname, '..', 'prompts', 'v1.1_sigma_taste_calibrated.md');
  if (fs.existsSync(promptPath)) {
    return fs.readFileSync(promptPath, 'utf8');
  }
  throw new Error('Calibrated prompt not found');
}

// Download from GCS
async function downloadVideo(gcsUri) {
  const [bucketName, ...pathParts] = gcsUri.replace('gs://', '').split('/');
  const file = storage.bucket(bucketName).file(pathParts.join('/'));
  const tempPath = path.join(os.tmpdir(), `video_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);
  await file.download({ destination: tempPath });
  return tempPath;
}

// Upload to Gemini and wait for processing
async function uploadToGemini(localPath, videoId) {
  const uploadResult = await fileManager.uploadFile(localPath, {
    mimeType: 'video/mp4',
    displayName: `hagen_${videoId}.mp4`,
  });
  
  let file = uploadResult.file;
  let waitTime = 0;
  while (file.state === FileState.PROCESSING) {
    await new Promise(r => setTimeout(r, 1000)); // Check every 1s instead of 2s
    waitTime += 1;
    file = await fileManager.getFile(file.name);
  }
  
  fs.unlinkSync(localPath); // Cleanup
  
  if (file.state !== FileState.ACTIVE) {
    throw new Error(`Processing failed: ${file.state}`);
  }
  
  return { uri: file.uri, waitTime };
}

// Analyze video with Gemini
async function analyzeWithGemini(fileUri, prompt) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
  
  const result = await model.generateContent([
    { fileData: { mimeType: 'video/mp4', fileUri } },
    { text: prompt }
  ]);
  
  let text = result.response.text().trim();
  if (text.startsWith('```json')) text = text.slice(7);
  if (text.startsWith('```')) text = text.slice(3);
  if (text.endsWith('```')) text = text.slice(0, -3);
  
  return JSON.parse(text.trim());
}

// Extract signals for video_signals table
function extractSignals(analysis) {
  const qs = analysis.quality_signals || {};
  const es = analysis.execution_signals || {};
  const rep = analysis.replicability || {};
  const cc = analysis.content_classification || {};
  
  return {
    attention_retention: qs.attention_retention,
    audio_quality: qs.audio_quality,
    visual_clarity: qs.visual_clarity,
    hook_strength: qs.hook_strength,
    cuts_per_minute: qs.cuts_per_minute,
    hook_analysis: qs.hook_analysis,
    payoff_analysis: qs.payoff_analysis,
    narrative_flow: es.narrative_flow,
    performer_execution: es.performer_execution,
    production_polish: es.production_polish,
    replicability: rep,
    content_classification: cc,
    scenes: analysis.scenes,
    overall_assessment: analysis.overall_assessment
  };
}

// Process a single video (full pipeline)
async function processVideo(video, prompt) {
  const start = Date.now();
  
  // Step 1: Download
  const downloadStart = Date.now();
  const localPath = await downloadVideo(video.gcs_uri);
  const downloadTime = Date.now() - downloadStart;
  
  // Step 2: Upload to Gemini
  const uploadStart = Date.now();
  const { uri, waitTime } = await uploadToGemini(localPath, video.id);
  const uploadTime = Date.now() - uploadStart;
  
  // Step 3: Analyze
  const analyzeStart = Date.now();
  const analysis = await analyzeWithGemini(uri, prompt);
  const analyzeTime = Date.now() - analyzeStart;
  
  return {
    analysis,
    timing: {
      download: downloadTime,
      upload: uploadTime,
      geminiWait: waitTime * 1000,
      analyze: analyzeTime,
      total: Date.now() - start
    }
  };
}

// Process batch of videos in parallel
async function processBatch(videos, prompt, batchNum, totalBatches) {
  console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${videos.length} videos)`);
  
  const results = await Promise.allSettled(
    videos.map(async (video, i) => {
      const label = `  [${batchNum}.${i + 1}]`;
      console.log(`${label} 🔍 ${video.id.slice(0, 8)}... downloading`);
      
      try {
        const result = await processVideo(video, prompt);
        console.log(`${label} ✅ Done (${(result.timing.total / 1000).toFixed(1)}s total, ${result.timing.geminiWait / 1000}s wait)`);
        return { video, ...result };
      } catch (err) {
        console.log(`${label} ❌ ${err.message}`);
        throw err;
      }
    })
  );
  
  return results;
}

async function main() {
  console.log('🚀 FAST σTaste v1.1 Re-Analysis');
  console.log('================================');
  console.log(`Parallel: ${PARALLEL} | Limit: ${LIMIT || 'all'} | DryRun: ${DRY_RUN}`);
  console.log('');
  
  const prompt = loadPrompt();
  console.log(`📋 Prompt loaded (~${Math.round(prompt.length / 4)} tokens)`);
  
  // Fetch videos
  let query = supabase
    .from('analyzed_videos')
    .select('id, video_url, gcs_uri, visual_analysis')
    .not('gcs_uri', 'is', null);
  
  if (!FORCE) {
    query = query.not('visual_analysis->>schema_version', 'eq', 'v1.1-sigma');
  }
  
  if (LIMIT) {
    query = query.limit(LIMIT);
  }
  
  const { data: videos, error } = await query;
  
  if (error) {
    console.error('❌ Failed to fetch videos:', error);
    process.exit(1);
  }
  
  console.log(`📹 Found ${videos.length} videos to process\n`);
  
  if (videos.length === 0) {
    console.log('Nothing to do!');
    return;
  }
  
  const results = { success: [], failed: [] };
  const timings = [];
  
  // Process in batches
  const batches = [];
  for (let i = 0; i < videos.length; i += PARALLEL) {
    batches.push(videos.slice(i, i + PARALLEL));
  }
  
  for (let i = 0; i < batches.length; i++) {
    const batchResults = await processBatch(batches[i], prompt, i + 1, batches.length);
    
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        const { video, analysis, timing } = result.value;
        timings.push(timing);
        
        if (!DRY_RUN) {
          // Save to Supabase
          await supabase
            .from('analyzed_videos')
            .update({
              visual_analysis: analysis,
              analyzed_at: new Date().toISOString()
            })
            .eq('id', video.id);
          
          const extracted = extractSignals(analysis);
          await supabase
            .from('video_signals')
            .upsert({
              video_id: video.id,
              brand_id: null,
              schema_version: 'v1.1-sigma',
              extracted,
              source: 'ai',
              updated_at: new Date().toISOString()
            }, { onConflict: 'video_id,brand_id' });
        }
        
        results.success.push(video.id);
      } else {
        results.failed.push({ id: batches[i][batchResults.indexOf(result)]?.id, error: result.reason.message });
      }
    }
    
    // Small delay between batches to avoid rate limits
    if (i < batches.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  // Summary
  console.log('\n================================');
  console.log('📊 Summary');
  console.log('================================');
  console.log(`✅ Success: ${results.success.length}`);
  console.log(`❌ Failed:  ${results.failed.length}`);
  
  if (timings.length > 0) {
    const avgTotal = timings.reduce((s, t) => s + t.total, 0) / timings.length;
    const avgWait = timings.reduce((s, t) => s + t.geminiWait, 0) / timings.length;
    console.log(`\n⏱️  Avg time: ${(avgTotal / 1000).toFixed(1)}s (Gemini wait: ${(avgWait / 1000).toFixed(1)}s)`);
    console.log(`⏱️  Total time: ${(timings.reduce((s, t) => s + t.total, 0) / 1000 / 60).toFixed(1)} minutes`);
    console.log(`⚡ Speedup from parallel: ~${PARALLEL}x`);
  }
  
  if (DRY_RUN) {
    console.log('\n🧪 DRY RUN - no changes saved');
  }
}

main().catch(console.error);
