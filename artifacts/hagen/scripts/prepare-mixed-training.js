/**
 * Prepare Mixed Training Data (Video + Text-Only)
 *
 * Creates training dataset combining:
 * - TikTok video examples (with GCS URIs)
 * - Simpsons text examples (mechanism vocabulary)
 *
 * Usage: node scripts/prepare-mixed-training.js
 */

const { Storage } = require('@google-cloud/storage');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const CONFIG = {
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  bucketName: process.env.GOOGLE_CLOUD_STORAGE_BUCKET || 'hagen-video-analysis',
  trainSplit: 0.85,
  trainingPath: 'fine-tuning/humor-analysis-v5',
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

const TEXT_ANALYSIS_PROMPT = `Analysera denna scenbeskrivning från ett manus. Förklara vad som händer och varför det är roligt.

Fokusera på:
1. Vad händer? (Handlingen)
2. Vad är humormekanismen? (Timing, fysisk komedi, reaktion, callback, etc.)
3. Varför fungerar det?

Var specifik om den visuella komiken.`;

async function main() {
  console.log('📊 Preparing Mixed Training Data (V5)...\n');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const storage = new Storage({ projectId: CONFIG.projectId });
  const bucket = storage.bucket(CONFIG.bucketName);

  // Load gold standard
  const goldLines = fs.readFileSync(CONFIG.goldStandardPath, 'utf-8')
    .split('\n')
    .filter(line => line.trim());
  const goldExamples = goldLines.map(line => JSON.parse(line));

  console.log(`Total gold standard entries: ${goldExamples.length}`);

  // Separate TikTok vs Simpsons
  const tiktokExamples = goldExamples.filter(e => !e.url.startsWith('simpsons://'));
  const simpsonsExamples = goldExamples.filter(e => e.url.startsWith('simpsons://'));

  console.log(`TikTok examples: ${tiktokExamples.length}`);
  console.log(`Simpsons examples: ${simpsonsExamples.length}`);

  // Get GCS URIs for TikTok videos
  console.log('\nFetching GCS URIs from Supabase...');
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

  // Also check GCS lab files
  const [files] = await bucket.getFiles({ prefix: 'fine-tuning/lab/' });
  const labFiles = files.map(f => {
    const match = f.name.match(/lab_(\d+)_/);
    return match ? {
      name: f.name,
      uri: `gs://${CONFIG.bucketName}/${f.name}`,
      timestamp: parseInt(match[1])
    } : null;
  }).filter(f => f).sort((a, b) => a.timestamp - b.timestamp);

  // Process TikTok examples (video format)
  const videoExamples = [];
  const missingVideo = [];

  for (const ex of tiktokExamples) {
    let gcsUri = gcsMap.get(ex.url) || gcsMap.get(ex.url.split('?')[0]);

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
        source: ex.source || 'tiktok'
      });
    } else {
      missingVideo.push(ex.url);
    }
  }

  console.log(`Video examples with GCS URI: ${videoExamples.length}`);
  console.log(`Missing GCS URI: ${missingVideo.length}`);

  // Process Simpsons examples (text format)
  const textExamples = simpsonsExamples.map(ex => ({
    type: 'text',
    sceneDescription: extractSceneDescription(ex),
    analysis: ex.analysis,
    source: 'simpsons-bridge'
  }));

  console.log(`Text examples: ${textExamples.length}`);

  // Combine and shuffle
  const allExamples = [...videoExamples, ...textExamples];
  shuffleArray(allExamples);

  // Split train/validation
  const splitIdx = Math.floor(allExamples.length * CONFIG.trainSplit);
  const trainExamples = allExamples.slice(0, splitIdx);
  const validExamples = allExamples.slice(splitIdx);

  console.log(`\nTraining examples: ${trainExamples.length}`);
  console.log(`Validation examples: ${validExamples.length}`);

  // Format and upload
  const trainLines = trainExamples.map(formatExample).join('\n');
  const validLines = validExamples.map(formatExample).join('\n');

  // Save locally
  fs.writeFileSync(path.join(CONFIG.outputPath, 'train_v5_mixed.jsonl'), trainLines);
  fs.writeFileSync(path.join(CONFIG.outputPath, 'validation_v5_mixed.jsonl'), validLines);

  // Upload to GCS
  const timestamp = Date.now();
  const trainGcsPath = `${CONFIG.trainingPath}/train_${timestamp}.jsonl`;
  const validGcsPath = `${CONFIG.trainingPath}/validation_${timestamp}.jsonl`;

  await bucket.file(trainGcsPath).save(trainLines);
  await bucket.file(validGcsPath).save(validLines);

  const trainUri = `gs://${CONFIG.bucketName}/${trainGcsPath}`;
  const validUri = `gs://${CONFIG.bucketName}/${validGcsPath}`;

  console.log('\n✅ Uploaded to GCS:');
  console.log(`  Train: ${trainUri}`);
  console.log(`  Valid: ${validUri}`);

  // Save URIs for training step
  fs.writeFileSync(
    path.join(CONFIG.outputPath, 'latest_uris.json'),
    JSON.stringify({
      trainUri,
      validationUri: validUri,
      timestamp: new Date().toISOString(),
      stats: {
        total: allExamples.length,
        video: videoExamples.length,
        text: textExamples.length,
        train: trainExamples.length,
        validation: validExamples.length
      }
    }, null, 2)
  );

  console.log('\n📊 Statistics:');
  console.log(`  Total examples: ${allExamples.length}`);
  console.log(`  Video (TikTok): ${videoExamples.length}`);
  console.log(`  Text (Simpsons): ${textExamples.length}`);
  console.log(`  Train split: ${trainExamples.length}`);
  console.log(`  Validation split: ${validExamples.length}`);

  console.log('\n→ Run: node scripts/fine-tune-gemini.js train');
}

/**
 * Extract scene description from Simpsons example
 */
function extractSceneDescription(ex) {
  // Parse the analysis to get the handling/action
  const handlingMatch = ex.analysis.match(/\*\*Handling:\*\* ([^\n]+)/);
  const handling = handlingMatch ? handlingMatch[1] : '';

  // Use episode/title info if available
  const episodeInfo = ex.episode && ex.title
    ? `[${ex.episode}] ${ex.title}\n`
    : '';

  // Extract scene from URL if available
  const sceneMatch = ex.url.match(/simpsons:\/\/[^/]+\/(.+)/);
  const scene = sceneMatch ? sceneMatch[1].replace(/_/g, ' ') : '';

  return `${episodeInfo}Scen: ${scene}\nHandling: ${handling}`;
}

/**
 * Format example for Gemini fine-tuning
 */
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
    // Text-only example
    return JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: `${TEXT_ANALYSIS_PROMPT}\n\n${ex.sceneDescription}` }
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

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

main().catch(console.error);
