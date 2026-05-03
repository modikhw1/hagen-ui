#!/usr/bin/env node
/**
 * ULTRA-FAST σTaste v1.1 Re-Analysis
 * 
 * Key optimizations:
 * 1. Phase 1: Upload ALL videos to Gemini in parallel (no waiting between uploads)
 * 2. Phase 2: Poll ALL files for ACTIVE state in parallel
 * 3. Phase 3: Analyze ALL videos in parallel (inference is fast ~3-5s)
 * 
 * This decouples the upload wait from analysis, achieving maximum throughput.
 * 
 * Usage: node scripts/reanalyze-ultra.js [--limit N] [--dry-run] [--parallel N]
 */

require('dotenv').config({ path: '.env.local' });

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { Storage } = require('@google-cloud/storage');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager, FileState } = require('@google/generative-ai/server');

// Config from args
const args = process.argv.slice(2);
const LIMIT = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : null;
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force'); // Re-analyze even if already has v1.1-sigma
const PARALLEL_UPLOAD = args.includes('--parallel-upload') 
  ? parseInt(args[args.indexOf('--parallel-upload') + 1]) 
  : 10; // Upload 10 at a time
const PARALLEL_ANALYZE = args.includes('--parallel-analyze')
  ? parseInt(args[args.indexOf('--parallel-analyze') + 1])
  : 2; // Analyze 2 at a time (respects 10 RPM limit with ~10s per analysis)

// Clients
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

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

// Download from GCS to local temp file
async function downloadVideo(gcsUri) {
  const [bucketName, ...pathParts] = gcsUri.replace('gs://', '').split('/');
  const file = storage.bucket(bucketName).file(pathParts.join('/'));
  const tempPath = path.join(os.tmpdir(), `ultra_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);
  await file.download({ destination: tempPath });
  return tempPath;
}

// Upload to Gemini (returns immediately after upload, doesn't wait for processing)
async function uploadToGemini(localPath, videoId) {
  const uploadResult = await fileManager.uploadFile(localPath, {
    mimeType: 'video/mp4',
    displayName: `hagen_${videoId}.mp4`,
  });
  
  // Clean up local file immediately
  fs.unlinkSync(localPath);
  
  return {
    name: uploadResult.file.name,
    state: uploadResult.file.state,
    uri: uploadResult.file.uri
  };
}

// Poll a single file until ready
async function waitForFile(fileName, maxWaitSec = 300) {
  const startWait = Date.now();
  let file = await fileManager.getFile(fileName);
  
  while (file.state === FileState.PROCESSING) {
    if ((Date.now() - startWait) > maxWaitSec * 1000) {
      throw new Error(`Timeout waiting for file ${fileName}`);
    }
    await new Promise(r => setTimeout(r, 2000));
    file = await fileManager.getFile(fileName);
  }
  
  if (file.state !== FileState.ACTIVE) {
    throw new Error(`File processing failed: ${file.state}`);
  }
  
  return {
    uri: file.uri,
    waitTime: (Date.now() - startWait) / 1000
  };
}

// Analyze video with Gemini (fast, ~3-5s) with retry for rate limits
async function analyzeWithGemini(fileUri, prompt, maxRetries = 3) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await model.generateContent([
        { fileData: { mimeType: 'video/mp4', fileUri } },
        { text: prompt }
      ]);
      
      let text = result.response.text().trim();
      if (text.startsWith('```json')) text = text.slice(7);
      if (text.startsWith('```')) text = text.slice(3);
      if (text.endsWith('```')) text = text.slice(0, -3);
      
      return JSON.parse(text.trim());
    } catch (err) {
      if (err.message?.includes('429') && attempt < maxRetries) {
        // Rate limited - wait and retry
        const waitSec = 15 * attempt; // 15s, 30s, 45s
        console.log(`    ⏸️ Rate limited, waiting ${waitSec}s...`);
        await new Promise(r => setTimeout(r, waitSec * 1000));
      } else {
        throw err;
      }
    }
  }
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

// Batch helper
async function processBatch(items, fn, concurrency) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

