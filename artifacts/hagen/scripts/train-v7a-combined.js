/**
 * Train v7.A Combined
 *
 * Combines:
 * - 700+ existing gold_standard examples (with GCS URIs from Supabase)
 * - 75 new reasoning chain examples
 *
 * This is a proper training run that builds on v6, not replaces it.
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
  trainingPath: 'fine-tuning/humor-analysis-v7a',
  outputPath: path.join(__dirname, '../datasets/fine-tuning'),
  goldStandardPath: path.join(__dirname, '../datasets/fine-tuning/gold_standard.jsonl'),
  reasoningChainPath: path.join(__dirname, '../datasets/fine-tuning/reasoning-chain-v7A-complete.jsonl'),
};

const VIDEO_ANALYSIS_PROMPT = `Analysera denna video. Förklara vad som händer och varför det är roligt eller effektivt.

Fokusera på:
1. Vad händer i videon? (Konkret beskrivning)
2. Vad är humormekanismen? (Subversion, timing, kontrast, etc.)
3. Varför fungerar det? (Psykologisk/social förklaring)
4. Vem uppskattar detta? (Målgrupp)

Var specifik och undvik generiska beskrivningar.`;

const REASONING_PROMPT = `Analysera denna scen med reasoning chain-metoden:

1. **Observation:** Vad ser/hör du?
2. **Första tolkning (felaktig):** Vad är den uppenbara tolkningen?
3. **Varför den inte stämmer:** Vilka bevis motsäger den?
4. **Korrekt tolkning:** Vad är den faktiska mekanismen?
5. **Mekanism + Varför + Målgrupp**`;

const TEXT_ANALYSIS_PROMPT = `Analysera denna scenbeskrivning. Förklara vad som händer och varför det är roligt.

Fokusera på:
1. Vad händer? (Handlingen)
2. Vad är humormekanismen?
3. Varför fungerar det?`;

async function main() {
  console.log('='.repeat(60));
  console.log('v7.A COMBINED TRAINING');
  console.log('='.repeat(60));
  console.log('\nCombining:');
  console.log('  - Existing gold_standard examples (700+)');
  console.log('  - New reasoning chain examples (75)');
  console.log('');

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

  console.log(`   Total entries: ${goldExamples.length}`);

  // Separate TikTok vs Simpsons
  const tiktokExamples = goldExamples.filter(e => !e.url?.startsWith('simpsons://'));
  const simpsonsExamples = goldExamples.filter(e => e.url?.startsWith('simpsons://'));

  console.log(`   TikTok: ${tiktokExamples.length}`);
  console.log(`   Simpsons: ${simpsonsExamples.length}`);

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

  // ========== 3. Process TikTok Examples ==========
  console.log('\n🎬 Processing TikTok examples...');
  const videoExamples = [];
  const missingVideo = [];

  for (const ex of tiktokExamples) {
    let gcsUri = gcsMap.get(ex.url) || gcsMap.get(ex.url?.split('?')[0]);

    // Try timestamp matching
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
        type: 'video',
        gcsUri,
        analysis: ex.analysis,
        source: 'gold-standard'
      });
    } else {
      missingVideo.push(ex.url);
    }
  }

  console.log(`   With GCS URI: ${videoExamples.length}`);
  console.log(`   Missing GCS: ${missingVideo.length}`);

  // ========== 4. Process Simpsons Examples ==========
  console.log('\n📝 Processing Simpsons examples...');
  const simpsonsTextExamples = simpsonsExamples.map(ex => ({
    type: 'text',
    prompt: TEXT_ANALYSIS_PROMPT,
    sceneDescription: extractSceneDescription(ex),
    analysis: ex.analysis,
    source: 'simpsons'
  }));
  console.log(`   Simpsons text examples: ${simpsonsTextExamples.length}`);

  // ========== 5. Load Reasoning Chain Examples ==========
  console.log('\n🧠 Loading reasoning chain examples...');
  const reasoningLines = fs.readFileSync(CONFIG.reasoningChainPath, 'utf-8')
    .split('\n')
    .filter(line => line.trim());
  const reasoningExamples = reasoningLines.map(line => {
    try { return JSON.parse(line); }
    catch (e) { return null; }
  }).filter(Boolean);
  console.log(`   Loaded ${reasoningExamples.length} reasoning chains`);

  // Convert reasoning chains to training format
  const reasoningFormatted = [];
  for (const ex of reasoningExamples) {
    // Check if it's a TikTok example that needs video
    if (ex.url && !ex.url.startsWith('hypothetical') && ex.url.includes('tiktok')) {
      let gcsUri = gcsMap.get(ex.url) || gcsMap.get(ex.url.split('?')[0]);
      if (gcsUri) {
        reasoningFormatted.push({
          type: 'video',
          gcsUri,
          analysis: ex.analysis,
          source: 'reasoning-chain-tiktok'
        });
      } else {
        // Fall back to text-only
        reasoningFormatted.push({
          type: 'text',
          prompt: REASONING_PROMPT,
          sceneDescription: ex.obvious_interpretation || ex.shortName || '',
          analysis: ex.analysis,
          source: 'reasoning-chain-text'
        });
      }
    } else {
      // Simpsons or hypothetical - text only
      reasoningFormatted.push({
        type: 'text',
        prompt: REASONING_PROMPT,
        sceneDescription: ex.episode ? `[${ex.episode}] ${ex.title || ''}` : '',
        analysis: ex.analysis,
        source: 'reasoning-chain-simpsons'
      });
    }
  }

  const reasoningWithVideo = reasoningFormatted.filter(e => e.type === 'video').length;
  const reasoningTextOnly = reasoningFormatted.filter(e => e.type === 'text').length;
  console.log(`   With video: ${reasoningWithVideo}`);
  console.log(`   Text only: ${reasoningTextOnly}`);

  // ========== 6. Combine All Examples ==========
  console.log('\n🔀 Combining all examples...');
  const allExamples = [
    ...videoExamples,
    ...simpsonsTextExamples,
    ...reasoningFormatted
  ];

  // Shuffle
  for (let i = allExamples.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allExamples[i], allExamples[j]] = [allExamples[j], allExamples[i]];
  }

  // Split
  const splitIdx = Math.floor(allExamples.length * CONFIG.trainSplit);
  const trainExamples = allExamples.slice(0, splitIdx);
  const validExamples = allExamples.slice(splitIdx);

  console.log(`\n📊 Final dataset:`);
  console.log(`   Total: ${allExamples.length}`);
  console.log(`   Training: ${trainExamples.length}`);
  console.log(`   Validation: ${validExamples.length}`);

  // Count by source
  const sourceCounts = {};
  allExamples.forEach(ex => {
    sourceCounts[ex.source] = (sourceCounts[ex.source] || 0) + 1;
  });
  console.log('\n   By source:');
  Object.entries(sourceCounts).forEach(([source, count]) => {
    console.log(`     ${source}: ${count}`);
  });

  // ========== 7. Format and Upload ==========
  console.log('\n💾 Formatting for Gemini...');
  const trainLines = trainExamples.map(formatExample).join('\n');
  const validLines = validExamples.map(formatExample).join('\n');

  // Save locally
  const timestamp = Date.now();
  const trainFile = `v7a_combined_train_${timestamp}.jsonl`;
  const validFile = `v7a_combined_validation_${timestamp}.jsonl`;

  fs.writeFileSync(path.join(CONFIG.outputPath, trainFile), trainLines);
  fs.writeFileSync(path.join(CONFIG.outputPath, validFile), validLines);
  console.log(`   Saved: ${trainFile}`);
  console.log(`   Saved: ${validFile}`);

  // Upload to GCS
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
    path.join(CONFIG.outputPath, 'v7a_combined_uris.json'),
    JSON.stringify({
      trainUri,
      validationUri: validUri,
      timestamp: new Date().toISOString(),
      stats: {
        total: allExamples.length,
        train: trainExamples.length,
        validation: validExamples.length,
        bySoure: sourceCounts
      }
    }, null, 2)
  );

  // ========== 8. Submit Training Job ==========
  console.log('\n🚀 Submitting training job...');

  const displayName = `humor-analysis-v7A-combined-${new Date().toISOString().replace(/[:.]/g, '-')}`;

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

  console.log('\n✅ v7.A Combined Training job submitted!');
  console.log(`   Job: ${job.name}`);
  console.log(`   Display name: ${displayName}`);

  // Update model_versions.json
  const versionsPath = path.join(CONFIG.outputPath, 'model_versions.json');
  const versions = JSON.parse(fs.readFileSync(versionsPath, 'utf-8'));

  versions.versions['v7.A'] = {
    jobName: job.name,
    status: 'training',
    description: `${allExamples.length} examples (${videoExamples.length} TikTok + ${simpsonsTextExamples.length} Simpsons + ${reasoningExamples.length} reasoning chains)`,
    submittedAt: new Date().toISOString(),
    examples: allExamples.length,
    method: 'combined_with_reasoning_chains'
  };
  versions.latest = 'v7.A';

  fs.writeFileSync(versionsPath, JSON.stringify(versions, null, 2));

  // Save active job
  fs.writeFileSync(
    path.join(CONFIG.outputPath, 'active_job.json'),
    JSON.stringify({
      name: job.name,
      displayName,
      type: 'v7.A-combined',
      submittedAt: new Date().toISOString(),
      config: requestBody,
      stats: sourceCounts
    }, null, 2)
  );

  console.log('\n📝 Next steps:');
  console.log('   node scripts/fine-tune-gemini.js status');
}

function extractSceneDescription(ex) {
  const handlingMatch = ex.analysis?.match(/\*\*Handling:\*\* ([^\n]+)/);
  const handling = handlingMatch ? handlingMatch[1] : '';
  const sceneMatch = ex.url?.match(/simpsons:\/\/[^/]+\/(.+)/);
  const scene = sceneMatch ? sceneMatch[1].replace(/_/g, ' ') : '';
  return `Scen: ${scene}\nHandling: ${handling}`;
}

function formatExample(ex) {
  if (ex.type === 'video') {
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
  } else {
    return JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: `${ex.prompt || TEXT_ANALYSIS_PROMPT}\n\n${ex.sceneDescription}` }
          ]
        },
        {
          role: 'model',
          parts: [{ text: ex.analysis }]
        }
      ]
    });
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
