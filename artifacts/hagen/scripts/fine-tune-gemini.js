#!/usr/bin/env node
/**
 * Gemini Fine-Tuning Pipeline
 * 
 * Complete pipeline for fine-tuning Gemini on humor analysis.
 * Based on GEMINI_FINETUNING_SPEC.md
 * 
 * Usage:
 *   node scripts/fine-tune-gemini.js prepare    # Prepare training data
 *   node scripts/fine-tune-gemini.js train      # Submit fine-tuning job
 *   node scripts/fine-tune-gemini.js status     # Check job status
 *   node scripts/fine-tune-gemini.js evaluate   # Evaluate tuned model
 *   node scripts/fine-tune-gemini.js run        # Full pipeline
 */

const { createClient } = require('@supabase/supabase-js');
const { Storage } = require('@google-cloud/storage');
const { GoogleAuth } = require('google-auth-library');
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  location: 'us-central1',
  bucketName: process.env.GOOGLE_CLOUD_STORAGE_BUCKET || 'hagen-video-analysis',
  baseModel: 'gemini-2.5-flash', // Supports video tuning per Google docs
  
  // Hyperparameters
  epochs: 4,
  learningRateMultiplier: 1.0,
  
  // Data split
  trainSplit: 0.85,
  
  // Paths
  trainingPath: 'fine-tuning/humor-analysis',
  outputPath: path.join(__dirname, '../datasets/fine-tuning')
};

// The analysis prompt - what we ask the model
const ANALYSIS_PROMPT = `Analysera denna video. Förklara vad som händer och varför det är roligt eller effektivt.

Fokusera på:
1. Vad händer i videon? (Konkret beskrivning)
2. Vad är humormekanismen? (Subversion, timing, kontrast, etc.)
3. Varför fungerar det? (Psykologisk/social förklaring)
4. Vem uppskattar detta? (Målgrupp)

Var specifik och undvik generiska beskrivningar.`;

