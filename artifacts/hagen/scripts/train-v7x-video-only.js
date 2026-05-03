/**
 * Train v7.X - VIDEO ONLY
 *
 * Tests hypothesis: Does text-only data (Simpsons) dilute or enhance video analysis?
 *
 * This model trains ONLY on TikTok video examples (~262) with GCS URIs.
 * Compare against v7.B (675 examples: 262 video + 413 text) to see if
 * video-only performs equal or better.
 */

const { Storage } = require('@google-cloud/storage');
const { createClient } = require('@supabase/supabase-js');
const { GoogleAuth } = require('google-auth-library');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const CONFIG = {
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  location: 'us-central1',
  bucketName: process.env.GOOGLE_CLOUD_STORAGE_BUCKET || 'hagen-video-analysis',
  baseModel: 'gemini-2.5-flash',
  epochs: 4,
  learningRateMultiplier: 1.0,
  trainSplit: 0.85,
  trainingPath: 'fine-tuning/humor-analysis-v7x',
  outputPath: path.join(__dirname, '../datasets/fine-tuning'),
  goldStandardPath: path.join(__dirname, '../datasets/fine-tuning/gold_standard.jsonl'),
};

const VIDEO_ANALYSIS_PROMPT = `Analysera denna video. Förklara vad som händer och varför det är roligt eller effektivt.

Fokusera på:
1. Vad händer i videon? (Konkret beskrivning)
2. Vad är humormekanismen? (Subversion, timing, kontrast, etc.)
3. Varför fungerar det? (Psykologisk/social förklaring)
4. Vem uppskattar detta? (Målgrupp)

Var specifik och undvik generiska beskrivningar.`;

