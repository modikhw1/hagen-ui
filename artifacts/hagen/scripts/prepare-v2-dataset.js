const { Storage } = require('@google-cloud/storage');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

// Configuration
const CONFIG = {
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  bucketName: process.env.GOOGLE_CLOUD_STORAGE_BUCKET || 'hagen-video-analysis',
  
  // Data split
  trainSplit: 0.80, // 80% training, 20% validation
  
  // Paths
  trainingPath: 'fine-tuning/humor-analysis',
  outputPath: path.join(__dirname, '../datasets/fine-tuning'),
  goldStandardPath: path.join(__dirname, '../datasets/fine-tuning/gold_standard.jsonl'),
  datasetPaths: [
    path.join(__dirname, '../datasets/dataset_2025-12-16.json'),
    path.join(__dirname, '../datasets/dataset_2025-12-18.json')
  ]
};

const ANALYSIS_PROMPT = `Analysera denna video. Förklara vad som händer och varför det är roligt eller effektivt.

Fokusera på:
1. Vad händer i videon? (Konkret beskrivning)
2. Vad är humormekanismen? (Subversion, timing, kontrast, etc.)
3. Varför fungerar det? (Psykologisk/social förklaring)
4. Vem uppskattar detta? (Målgrupp)

Var specifik och undvik generiska beskrivningar.`;

