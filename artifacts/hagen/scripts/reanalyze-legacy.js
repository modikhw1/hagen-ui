const fs = require('fs');
const path = require('path');
const { GoogleAuth } = require('google-auth-library');
require('dotenv').config({ path: '.env.local' });

// Configuration
const CONFIG = {
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  location: 'us-central1',
  tunedModelPath: path.join(__dirname, '../datasets/fine-tuning/tuned_model.json'),
  goldStandardPath: path.join(__dirname, '../datasets/fine-tuning/gold_standard.jsonl'),
  questionBatteryPath: path.join(__dirname, '../datasets/question_battery.json'),
  datasetPath: path.join(__dirname, '../datasets/dataset_2025-12-16.json'),
  outputPath: path.join(__dirname, '../datasets/fine-tuning/legacy_review.txt')
};

async function main() {
  console.log('🔄 Starting Legacy Re-analysis with Model V3...\n');

  // 1. Load Tuned Model Info
  if (!fs.existsSync(CONFIG.tunedModelPath)) {
    throw new Error('No tuned model found. Run training first.');
  }
  const modelInfo = JSON.parse(fs.readFileSync(CONFIG.tunedModelPath, 'utf-8'));
  const endpointId = modelInfo.endpoint.split('/').pop();
  const project = modelInfo.endpoint.split('/')[1];
  const location = modelInfo.endpoint.split('/')[3];
  
  // Construct the prediction endpoint URL
  const apiEndpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/endpoints/${endpointId}:generateContent`;
  
  console.log(`🤖 Using Model V3 Endpoint: ${endpointId}`);

  // 2. Load Existing Gold Standard (to avoid duplicates)
  const existingUrls = new Set();
  if (fs.existsSync(CONFIG.goldStandardPath)) {
    const lines = fs.readFileSync(CONFIG.goldStandardPath, 'utf-8').split('\n').filter(l => l.trim());
    lines.forEach(line => {
      try {
        const json = JSON.parse(line);
        if (json.url) {
          existingUrls.add(json.url);
          existingUrls.add(json.url.split('?')[0]); // Normalize
        }
      } catch (e) {}
    });
  }
  console.log(`🚫 Skipping ${existingUrls.size} videos already in Gold Standard.`);

  // 3. Load Lookup Map (Video ID -> GCS URI / URL)
  console.log('🗺️  Building GCS Map...');
  const dataset = JSON.parse(fs.readFileSync(CONFIG.datasetPath, 'utf-8'));
  const videoMap = new Map(); // ID -> { url, gcs_uri }
  
  dataset.videos.forEach(v => {
    if (v.id) {
      videoMap.set(v.id, {
        url: v.video_url,
        gcs_uri: v.gcs_uri
      });
    }
  });

  // 4. Load Legacy Data
  const battery = JSON.parse(fs.readFileSync(CONFIG.questionBatteryPath, 'utf-8'));
  const legacyExamples = battery.examples;
  console.log(`📚 Found ${legacyExamples.length} legacy examples.`);

  // 5. Prepare Auth
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  // 6. Process
  let processedCount = 0;
  let skippedCount = 0;
  
  // Clear output file initially
  fs.writeFileSync(CONFIG.outputPath, `LEGACY REVIEW LIST - Generated ${new Date().toISOString()}\n\n`);

  for (const ex of legacyExamples) {
    const videoInfo = videoMap.get(ex.video_id);
    
    if (!videoInfo || !videoInfo.gcs_uri) {
      console.log(`⚠️  Skipping ID ${ex.video_id} (No GCS URI found)`);
      continue;
    }

    // Check for duplicates
    const normUrl = videoInfo.url.split('?')[0];
    if (existingUrls.has(videoInfo.url) || existingUrls.has(normUrl)) {
      skippedCount++;
      process.stdout.write('.'); // Progress dot
      continue;
    }

    console.log(`\n⚡ Analyzing: ${videoInfo.url}`);
    
    const oldNotes = ex.human_said || "Inga tidigare noteringar.";
    
    const prompt = `
Analysera denna video enligt formatet "Short & Sharp".

Här är tidigare anteckningar/rättningar från en människa om videon (som kan vara i ett annat format):
"${oldNotes}"

Din uppgift:
1. Gör en ny analys av videon.
2. Integrera insikterna från de tidigare anteckningarna (om de är korrekta och relevanta).
3. Följ strikt detta format:

**Handling:** [En mening om vad som sker]
**Mekanism:** [Nyckelord: t.ex. Subversion, Igenkänning]
**Varför:** [En mening om poängen]
**Målgrupp:** [Specifik demografi/intresse]

Håll det extremt kort. Inget fluff.
`;

    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { fileData: { mimeType: 'video/mp4', fileUri: videoInfo.gcs_uri } },
              { text: prompt }
            ]
          }],
          generationConfig: {
            temperature: 0.4, // Lower temp for more adherence to instructions
            maxOutputTokens: 1024
          }
        })
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }

      const result = await response.json();
      const analysis = result.candidates?.[0]?.content?.parts?.[0]?.text || 'No analysis generated';

      // Append to review file
      const outputBlock = `
================================================================================
URL: ${videoInfo.url}
--------------------------------------------------------------------------------
[OLD NOTES]:
${oldNotes}
--------------------------------------------------------------------------------
[V3 ANALYSIS]:
${analysis}
================================================================================
\n`;

      fs.appendFileSync(CONFIG.outputPath, outputBlock);
      processedCount++;
      console.log(`✅ Processed (${processedCount})`);

    } catch (e) {
      console.error(`❌ Failed: ${e.message}`);
    }
  }

  console.log(`\n\n🏁 Done!`);
  console.log(`   Processed: ${processedCount}`);
  console.log(`   Skipped (Duplicates): ${skippedCount}`);
  console.log(`   Output saved to: ${CONFIG.outputPath}`);
}

main().catch(console.error);