async function main() {
  console.log('='.repeat(60));
  console.log('v7.X VIDEO-ONLY TRAINING');
  console.log('='.repeat(60));
  console.log('\nHypothesis test: Does text data dilute video analysis?');
  console.log('Training ONLY on TikTok videos with GCS URIs.\n');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const storage = new Storage({ projectId: CONFIG.projectId });
  const bucket = storage.bucket(CONFIG.bucketName);

  const auth = new GoogleAuth({
    keyFile: './credentials/gen-lang-client-0853618366-8c06f8b7a2d1.json',
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });

  // ========== 1. Load Gold Standard ==========
  console.log('📚 Loading gold_standard.jsonl...');
  const goldLines = fs.readFileSync(CONFIG.goldStandardPath, 'utf-8')
    .split('\n')
    .filter(line => line.trim());

  const goldExamples = goldLines.map(line => {
    try { return JSON.parse(line); }
    catch (e) { return null; }
  }).filter(Boolean);

  // Filter to TikTok ONLY (exclude Simpsons)
  const tiktokExamples = goldExamples.filter(e =>
    e.url &&
    !e.url.startsWith('simpsons://') &&
    (e.url.includes('tiktok.com') || e.url.includes('vm.tiktok'))
  );

  console.log(`   Total gold_standard: ${goldExamples.length}`);
  console.log(`   TikTok only: ${tiktokExamples.length}`);
  console.log(`   Simpsons excluded: ${goldExamples.length - tiktokExamples.length}`);

  // ========== 2. Get GCS URIs from Supabase ==========
  console.log('\n☁️  Fetching GCS URIs from Supabase...');
  const { data: videos } = await supabase
    .from('analyzed_videos')
    .select('video_url, gcs_uri');

  const gcsMap = new Map();
  if (videos) {
    videos.forEach(v => {
      if (v.video_url && v.gcs_uri) {
        gcsMap.set(v.video_url, v.gcs_uri);
        gcsMap.set(v.video_url.split('?')[0], v.gcs_uri);
      }
    });
  }
  console.log(`   Found ${gcsMap.size} GCS mappings in Supabase`);

  // Also check GCS lab files for timestamp matching
  console.log('   Scanning GCS lab files...');
  const [files] = await bucket.getFiles({ prefix: 'fine-tuning/lab/' });
  const labFiles = files.map(f => {
    const match = f.name.match(/lab_(\d+)_/);
    return match ? {
      name: f.name,
      uri: `gs://${CONFIG.bucketName}/${f.name}`,
      timestamp: parseInt(match[1])
    } : null;
  }).filter(f => f).sort((a, b) => a.timestamp - b.timestamp);
  console.log(`   Found ${labFiles.length} lab files`);

  // ========== 3. Match TikTok Examples to GCS URIs ==========
  console.log('\n🎬 Matching TikTok examples to GCS URIs...');
  const videoExamples = [];
  const missingGcs = [];

  for (const ex of tiktokExamples) {
    let gcsUri = gcsMap.get(ex.url) || gcsMap.get(ex.url?.split('?')[0]);

    // Try timestamp matching as fallback
    if (!gcsUri && ex.timestamp) {
      const saveTime = new Date(ex.timestamp).getTime();
      const candidates = labFiles.filter(f =>
        f.timestamp < saveTime && (saveTime - f.timestamp) < 1800000
      );
      if (candidates.length > 0) {
        gcsUri = candidates[candidates.length - 1].uri;
      }
    }

    if (gcsUri) {
      videoExamples.push({
        gcsUri,
        analysis: ex.analysis,
        url: ex.url
      });
    } else {
      missingGcs.push(ex.url);
    }
  }

  console.log(`   With GCS URI: ${videoExamples.length}`);
  console.log(`   Missing GCS (excluded): ${missingGcs.length}`);

  if (videoExamples.length < 50) {
    console.error('\n❌ Not enough video examples with GCS URIs. Need at least 50.');
    process.exit(1);
  }

  // ========== 4. Shuffle and Split ==========
  console.log('\n🔀 Preparing dataset...');

  // Shuffle
  for (let i = videoExamples.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [videoExamples[i], videoExamples[j]] = [videoExamples[j], videoExamples[i]];
  }

  // Split
  const splitIdx = Math.floor(videoExamples.length * CONFIG.trainSplit);
  const trainExamples = videoExamples.slice(0, splitIdx);
  const validExamples = videoExamples.slice(splitIdx);

  console.log(`   Total video examples: ${videoExamples.length}`);
  console.log(`   Training: ${trainExamples.length}`);
  console.log(`   Validation: ${validExamples.length}`);

  // ========== 5. Format for Gemini ==========
  console.log('\n💾 Formatting for Gemini...');

  function formatVideoExample(ex) {
    return JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { fileData: { fileUri: ex.gcsUri, mimeType: 'video/mp4' } },
            { text: VIDEO_ANALYSIS_PROMPT }
          ]
        },
        {
          role: 'model',
          parts: [{ text: ex.analysis }]
        }
      ],
      generationConfig: { mediaResolution: 'MEDIA_RESOLUTION_LOW' }
    });
  }

  const trainLines = trainExamples.map(formatVideoExample).join('\n');
  const validLines = validExamples.map(formatVideoExample).join('\n');

  // Save locally
  const timestamp = Date.now();
  const trainFile = `v7x_video_only_train_${timestamp}.jsonl`;
  const validFile = `v7x_video_only_validation_${timestamp}.jsonl`;

  fs.writeFileSync(path.join(CONFIG.outputPath, trainFile), trainLines);
  fs.writeFileSync(path.join(CONFIG.outputPath, validFile), validLines);
  console.log(`   Saved: ${trainFile}`);
  console.log(`   Saved: ${validFile}`);

  // ========== 6. Upload to GCS ==========
  console.log('\n☁️  Uploading to GCS...');
  const trainGcsPath = `${CONFIG.trainingPath}/train_${timestamp}.jsonl`;
  const validGcsPath = `${CONFIG.trainingPath}/validation_${timestamp}.jsonl`;

  await bucket.file(trainGcsPath).save(trainLines);
  await bucket.file(validGcsPath).save(validLines);

  const trainUri = `gs://${CONFIG.bucketName}/${trainGcsPath}`;
  const validUri = `gs://${CONFIG.bucketName}/${validGcsPath}`;

  console.log(`   Train: ${trainUri}`);
  console.log(`   Validation: ${validUri}`);

  // Save URIs
  fs.writeFileSync(
    path.join(CONFIG.outputPath, 'v7x_video_only_uris.json'),
    JSON.stringify({
      trainUri,
      validationUri: validUri,
      timestamp: new Date().toISOString(),
      stats: {
        total: videoExamples.length,
        train: trainExamples.length,
        validation: validExamples.length,
        excluded_simpsons: goldExamples.length - tiktokExamples.length,
        excluded_no_gcs: missingGcs.length
      }
    }, null, 2)
  );

  // ========== 7. Submit Training Job ==========
  console.log('\n🚀 Submitting training job...');

  const displayName = `humor-analysis-v7X-video-only-${new Date().toISOString().replace(/[:.]/g, '-')}`;

  const client = await auth.getClient();
  const token = await client.getAccessToken();

  const endpoint = `https://${CONFIG.location}-aiplatform.googleapis.com/v1/projects/${CONFIG.projectId}/locations/${CONFIG.location}/tuningJobs`;

  const requestBody = {
    baseModel: CONFIG.baseModel,
    supervisedTuningSpec: {
      trainingDatasetUri: trainUri,
      validationDatasetUri: validUri,
      hyperParameters: {
        epochCount: CONFIG.epochs,
        learningRateMultiplier: CONFIG.learningRateMultiplier
      }
    },
    tunedModelDisplayName: displayName
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('❌ Failed to submit job:', error);
    throw new Error(error);
  }

  const job = await response.json();

  console.log('\n✅ v7.X Video-Only Training job submitted!');
  console.log(`   Job: ${job.name}`);
  console.log(`   Display name: ${displayName}`);
  console.log(`   Examples: ${videoExamples.length} (video only, zero text)`);

  // Update model_versions.json
  const versionsPath = path.join(CONFIG.outputPath, 'model_versions.json');
  const versions = JSON.parse(fs.readFileSync(versionsPath, 'utf-8'));

  versions.versions['v7.X'] = {
    jobName: job.name,
    status: 'training',
    description: `${videoExamples.length} VIDEO-ONLY examples (zero Simpsons text)`,
    submittedAt: new Date().toISOString(),
    examples: videoExamples.length,
    method: 'video_only_hypothesis_test',
    hypothesis: 'Testing if text data dilutes video analysis capability'
  };
  versions.latest = 'v7.X';

  fs.writeFileSync(versionsPath, JSON.stringify(versions, null, 2));

  // Save active job
  fs.writeFileSync(
    path.join(CONFIG.outputPath, 'active_job.json'),
    JSON.stringify({
      name: job.name,
      displayName,
      type: 'v7.X-video-only',
      submittedAt: new Date().toISOString(),
      config: requestBody,
      stats: {
        videoExamples: videoExamples.length,
        excludedSimpsons: goldExamples.length - tiktokExamples.length,
        excludedNoGcs: missingGcs.length
      }
    }, null, 2)
  );

  console.log('\n📝 Comparison plan:');
  console.log('   After training completes (~30-60 min):');
  console.log('   node scripts/compare-v7b-v7x.js');
  console.log('');
  console.log('   v7.B: 675 examples (262 video + 413 text)');
  console.log(`   v7.X: ${videoExamples.length} examples (video only)`);
  console.log('');
  console.log('   If v7.X >= v7.B on video analysis → text data is dilution');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