class GeminiFinetuner {
  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    this.storage = new Storage({ projectId: CONFIG.projectId });
    
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    
    this.apiEndpoint = `https://${CONFIG.location}-aiplatform.googleapis.com/v1`;
  }

  async getAccessToken() {
    const client = await this.auth.getClient();
    const tokenResponse = await client.getAccessToken();
    return tokenResponse.token;
  }

  /**
   * STEP 1: Prepare training data from Supabase + question_battery.json
   */
  async prepareTrainingData() {
    console.log('📊 Preparing training data...\n');
    
    // Load question battery
    const questionBatteryPath = path.join(__dirname, '../datasets/question_battery.json');
    const questionBattery = JSON.parse(fs.readFileSync(questionBatteryPath, 'utf-8'));
    
    // Get video IDs
    const videoIds = [...new Set(questionBattery.examples.map(e => e.video_id))];
    console.log(`Found ${videoIds.length} unique videos in question battery`);
    
    // Fetch GCS URIs from Supabase
    const { data: videos, error } = await this.supabase
      .from('analyzed_videos')
      .select('id, video_url, gcs_uri')
      .in('id', videoIds);
    
    if (error) throw error;
    
    // Create mapping
    const gcsMap = new Map((videos || [])
      .filter(v => v.gcs_uri)
      .map(v => [v.id, v.gcs_uri]));
    
    console.log(`${gcsMap.size} videos have GCS URIs`);
    
    // Build training examples
    const examples = [];
    
    for (const ex of questionBattery.examples) {
      const gcsUri = gcsMap.get(ex.video_id);
      if (!gcsUri) continue;
      if (!ex.human_said || ex.human_said.length < 50) continue;
      
      examples.push({
        video_id: ex.video_id,
        gcs_uri: gcsUri,
        human_response: ex.human_said,
        gemini_original: ex.gemini_said,
        gap_type: ex.gap_classification?.primary_gap
      });
    }
    
    console.log(`\n✅ ${examples.length} examples ready for training`);
    
    // Shuffle
    const shuffled = [...examples].sort(() => Math.random() - 0.5);
    
    // Split
    const splitIdx = Math.floor(shuffled.length * CONFIG.trainSplit);
    const trainExamples = shuffled.slice(0, splitIdx);
    const validationExamples = shuffled.slice(splitIdx);
    
    console.log(`   Train: ${trainExamples.length}`);
    console.log(`   Validation: ${validationExamples.length}`);
    
    // Convert to Vertex AI format
    const trainJsonl = trainExamples.map(ex => this.formatExample(ex)).join('\n');
    const validationJsonl = validationExamples.map(ex => this.formatExample(ex)).join('\n');
    
    // Save locally for inspection
    if (!fs.existsSync(CONFIG.outputPath)) {
      fs.mkdirSync(CONFIG.outputPath, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().split('T')[0];
    fs.writeFileSync(
      path.join(CONFIG.outputPath, `train_${timestamp}.jsonl`),
      trainJsonl
    );
    fs.writeFileSync(
      path.join(CONFIG.outputPath, `validation_${timestamp}.jsonl`),
      validationJsonl
    );
    
    console.log(`\n💾 Local copies saved to ${CONFIG.outputPath}`);
    
    // Upload to GCS
    const bucket = this.storage.bucket(CONFIG.bucketName);
    const trainPath = `${CONFIG.trainingPath}/train_${timestamp}.jsonl`;
    const validationPath = `${CONFIG.trainingPath}/validation_${timestamp}.jsonl`;
    
    await bucket.file(trainPath).save(trainJsonl, {
      contentType: 'application/jsonl',
      metadata: {
        recordCount: trainExamples.length.toString(),
        createdAt: new Date().toISOString()
      }
    });
    
    await bucket.file(validationPath).save(validationJsonl, {
      contentType: 'application/jsonl',
      metadata: {
        recordCount: validationExamples.length.toString(),
        createdAt: new Date().toISOString()
      }
    });
    
    const trainUri = `gs://${CONFIG.bucketName}/${trainPath}`;
    const validationUri = `gs://${CONFIG.bucketName}/${validationPath}`;
    
    console.log(`\n☁️  Uploaded to GCS:`);
    console.log(`   Train: ${trainUri}`);
    console.log(`   Validation: ${validationUri}`);
    
    // Gap type distribution
    const gapDist = {};
    for (const ex of examples) {
      const gap = ex.gap_type || 'UNKNOWN';
      gapDist[gap] = (gapDist[gap] || 0) + 1;
    }
    
    const stats = {
      totalExamples: examples.length,
      trainCount: trainExamples.length,
      validationCount: validationExamples.length,
      gapDistribution: gapDist,
      avgResponseLength: Math.round(
        examples.reduce((a, e) => a + e.human_response.length, 0) / examples.length
      )
    };
    
    console.log('\n📈 Statistics:');
    console.log(JSON.stringify(stats, null, 2));
    
    // Save URIs for training step
    fs.writeFileSync(
      path.join(CONFIG.outputPath, 'latest_uris.json'),
      JSON.stringify({ trainUri, validationUri, timestamp, stats }, null, 2)
    );
    
    return { trainUri, validationUri, stats };
  }

  /**
   * Format a single example for Vertex AI video fine-tuning
   * Format according to: https://cloud.google.com/vertex-ai/generative-ai/docs/models/tune-gemini-video
   */
  formatExample(example) {
    // Clean the human response - remove references to "AI said" or corrections
    let cleanedResponse = example.human_response;
    
    // Remove phrases that reference what AI said
    cleanedResponse = cleanedResponse
      .replace(/Almost a completely correct analysis\.?\s*/gi, '')
      .replace(/AI (should|missed|failed|didn't|overlooked).*?\./gi, '')
      .replace(/The AI.*?\./gi, '')
      .replace(/Gemini (said|missed|should).*?\./gi, '')
      .trim();
    
    // Format per Google's video tuning documentation:
    // - fileData BEFORE text in parts array
    // - generationConfig at top level with mediaResolution
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
              text: cleanedResponse
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

  /**
   * STEP 2: Submit fine-tuning job to Vertex AI
   */
  async submitTuningJob(trainUri, validationUri) {
    console.log('🚀 Submitting fine-tuning job...\n');
    
    // Load URIs if not provided
    if (!trainUri || !validationUri) {
      const urisPath = path.join(CONFIG.outputPath, 'latest_uris.json');
      if (!fs.existsSync(urisPath)) {
        throw new Error('No training data URIs found. Run "prepare" first.');
      }
      const uris = JSON.parse(fs.readFileSync(urisPath, 'utf-8'));
      trainUri = uris.trainUri;
      validationUri = uris.validationUri;
    }
    
    console.log('Training data:', trainUri);
    console.log('Validation data:', validationUri);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const displayName = `humor-analysis-v4-${timestamp}`;
    
    const endpoint = `${this.apiEndpoint}/projects/${CONFIG.projectId}/locations/${CONFIG.location}/tuningJobs`;
    
    const requestBody = {
      baseModel: CONFIG.baseModel,
      supervisedTuningSpec: {
        trainingDatasetUri: trainUri,
        validationDatasetUri: validationUri,
        hyperParameters: {
          epochCount: CONFIG.epochs,
          learningRateMultiplier: CONFIG.learningRateMultiplier
        }
      },
      tunedModelDisplayName: displayName
    };
    
    console.log('\nConfiguration:');
    console.log(JSON.stringify({
      baseModel: CONFIG.baseModel,
      epochs: CONFIG.epochs,
      learningRateMultiplier: CONFIG.learningRateMultiplier,
      adapterSize: CONFIG.adapterSize
    }, null, 2));
    
    const token = await this.getAccessToken();
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Failed to submit job:', error);
      throw new Error(`Failed to submit tuning job: ${error}`);
    }
    
    const job = await response.json();
    
    console.log('\n✅ Tuning job submitted!');
    console.log('Job name:', job.name);
    console.log('Display name:', displayName);
    
    // Save job info
    fs.writeFileSync(
      path.join(CONFIG.outputPath, 'active_job.json'),
      JSON.stringify({
        name: job.name,
        displayName,
        submittedAt: new Date().toISOString(),
        config: requestBody
      }, null, 2)
    );
    
    return {
      name: job.name,
      displayName,
      state: job.state || 'JOB_STATE_PENDING'
    };
  }

  /**
   * STEP 3: Check job status
   */
  async checkStatus() {
    const jobPath = path.join(CONFIG.outputPath, 'active_job.json');
    
    if (!fs.existsSync(jobPath)) {
      console.log('No active job found. Run "train" first.');
      
      // List all jobs
      console.log('\nListing all tuning jobs...');
      const jobs = await this.listAllJobs();
      
      if (jobs.length === 0) {
        console.log('No tuning jobs found.');
        return null;
      }
      
      console.log(`\nFound ${jobs.length} jobs:`);
      for (const job of jobs.slice(0, 5)) {
        console.log(`  ${job.displayName}: ${job.state}`);
      }
      
      return jobs[0];
    }
    
    const jobInfo = JSON.parse(fs.readFileSync(jobPath, 'utf-8'));
    const token = await this.getAccessToken();
    
    const response = await fetch(`${this.apiEndpoint}/${jobInfo.name}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get job status: ${await response.text()}`);
    }
    
    const job = await response.json();
    
    console.log('📊 Job Status\n');
    console.log('Name:', job.tunedModelDisplayName);
    console.log('State:', job.state);
    console.log('Created:', job.createTime);
    console.log('Updated:', job.updateTime);
    
    if (job.tunedModel) {
      console.log('\n🎉 Model ready!');
      console.log('Model:', job.tunedModel.model);
      console.log('Endpoint:', job.tunedModel.endpoint);
      
      // Save tuned model info
      fs.writeFileSync(
        path.join(CONFIG.outputPath, 'tuned_model.json'),
        JSON.stringify({
          model: job.tunedModel.model,
          endpoint: job.tunedModel.endpoint,
          completedAt: new Date().toISOString()
        }, null, 2)
      );
    }
    
    if (job.error) {
      console.log('\n❌ Error:', job.error.message);
    }
    
    return {
      name: job.name,
      displayName: job.tunedModelDisplayName,
      state: job.state,
      createTime: job.createTime,
      updateTime: job.updateTime,
      tunedModel: job.tunedModel,
      error: job.error
    };
  }

  /**
   * List all tuning jobs
   */
  async listAllJobs() {
    const endpoint = `${this.apiEndpoint}/projects/${CONFIG.projectId}/locations/${CONFIG.location}/tuningJobs`;
    const token = await this.getAccessToken();
    
    const response = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to list jobs: ${await response.text()}`);
    }
    
    const data = await response.json();
    
    return (data.tuningJobs || []).map(job => ({
      name: job.name,
      displayName: job.tunedModelDisplayName,
      state: job.state,
      createTime: job.createTime,
      updateTime: job.updateTime,
      tunedModel: job.tunedModel,
      error: job.error
    }));
  }

  /**
   * STEP 4: Evaluate the tuned model
   */
  async evaluate() {
    const modelPath = path.join(CONFIG.outputPath, 'tuned_model.json');
    
    if (!fs.existsSync(modelPath)) {
      console.log('No tuned model found. Checking job status...');
      const status = await this.checkStatus();
      if (!status?.tunedModel) {
        console.log('Model not ready yet.');
        return;
      }
    }
    
    const modelInfo = JSON.parse(fs.readFileSync(modelPath, 'utf-8'));
    console.log('🧪 Evaluating tuned model...\n');
    console.log('Model:', modelInfo.model);
    
    // Get a few test videos
    const { data: testVideos } = await this.supabase
      .from('analyzed_videos')
      .select('id, video_url, gcs_uri')
      .not('gcs_uri', 'is', null)
      .limit(5);
    
    if (!testVideos?.length) {
      console.log('No test videos found.');
      return;
    }
    
    const token = await this.getAccessToken();
    
    for (const video of testVideos) {
      console.log(`\n--- Testing: ${video.video_url} ---`);
      
      try {
        const response = await this.generateWithTunedModel(
          modelInfo.endpoint,
          video.gcs_uri,
          token
        );
        
        console.log('Response (truncated):');
        console.log(response.slice(0, 500));
      } catch (err) {
        console.log('Error:', err.message);
      }
    }
  }

  /**
   * Generate content with the tuned model
   */
  async generateWithTunedModel(endpoint, gcsUri, token) {
    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [
            { text: ANALYSIS_PROMPT },
            {
              fileData: {
                mimeType: "video/mp4",
                fileUri: gcsUri
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048,
        mediaResolution: "MEDIA_RESOLUTION_LOW"
      }
    };
    
    const response = await fetch(`${endpoint}:generateContent`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      throw new Error(`Generation failed: ${await response.text()}`);
    }
    
    const result = await response.json();
    return result.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  /**
   * Full pipeline
   */
  async runFullPipeline() {
    console.log('🔥 Running full fine-tuning pipeline\n');
    console.log('='.repeat(60) + '\n');

    // Step 1: Prepare data
    console.log('STEP 1: PREPARE TRAINING DATA');
    console.log('-'.repeat(40));
    const { trainUri, validationUri, stats } = await this.prepareTrainingData();

    console.log('\n' + '='.repeat(60) + '\n');

    // Step 2: Submit job
    console.log('STEP 2: SUBMIT FINE-TUNING JOB');
    console.log('-'.repeat(40));
    const job = await this.submitTuningJob(trainUri, validationUri);

    console.log('\n' + '='.repeat(60) + '\n');

    console.log('✅ Pipeline initiated successfully!\n');
    console.log('Next steps:');
    console.log('1. Run "node scripts/fine-tune-gemini.js status" to check progress');
    console.log('2. Training typically takes 1-4 hours');
    console.log('3. Once complete, run "node scripts/fine-tune-gemini.js evaluate"');
  }

  /**
   * Train unified model from pre-merged dataset
   * Uses datasets generated by merge-training-datasets.js
   */
  async trainUnified() {
    console.log('🔀 Training Unified Model (Humor + Replicability)\n');

    // Find the most recent unified dataset
    const files = fs.readdirSync(CONFIG.outputPath);
    const trainFiles = files.filter(f => f.startsWith('unified_train_') && f.endsWith('.jsonl'));

    if (trainFiles.length === 0) {
      console.error('❌ No unified dataset found.');
      console.log('   Run: node scripts/merge-training-datasets.js --upload');
      return;
    }

    // Sort by date and get latest
    trainFiles.sort().reverse();
    const latestTrainFile = trainFiles[0];
    const latestValidationFile = latestTrainFile.replace('train', 'validation');

    console.log(`📁 Using datasets:`);
    console.log(`   Train: ${latestTrainFile}`);
    console.log(`   Validation: ${latestValidationFile}`);

    // Check if unified_latest_uris.json exists (from GCS upload)
    const urisPath = path.join(CONFIG.outputPath, 'unified_latest_uris.json');
    let trainUri, validationUri;

    if (fs.existsSync(urisPath)) {
      const uris = JSON.parse(fs.readFileSync(urisPath, 'utf-8'));
      trainUri = uris.trainUri;
      validationUri = uris.validationUri;
      console.log(`\n☁️  Using GCS URIs from previous upload`);
    } else {
      // Need to upload
      console.log(`\n☁️  Uploading to GCS...`);

      const trainContent = fs.readFileSync(path.join(CONFIG.outputPath, latestTrainFile), 'utf-8');
      const validationContent = fs.readFileSync(path.join(CONFIG.outputPath, latestValidationFile), 'utf-8');

      const bucket = this.storage.bucket(CONFIG.bucketName);
      const timestamp = latestTrainFile.match(/unified_train_(.+)\.jsonl/)?.[1] || new Date().toISOString().split('T')[0];

      const gcsTrainPath = `fine-tuning/unified/unified_train_${timestamp}.jsonl`;
      const gcsValidationPath = `fine-tuning/unified/unified_validation_${timestamp}.jsonl`;

      await bucket.file(gcsTrainPath).save(trainContent, { contentType: 'application/jsonl' });
      await bucket.file(gcsValidationPath).save(validationContent, { contentType: 'application/jsonl' });

      trainUri = `gs://${CONFIG.bucketName}/${gcsTrainPath}`;
      validationUri = `gs://${CONFIG.bucketName}/${gcsValidationPath}`;

      // Save URIs
      fs.writeFileSync(urisPath, JSON.stringify({ trainUri, validationUri, timestamp }, null, 2));
    }

    console.log(`   Train: ${trainUri}`);
    console.log(`   Validation: ${validationUri}`);

    // Count examples
    const trainLines = fs.readFileSync(path.join(CONFIG.outputPath, latestTrainFile), 'utf-8')
      .split('\n').filter(l => l.trim()).length;
    const validationLines = fs.readFileSync(path.join(CONFIG.outputPath, latestValidationFile), 'utf-8')
      .split('\n').filter(l => l.trim()).length;

    console.log(`\n📊 Dataset size:`);
    console.log(`   Training: ${trainLines} examples`);
    console.log(`   Validation: ${validationLines} examples`);
    console.log(`   Total: ${trainLines + validationLines} examples`);

    // Submit job with unified model name
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const displayName = `unified-humor-replicability-v1-${timestamp}`;

    const endpoint = `${this.apiEndpoint}/projects/${CONFIG.projectId}/locations/${CONFIG.location}/tuningJobs`;

    const requestBody = {
      baseModel: CONFIG.baseModel,
      supervisedTuningSpec: {
        trainingDatasetUri: trainUri,
        validationDatasetUri: validationUri,
        hyperParameters: {
          epochCount: CONFIG.epochs,
          learningRateMultiplier: CONFIG.learningRateMultiplier
        }
      },
      tunedModelDisplayName: displayName
    };

    console.log(`\n🚀 Submitting unified fine-tuning job...`);
    console.log(`   Model name: ${displayName}`);
    console.log(`   Base model: ${CONFIG.baseModel}`);
    console.log(`   Epochs: ${CONFIG.epochs}`);

    const token = await this.getAccessToken();

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Failed to submit job:', error);
      throw new Error(`Failed to submit tuning job: ${error}`);
    }

    const job = await response.json();

    console.log('\n✅ Unified training job submitted!');
    console.log('Job name:', job.name);

    // Save job info
    fs.writeFileSync(
      path.join(CONFIG.outputPath, 'active_job.json'),
      JSON.stringify({
        name: job.name,
        displayName,
        type: 'unified',
        submittedAt: new Date().toISOString(),
        config: requestBody
      }, null, 2)
    );

    console.log('\n📝 Next steps:');
    console.log('   1. Run "node scripts/fine-tune-gemini.js status" to check progress');
    console.log('   2. Training typically takes 1-4 hours');
    console.log('   3. The unified model will handle both humor and replicability analysis');

    return { name: job.name, displayName };
  }
}