async function main() {
  console.log('⚡ ULTRA-FAST σTaste v1.1 Re-Analysis');
  console.log('=====================================');
  console.log(`Upload Parallel: ${PARALLEL_UPLOAD} | Analyze Parallel: ${PARALLEL_ANALYZE}`);
  console.log(`Limit: ${LIMIT || 'all'} | DryRun: ${DRY_RUN} | Force: ${FORCE}`);
  console.log('');
  
  const prompt = loadPrompt();
  console.log(`📋 Prompt loaded (~${Math.round(prompt.length / 4)} tokens)`);
  
  // Fetch videos needing analysis
  let query = supabase
    .from('analyzed_videos')
    .select('id, video_url, gcs_uri, visual_analysis')
    .not('gcs_uri', 'is', null);
  
  // Only get videos without v1.1 signals (unless force)
  if (!FORCE) {
    query = query.or('visual_analysis.is.null,visual_analysis->>schema_version.neq.v1.1-sigma');
  }
  
  if (LIMIT) query = query.limit(LIMIT);
  
  const { data: videos, error } = await query;
  
  if (error) {
    console.error('❌ Failed to fetch videos:', error);
    process.exit(1);
  }
  
  console.log(`📹 Found ${videos.length} videos to process\n`);
  
  if (videos.length === 0 || DRY_RUN) {
    console.log('✅ Nothing to do (dry run or no videos)');
    return;
  }
  
  const overallStart = Date.now();
  
  // ============================================
  // PHASE 1: Download and Upload (parallel)
  // ============================================
  console.log('━'.repeat(50));
  console.log('📤 PHASE 1: Uploading videos to Gemini...');
  console.log('━'.repeat(50));
  
  const uploadPhaseStart = Date.now();
  const uploaded = [];
  const uploadFailed = [];
  
  const uploadResults = await processBatch(videos, async (video) => {
    try {
      const localPath = await downloadVideo(video.gcs_uri);
      const fileInfo = await uploadToGemini(localPath, video.id);
      console.log(`  ✓ ${video.id.slice(0, 8)}... uploaded (${fileInfo.state})`);
      return { video, fileInfo };
    } catch (err) {
      console.log(`  ✗ ${video.id.slice(0, 8)}... ${err.message}`);
      throw err;
    }
  }, PARALLEL_UPLOAD);
  
  uploadResults.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      uploaded.push(r.value);
    } else {
      uploadFailed.push({ video: videos[i], error: r.reason });
    }
  });
  
  const uploadPhaseTime = (Date.now() - uploadPhaseStart) / 1000;
  console.log(`\n📤 Upload phase: ${uploaded.length}/${videos.length} succeeded in ${uploadPhaseTime.toFixed(1)}s`);
  
  // ============================================
  // PHASE 2: Wait for all files to be ready
  // ============================================
  console.log('\n' + '━'.repeat(50));
  console.log('⏳ PHASE 2: Waiting for Gemini processing...');
  console.log('━'.repeat(50));
  
  const waitPhaseStart = Date.now();
  const ready = [];
  const waitFailed = [];
  
  // Poll all files in parallel
  const waitResults = await processBatch(uploaded, async ({ video, fileInfo }) => {
    try {
      const { uri, waitTime } = await waitForFile(fileInfo.name);
      console.log(`  ✓ ${video.id.slice(0, 8)}... ready (${waitTime.toFixed(0)}s wait)`);
      return { video, uri, waitTime };
    } catch (err) {
      console.log(`  ✗ ${video.id.slice(0, 8)}... ${err.message}`);
      throw err;
    }
  }, 20); // Poll 20 at a time - just status checks, very lightweight
  
  waitResults.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      ready.push(r.value);
    } else {
      waitFailed.push({ video: uploaded[i].video, error: r.reason });
    }
  });
  
  const waitPhaseTime = (Date.now() - waitPhaseStart) / 1000;
  const avgWait = ready.length > 0 
    ? (ready.reduce((s, r) => s + r.waitTime, 0) / ready.length).toFixed(1)
    : 0;
  console.log(`\n⏳ Wait phase: ${ready.length}/${uploaded.length} ready in ${waitPhaseTime.toFixed(1)}s (avg ${avgWait}s per video)`);
  
  // ============================================
  // PHASE 3: Analyze all videos (fast!)
  // ============================================
  console.log('\n' + '━'.repeat(50));
  console.log('🧠 PHASE 3: Running Gemini analysis...');
  console.log('━'.repeat(50));
  
  const analyzePhaseStart = Date.now();
  const analyzed = [];
  const analyzeFailed = [];
  
  const analyzeResults = await processBatch(ready, async ({ video, uri }) => {
    try {
      const analyzeStart = Date.now();
      const analysis = await analyzeWithGemini(uri, prompt);
      const analyzeTime = (Date.now() - analyzeStart) / 1000;
      console.log(`  ✓ ${video.id.slice(0, 8)}... analyzed (${analyzeTime.toFixed(1)}s)`);
      return { video, analysis, analyzeTime };
    } catch (err) {
      console.log(`  ✗ ${video.id.slice(0, 8)}... ${err.message}`);
      throw err;
    }
  }, PARALLEL_ANALYZE);
  
  analyzeResults.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      analyzed.push(r.value);
    } else {
      analyzeFailed.push({ video: ready[i].video, error: r.reason });
    }
  });
  
  const analyzePhaseTime = (Date.now() - analyzePhaseStart) / 1000;
  const avgAnalyze = analyzed.length > 0
    ? (analyzed.reduce((s, r) => s + r.analyzeTime, 0) / analyzed.length).toFixed(1)
    : 0;
  console.log(`\n🧠 Analyze phase: ${analyzed.length}/${ready.length} done in ${analyzePhaseTime.toFixed(1)}s (avg ${avgAnalyze}s per video)`);
  
  // ============================================
  // PHASE 4: Save to database
  // ============================================
  console.log('\n' + '━'.repeat(50));
  console.log('💾 PHASE 4: Saving to database...');
  console.log('━'.repeat(50));
  
  let saved = 0;
  let saveFailed = 0;
  
  for (const { video, analysis } of analyzed) {
    try {
      // Update analyzed_videos
      await supabase
        .from('analyzed_videos')
        .update({
          visual_analysis: {
            ...analysis,
            schema_version: 'v1.1-sigma',
            analyzed_at: new Date().toISOString()
          }
        })
        .eq('id', video.id);
      
      // Upsert video_signals
      const signals = extractSignals(analysis);
      await supabase
        .from('video_signals')
        .upsert({
          video_id: video.id,
          ...signals,
          updated_at: new Date().toISOString()
        }, { onConflict: 'video_id' });
      
      saved++;
    } catch (err) {
      console.log(`  ✗ ${video.id.slice(0, 8)}... save failed: ${err.message}`);
      saveFailed++;
    }
  }
  
  console.log(`💾 Saved ${saved}/${analyzed.length} to database`);
  
  // ============================================
  // Summary
  // ============================================
  const totalTime = (Date.now() - overallStart) / 1000;
  const perVideo = videos.length > 0 ? (totalTime / videos.length).toFixed(1) : 0;
  
  console.log('\n' + '═'.repeat(50));
  console.log('📊 SUMMARY');
  console.log('═'.repeat(50));
  console.log(`Videos processed:    ${videos.length}`);
  console.log(`Successful:          ${saved}`);
  console.log(`Failed:              ${uploadFailed.length + waitFailed.length + analyzeFailed.length + saveFailed}`);
  console.log('');
  console.log(`Upload phase:        ${uploadPhaseTime.toFixed(1)}s`);
  console.log(`Wait phase:          ${waitPhaseTime.toFixed(1)}s`);
  console.log(`Analyze phase:       ${analyzePhaseTime.toFixed(1)}s`);
  console.log(`Total time:          ${totalTime.toFixed(1)}s`);
  console.log(`Per video:           ${perVideo}s`);
  console.log('');
  console.log(`Speedup vs sequential: ~${Math.round(100 * videos.length / (totalTime / 100))}x`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
