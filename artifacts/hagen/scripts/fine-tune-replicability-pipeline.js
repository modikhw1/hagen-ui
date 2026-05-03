#!/usr/bin/env node
/**
 * Replicability Fine-Tuning Pipeline (Multimodal)
 * 
 * Pipeline for fine-tuning Gemini on Replicability Analysis (Video + Text -> Text).
 * 
 * Usage:
 *   node scripts/fine-tune-replicability-pipeline.js prepare    # Prepare training data & upload to GCS
 *   node scripts/fine-tune-replicability-pipeline.js train      # Submit fine-tuning job
 *   node scripts/fine-tune-replicability-pipeline.js status     # Check job status
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
  baseModel: 'gemini-2.5-flash', // Multimodal supported model
  
  // Hyperparameters
  epochs: 4,
  learningRateMultiplier: 1.0,
  
  // Data split
  trainSplit: 0.85,
  
  // Paths
  datasetPath: path.join(__dirname, '../datasets/replicability_dataset_2025-12-23.json'),
  outputPath: path.join(__dirname, '../datasets/fine-tuning'),
  
  // Versioning
  version: 'v2-multimodal'
};

const ANALYSIS_PROMPT = `Analysera denna video ur ett replikerbarhetsperspektiv.
Bedöm hur enkelt eller svårt det är för ett företag att återskapa detta koncept.

Fokusera på:
1. Vad händer i videon? (Konkret beskrivning)
2. Vilka resurser krävs? (Plats, utrustning, personal)
3. Hur komplex är redigeringen?
4. Vad är svårighetsgraden för replikering?

Ge en neutral, strukturerad analys på svenska.`;

class ReplicabilityFinetuner {
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
   * STEP 1: Prepare training data and upload to GCS
   */
  async prepareTrainingData() {
    console.log(`📊 Preparing multimodal training data for ${CONFIG.version}...\n`);
    
    if (!fs.existsSync(CONFIG.datasetPath)) {
      throw new Error(`Dataset not found at ${CONFIG.datasetPath}`);
    }

    const rawData = JSON.parse(fs.readFileSync(CONFIG.datasetPath, 'utf8'));
    
    // Filter for VERIFIED entries
    const verifiedEntries = rawData.filter(d => d.translation_status === 'verified');
    
    if (verifiedEntries.length === 0) {
      throw new Error('No verified entries found. Please verify entries in the lab first.');
    }

    console.log(`Found ${verifiedEntries.length} verified entries.`);

    // Get video IDs
    const videoIds = verifiedEntries.map(e => e.video_id);
    
    // Fetch GCS URIs from Supabase
    const { data: videos, error } = await this.supabase
      .from('analyzed_videos')
      .select('id, gcs_uri')
      .in('id', videoIds);
    
    if (error) throw error;
    
    // Create mapping
    const gcsMap = new Map((videos || [])
      .filter(v => v.gcs_uri)
      .map(v => [v.id, v.gcs_uri]));
      
    console.log(`Found GCS URIs for ${gcsMap.size} videos.`);

    // Convert to Vertex AI Multimodal format
    const examples = [];
    
    for (const entry of verifiedEntries) {
      const gcsUri = gcsMap.get(entry.video_id);
      if (!gcsUri) {
        console.warn(`⚠️ Skipping video ${entry.video_id} (No GCS URI)`);
        continue;
      }

      // Construct the example
      const example = {
        contents: [
          {
            role: "user",
            parts: [
              {
                fileData: {
                  fileUri: gcsUri,
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
                text: entry.replicability_analysis
              }
            ]
          }
        ]
      };
      
      examples.push(example);
    }

    // Split into Train/Validation
    const shuffled = examples.sort(() => 0.5 - Math.random());
    const splitIndex = Math.floor(shuffled.length * CONFIG.trainSplit);
    const trainData = shuffled.slice(0, splitIndex);
    const valData = shuffled.slice(splitIndex);

    console.log(`Training samples: ${trainData.length}`);
    console.log(`Validation samples: ${valData.length}`);

    // Save local files
    const trainFileName = `replicability_train_${CONFIG.version}.jsonl`;
    const valFileName = `replicability_validation_${CONFIG.version}.jsonl`;
    const trainPath = path.join(CONFIG.outputPath, trainFileName);
    const valPath = path.join(CONFIG.outputPath, valFileName);

    fs.writeFileSync(trainPath, trainData.map(e => JSON.stringify(e)).join('\n'));
    fs.writeFileSync(valPath, valData.map(e => JSON.stringify(e)).join('\n'));

    console.log(`\n💾 Saved local files to ${CONFIG.outputPath}`);

    // Upload to GCS
    console.log(`\n☁️ Uploading to GCS bucket: ${CONFIG.bucketName}...`);
    
    const trainUri = await this.uploadToGCS(trainPath, `fine-tuning/replicability/${trainFileName}`);
    const valUri = await this.uploadToGCS(valPath, `fine-tuning/replicability/${valFileName}`);

    // Save URIs for the training step
    const manifestPath = path.join(CONFIG.outputPath, `replicability_uris_${CONFIG.version}.json`);
    fs.writeFileSync(manifestPath, JSON.stringify({ trainUri, valUri }, null, 2));
    
    console.log(`✅ Data preparation complete! URIs saved to ${manifestPath}`);
  }

  async uploadToGCS(filePath, destination) {
    const bucket = this.storage.bucket(CONFIG.bucketName);
    const [file] = await bucket.upload(filePath, {
      destination,
      metadata: {
        contentType: 'application/jsonl',
      },
    });
    const uri = `gs://${CONFIG.bucketName}/${destination}`;
    console.log(`   Uploaded: ${uri}`);
    return uri;
  }

  /**
   * STEP 2: Submit Fine-Tuning Job
   */
  async submitTuningJob() {
    console.log(`🚀 Submitting Fine-Tuning Job for ${CONFIG.version}...\n`);

    const manifestPath = path.join(CONFIG.outputPath, `replicability_uris_${CONFIG.version}.json`);
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`URI manifest not found. Run 'prepare' first.`);
    }

    const { trainUri, valUri } = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const displayName = `replicability-${CONFIG.version}-${new Date().toISOString().slice(0,10)}`;

    const requestBody = {
      baseModel: CONFIG.baseModel,
      supervisedTuningSpec: {
        trainingDatasetUri: trainUri,
        validationDatasetUri: valUri,
        hyperParameters: {
          epochCount: CONFIG.epochs,
          learningRateMultiplier: CONFIG.learningRateMultiplier
        }
      },
      tunedModelDisplayName: displayName
    };

    console.log('Configuration:', JSON.stringify(requestBody, null, 2));

    const token = await this.getAccessToken();
    const endpoint = `${this.apiEndpoint}/projects/${CONFIG.projectId}/locations/${CONFIG.location}/tuningJobs`;

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
      throw new Error(`Failed to submit job: ${error}`);
    }

    const job = await response.json();
    console.log(`\n✅ Job submitted successfully!`);
    console.log(`Job Name: ${job.name}`);
    console.log(`State: ${job.state}`);

    // Save active job
    fs.writeFileSync(
      path.join(CONFIG.outputPath, 'replicability_active_job.json'),
      JSON.stringify({ ...job, submittedAt: new Date() }, null, 2)
    );
  }

  /**
   * STEP 3: Check Status
   */
  async checkStatus() {
    const jobPath = path.join(CONFIG.outputPath, 'replicability_active_job.json');
    if (!fs.existsSync(jobPath)) {
      console.log('No active job found.');
      return;
    }

    const jobInfo = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
    const token = await this.getAccessToken();
    
    // The job name is a full path: projects/.../locations/.../tuningJobs/...
    const endpoint = `https://${CONFIG.location}-aiplatform.googleapis.com/v1/${jobInfo.name}`;

    const response = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      throw new Error(`Failed to get status: ${await response.text()}`);
    }

    const job = await response.json();
    console.log(`📊 Job Status: ${job.state}`);
    console.log(`Created: ${job.createTime}`);
    
    if (job.error) {
      console.error('❌ Error:', job.error);
    }

    if (job.tunedModel) {
      console.log(`\n🎉 Model Ready: ${job.tunedModel.model}`);
    }
  }
}

// CLI Handler
const command = process.argv[2];
const tuner = new ReplicabilityFinetuner();

(async () => {
  try {
    switch (command) {
      case 'prepare':
        await tuner.prepareTrainingData();
        break;
      case 'train':
        await tuner.submitTuningJob();
        break;
      case 'status':
        await tuner.checkStatus();
        break;
      default:
        console.log('Usage: node scripts/fine-tune-replicability-pipeline.js [prepare|train|status]');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