// CLI
async function main() {
  const command = process.argv[2] || 'help';
  const finetuner = new GeminiFinetuner();

  switch (command) {
    case 'prepare':
      await finetuner.prepareTrainingData();
      break;

    case 'train':
      await finetuner.submitTuningJob();
      break;

    case 'train-unified':
      await finetuner.trainUnified();
      break;

    case 'status':
      await finetuner.checkStatus();
      break;

    case 'evaluate':
      await finetuner.evaluate();
      break;

    case 'run':
      await finetuner.runFullPipeline();
      break;

    case 'help':
    default:
      console.log(`
Gemini Fine-Tuning Pipeline

Usage:
  node scripts/fine-tune-gemini.js <command>

Commands:
  prepare        Prepare training data from question_battery.json + Supabase
  train          Submit fine-tuning job to Vertex AI (humor only)
  train-unified  Train unified model (humor + replicability combined)
  status         Check status of current training job
  evaluate       Test the tuned model on sample videos
  run            Run full pipeline (prepare + train)
  help           Show this help message

Unified Model Workflow:
  1. node scripts/merge-training-datasets.js    # Merge humor + replicability
  2. node scripts/fine-tune-gemini.js train-unified  # Train unified model
  3. node scripts/fine-tune-gemini.js status    # Check progress

Configuration (in script):
  - Base model: ${CONFIG.baseModel}
  - Epochs: ${CONFIG.epochs}
  - Learning rate multiplier: ${CONFIG.learningRateMultiplier}
  - Train split: ${CONFIG.trainSplit * 100}%
`);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