async function main() {
  console.log('📊 Preparing V3 training data from Gold Standard...\n');

  // Initialize Services
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const storage = new Storage({ projectId: CONFIG.projectId });
  const bucket = storage.bucket(CONFIG.bucketName);

  // 1. Load Gold Standard Data
  if (!fs.existsSync(CONFIG.goldStandardPath)) {
    throw new Error(`Gold standard file not found at ${CONFIG.goldStandardPath}`);
  }
  
  const goldLines = fs.readFileSync(CONFIG.goldStandardPath, 'utf-8')
    .split('\n')
    .filter(line => line.trim());
    
  const goldExamples = goldLines.map(line => JSON.parse(line));
  console.log(`Found ${goldExamples.length} examples in Gold Standard.`);

  // 2. Load GCS URIs
  // Strategy:
  // A. Check Supabase for known mappings
  // B. Check local dataset files (dataset_2025-12-16.json, dataset_2025-12-18.json)
  // C. List files in GCS `fine-tuning/lab/` and match by timestamp for new entries
  
  console.log('Fetching GCS URIs from Supabase...');
  const { data: videos, error } = await supabase
    .from('analyzed_videos')
    .select('video_url, gcs_uri');
    
  let gcsMap = new Map();
  if (videos) {
    videos.forEach(v => {
      if (v.video_url && v.gcs_uri) {
        gcsMap.set(v.video_url, v.gcs_uri);
        gcsMap.set(v.video_url.split('?')[0], v.gcs_uri);
      }
    });
  }
  console.log(`Supabase map size: ${gcsMap.size}`);

  // Load from local datasets
  console.log('Loading local datasets for GCS URI resolution...');
  for (const dsPath of CONFIG.datasetPaths) {
    if (fs.existsSync(dsPath)) {
      try {
        console.log(`Reading ${path.basename(dsPath)}...`);
        const dataset = JSON.parse(fs.readFileSync(dsPath, 'utf-8'));
        if (dataset.videos) {
          dataset.videos.forEach(v => {
            if (v.video_url && v.gcs_uri) {
              const normUrl = v.video_url.split('?')[0];
              gcsMap.set(normUrl, v.gcs_uri);
              gcsMap.set(v.video_url, v.gcs_uri);
            }
          });
        }
      } catch (e) {
        console.warn(`Error reading ${dsPath}:`, e.message);
      }
    }
  }
  console.log(`Combined map size (Supabase + Local): ${gcsMap.size}`);

  // List GCS files for recovery
  console.log('Listing GCS files in fine-tuning/lab/ for recovery...');
  // const storage = new Storage({ projectId: CONFIG.projectId });
  // const bucket = storage.bucket(CONFIG.bucketName);
  
  const [files] = await bucket.getFiles({ prefix: 'fine-tuning/lab/' });
  console.log(`Found ${files.length} files in fine-tuning/lab/`);
  
  // Parse timestamps from filenames: lab_{timestamp}_...
  const labFiles = files.map(f => {
    const match = f.name.match(/lab_(\d+)_/);
    if (match) {
      return {
        name: f.name,
        uri: `gs://${CONFIG.bucketName}/${f.name}`,
        timestamp: parseInt(match[1])
      };
    }
    return null;
  }).filter(f => f !== null).sort((a, b) => a.timestamp - b.timestamp);

  // 3. Match and Format
  const validExamples = [];
  const missingGcs = [];

  for (const ex of goldExamples) {
    let gcsUri = gcsMap.get(ex.url) || gcsMap.get(ex.url.split('?')[0]);

    // If not found in Supabase, try to match by timestamp
    if (!gcsUri && ex.timestamp) {
      const saveTime = new Date(ex.timestamp).getTime();
      // Find the latest file created BEFORE the save time
      // Allow a window of e.g. 30 minutes (1800000 ms)
      const candidates = labFiles.filter(f => 
        f.timestamp < saveTime && (saveTime - f.timestamp) < 1800000
      );
      
      if (candidates.length > 0) {
        // Pick the closest one
        const bestMatch = candidates[candidates.length - 1];
        gcsUri = bestMatch.uri;
        // Remove used file to avoid double assignment? 
        // Maybe not, in case user saved same video twice.
        // But actually, if we have multiple saves close together, it might be tricky.
        // However, this is a good heuristic.
        console.log(`Recovered URI for ${ex.url.substring(0, 30)}... -> ${bestMatch.name} (diff: ${(saveTime - bestMatch.timestamp)/1000}s)`);
      }
    }

    if (!gcsUri) {
      missingGcs.push(ex.url);
      continue;
    }

    validExamples.push({
      gcs_uri: gcsUri,
      human_response: ex.analysis
    });
  }

  console.log(`\n✅ ${validExamples.length} examples matched with GCS URIs.`);
  if (missingGcs.length > 0) {
    console.warn(`⚠️  ${missingGcs.length} examples missing GCS URIs (skipped).`);
    console.warn('First 5 missing URLs:');
    missingGcs.slice(0, 5).forEach(url => console.warn(` - ${url}`));
    
    console.warn('\nFirst 5 available URLs in GCS Map:');
    let count = 0;
    for (const [url, uri] of gcsMap.entries()) {
      if (count++ >= 5) break;
      console.warn(` - ${url}`);
    }
  }

  if (validExamples.length === 0) {
    throw new Error('No valid examples found. Cannot proceed.');
  }

  // 4. Shuffle and Split
  const shuffled = [...validExamples].sort(() => Math.random() - 0.5);
  const splitIdx = Math.floor(shuffled.length * CONFIG.trainSplit);
  
  const trainExamples = shuffled.slice(0, splitIdx);
  const validationExamples = shuffled.slice(splitIdx);

  console.log(`   Train: ${trainExamples.length}`);
  console.log(`   Validation: ${validationExamples.length}`);

  // 5. Format for Vertex AI
  function formatExample(example) {
    const formatted = {
      contents: [
        {
          role: "user",
          parts: [
            {
              fileData: {
                fileUri: example.gcs_uri,
                mimeType: "video/mp4"
              }
            },
            {
              text: ANALYSIS_PROMPT
            }
          ]
        },
        {
          role: "model",
          parts: [
            {
              text: example.human_response
            }
          ]
        }
      ],
      generationConfig: {
        mediaResolution: "MEDIA_RESOLUTION_LOW"
      }
    };
    return JSON.stringify(formatted);
  }

  const trainJsonl = trainExamples.map(formatExample).join('\n');
  const validationJsonl = validationExamples.map(formatExample).join('\n');

  // 6. Save Locally
  const timestamp = new Date().toISOString().split('T')[0];
  const trainFilename = `train_v3_${timestamp}.jsonl`;
  const validationFilename = `validation_v3_${timestamp}.jsonl`;
  
  fs.writeFileSync(path.join(CONFIG.outputPath, trainFilename), trainJsonl);
  fs.writeFileSync(path.join(CONFIG.outputPath, validationFilename), validationJsonl);
  
  console.log(`\n💾 Local copies saved to ${CONFIG.outputPath}`);

  // 7. Upload to GCS
  // const storage = new Storage({ projectId: CONFIG.projectId });
  // const bucket = storage.bucket(CONFIG.bucketName);
  
  const trainGcsPath = `${CONFIG.trainingPath}/${trainFilename}`;
  const validationGcsPath = `${CONFIG.trainingPath}/${validationFilename}`;

  console.log('Uploading to GCS...');
  
  await bucket.file(trainGcsPath).save(trainJsonl, {
    contentType: 'application/jsonl',
    metadata: {
      recordCount: trainExamples.length.toString(),
      createdAt: new Date().toISOString()
    }
  });
  
  await bucket.file(validationGcsPath).save(validationJsonl, {
    contentType: 'application/jsonl',
    metadata: {
      recordCount: validationExamples.length.toString(),
      createdAt: new Date().toISOString()
    }
  });

  const trainUri = `gs://${CONFIG.bucketName}/${trainGcsPath}`;
  const validationUri = `gs://${CONFIG.bucketName}/${validationGcsPath}`;

  console.log(`\n☁️  Uploaded to GCS:`);
  console.log(`   Train: ${trainUri}`);
  console.log(`   Validation: ${validationUri}`);

  // 8. Update latest_uris.json so the main script can use it
  const stats = {
    totalExamples: validExamples.length,
    trainCount: trainExamples.length,
    validationCount: validationExamples.length,
    source: 'gold_standard.jsonl'
  };

  fs.writeFileSync(
    path.join(CONFIG.outputPath, 'latest_uris.json'),
    JSON.stringify({ trainUri, validationUri, timestamp, stats }, null, 2)
  );
  
  console.log('\n✅ Preparation complete. Ready to train.');
}

main().catch(console.error);
