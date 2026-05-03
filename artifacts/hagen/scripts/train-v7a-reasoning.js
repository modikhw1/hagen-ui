#!/usr/bin/env node
/**
 * Train v7.A with 75 Reasoning Chain Examples
 *
 * Uses the reasoning-chain-v7A-complete.jsonl dataset which teaches:
 * - Reject obvious interpretation
 * - Evidence-based reasoning
 * - Structural pattern recognition
 */

const { Storage } = require('@google-cloud/storage');
const { GoogleAuth } = require('google-auth-library');
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');

const CONFIG = {
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  location: 'us-central1',
  bucketName: process.env.GOOGLE_CLOUD_STORAGE_BUCKET || 'hagen-video-analysis',
  baseModel: 'gemini-2.5-flash',
  epochs: 4,
  learningRateMultiplier: 1.0,
  trainSplit: 0.85,
  outputPath: path.join(__dirname, '../datasets/fine-tuning')
};

// Reasoning chain prompt - teaches the model to question first interpretation
const REASONING_PROMPT = `Analysera videon med reasoning chain-metoden:

1. **Observation:** Vad ser/hör du konkret i videon?
2. **Första tolkning (felaktig):** Vad är den uppenbara tolkningen?
3. **Varför den inte stämmer:** Vilka bevis motsäger den?
4. **Korrekt tolkning:** Vad är den faktiska mekanismen?
5. **Mekanism + Varför + Målgrupp**

Fokusera på att IFRÅGASÄTTA den första tolkningen innan du commitar till en slutsats.`;

class V7ATrainer {
  constructor() {
    this.storage = new Storage({ projectId: CONFIG.projectId });
    this.auth = new GoogleAuth({
      keyFile: './credentials/gen-lang-client-0853618366-8c06f8b7a2d1.json',
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
   * Load and convert reasoning chain examples
   */
  loadReasoningChains() {
    const chainPath = path.join(CONFIG.outputPath, 'reasoning-chain-v7A-complete.jsonl');

    if (!fs.existsSync(chainPath)) {
      throw new Error(`Reasoning chain file not found: ${chainPath}`);
    }

    const lines = fs.readFileSync(chainPath, 'utf-8')
      .split('\n')
      .filter(l => l.trim());

    console.log(`📚 Loaded ${lines.length} reasoning chain examples`);

    return lines.map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        console.warn('Failed to parse line:', line.substring(0, 50));
        return null;
      }
    }).filter(Boolean);
  }

  /**
   * Load existing gold standard for video examples
   */
  loadGoldStandard() {
    const goldPath = path.join(CONFIG.outputPath, 'gold_standard.jsonl');

    if (!fs.existsSync(goldPath)) {
      console.log('No gold_standard.jsonl found, using only reasoning chains');
      return [];
    }

    const lines = fs.readFileSync(goldPath, 'utf-8')
      .split('\n')
      .filter(l => l.trim());

    console.log(`📚 Loaded ${lines.length} gold standard examples`);

    return lines.map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    }).filter(Boolean);
  }

  /**
   * Format reasoning chain example for training
   * These are TEXT-only examples (no video) that teach reasoning patterns
   */
  formatReasoningChain(example) {
    // For Simpsons/structural examples - text only
    if (example.source?.includes('simpsons') || !example.url || example.url.startsWith('hypothetical')) {
      return {
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Förklara denna humorscen med reasoning chain-metoden:

${example.source === 'simpsons-structural' ? `[Simpsons ${example.episode}] ${example.title || ''}` : ''}
${example.analysis?.split('**Observation:**')[1]?.split('**')[0]?.trim() || 'Analysera scenens humormekanism.'}`
              }
            ]
          },
          {
            role: "model",
            parts: [
              {
                text: example.analysis
              }
            ]
          }
        ]
      };
    }

    // For TikTok examples with URLs - will need video
    return {
      url: example.url,
      analysis: example.analysis,
      needsVideo: true
    };
  }

  /**
   * Format gold standard example (video-based)
   */
  formatGoldStandard(example, gcsUri) {
    return {
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
              text: REASONING_PROMPT
            }
          ]
        },
        {
          role: "model",
          parts: [
            {
              text: example.analysis
            }
          ]
        }
      ],
      generationConfig: {
        mediaResolution: "MEDIA_RESOLUTION_LOW"
      }
    };
  }

  /**
   * Prepare training data
   */
  async prepareTrainingData() {
    console.log('📊 Preparing v7.A training data with reasoning chains...\n');

    // Load reasoning chains
    const reasoningChains = this.loadReasoningChains();

    // Separate text-only (Simpsons) from video-needed (TikTok)
    const textOnlyExamples = [];
    const videoNeededExamples = [];

    for (const chain of reasoningChains) {
      const formatted = this.formatReasoningChain(chain);
      if (formatted.needsVideo) {
        videoNeededExamples.push(formatted);
      } else {
        textOnlyExamples.push(formatted);
      }
    }

    console.log(`   Text-only examples (Simpsons/derived): ${textOnlyExamples.length}`);
    console.log(`   Video-needed examples (TikTok): ${videoNeededExamples.length}`);

    // Load gold standard for video examples
    const goldStandard = this.loadGoldStandard();

    // Get GCS URIs for video examples (from gold_standard which has them)
    // For now, we'll use text-only examples from reasoning chains
    // Combined with gold_standard video examples

    // Build combined training set
    const allExamples = [...textOnlyExamples];

    // Add gold standard examples (they already have analysis in good format)
    // We'll need to convert them to reasoning format later, but for now include as-is
    for (const gold of goldStandard) {
      if (gold.gcs_uri) {
        allExamples.push(this.formatGoldStandard(gold, gold.gcs_uri));
      }
    }

    console.log(`\n✅ Total training examples: ${allExamples.length}`);

    // Shuffle and split
    const shuffled = [...allExamples].sort(() => Math.random() - 0.5);
    const splitIdx = Math.floor(shuffled.length * CONFIG.trainSplit);
    const trainExamples = shuffled.slice(0, splitIdx);
    const validationExamples = shuffled.slice(splitIdx);

    console.log(`   Train: ${trainExamples.length}`);
    console.log(`   Validation: ${validationExamples.length}`);

    // Convert to JSONL
    const trainJsonl = trainExamples.map(ex => JSON.stringify(ex)).join('\n');
    const validationJsonl = validationExamples.map(ex => JSON.stringify(ex)).join('\n');

    // Save locally
    const timestamp = Date.now();
    const trainFile = `v7a_train_${timestamp}.jsonl`;
    const validationFile = `v7a_validation_${timestamp}.jsonl`;

    fs.writeFileSync(path.join(CONFIG.outputPath, trainFile), trainJsonl);
    fs.writeFileSync(path.join(CONFIG.outputPath, validationFile), validationJsonl);

    console.log(`\n💾 Saved locally:`);
    console.log(`   ${trainFile}`);
    console.log(`   ${validationFile}`);

    // Upload to GCS
    console.log('\n☁️  Uploading to GCS...');
    const bucket = this.storage.bucket(CONFIG.bucketName);

    const gcsTrainPath = `fine-tuning/humor-analysis-v7a/train_${timestamp}.jsonl`;
    const gcsValidationPath = `fine-tuning/humor-analysis-v7a/validation_${timestamp}.jsonl`;

    await bucket.file(gcsTrainPath).save(trainJsonl, { contentType: 'application/jsonl' });
    await bucket.file(gcsValidationPath).save(validationJsonl, { contentType: 'application/jsonl' });

    const trainUri = `gs://${CONFIG.bucketName}/${gcsTrainPath}`;
    const validationUri = `gs://${CONFIG.bucketName}/${gcsValidationPath}`;

    console.log(`   Train: ${trainUri}`);
    console.log(`   Validation: ${validationUri}`);

    // Save URIs
    fs.writeFileSync(
      path.join(CONFIG.outputPath, 'v7a_latest_uris.json'),
      JSON.stringify({
        trainUri,
        validationUri,
        timestamp,
        stats: {
          total: allExamples.length,
          train: trainExamples.length,
          validation: validationExamples.length,
          textOnly: textOnlyExamples.length,
          videoNeeded: videoNeededExamples.length
        }
      }, null, 2)
    );

    return { trainUri, validationUri };
  }

  /**
   * Submit training job
   */
  async submitTrainingJob(trainUri, validationUri) {
    console.log('\n🚀 Submitting v7.A fine-tuning job...\n');

    // Load URIs if not provided
    if (!trainUri || !validationUri) {
      const urisPath = path.join(CONFIG.outputPath, 'v7a_latest_uris.json');
      if (!fs.existsSync(urisPath)) {
        throw new Error('No training data URIs found. Run prepare first.');
      }
      const uris = JSON.parse(fs.readFileSync(urisPath, 'utf-8'));
      trainUri = uris.trainUri;
      validationUri = uris.validationUri;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const displayName = `humor-analysis-v7A-${timestamp}`;

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

    console.log('Configuration:');
    console.log(`   Base model: ${CONFIG.baseModel}`);
    console.log(`   Epochs: ${CONFIG.epochs}`);
    console.log(`   Learning rate: ${CONFIG.learningRateMultiplier}`);
    console.log(`   Display name: ${displayName}`);

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

    console.log('\n✅ v7.A Training job submitted!');
    console.log('Job name:', job.name);

    // Update model_versions.json
    const versionsPath = path.join(CONFIG.outputPath, 'model_versions.json');
    const versions = JSON.parse(fs.readFileSync(versionsPath, 'utf-8'));

    versions.versions['v7.A'] = {
      jobName: job.name,
      status: 'training',
      description: '75 reasoning chain examples - teaches reject/evidence/correct pattern',
      submittedAt: new Date().toISOString(),
      examples: 75,
      method: 'reasoning_chain'
    };
    versions.latest = 'v7.A';

    fs.writeFileSync(versionsPath, JSON.stringify(versions, null, 2));

    // Save active job
    fs.writeFileSync(
      path.join(CONFIG.outputPath, 'active_job.json'),
      JSON.stringify({
        name: job.name,
        displayName,
        type: 'v7.A-reasoning',
        submittedAt: new Date().toISOString(),
        config: requestBody
      }, null, 2)
    );

    console.log('\n📝 Next steps:');
    console.log('   1. Run "node scripts/fine-tune-gemini.js status" to check progress');
    console.log('   2. Training typically takes 30-60 minutes');
    console.log('   3. v7.A will be available in model_versions.json when complete');

    return { name: job.name, displayName };
  }

  async run() {
    console.log('='.repeat(60));
    console.log('v7.A REASONING CHAIN TRAINING');
    console.log('='.repeat(60));
    console.log('\nThis model learns to:');
    console.log('  1. REJECT obvious interpretation first');
    console.log('  2. Cite EVIDENCE that contradicts it');
    console.log('  3. Identify STRUCTURAL FORMULAS');
    console.log('  4. Explain WHY the mechanism works');
    console.log('');

    const { trainUri, validationUri } = await this.prepareTrainingData();
    await this.submitTrainingJob(trainUri, validationUri);
  }
}

// CLI
async function main() {
  const command = process.argv[2] || 'run';
  const trainer = new V7ATrainer();

  switch (command) {
    case 'prepare':
      await trainer.prepareTrainingData();
      break;
    case 'train':
      await trainer.submitTrainingJob();
      break;
    case 'run':
    default:
      await trainer.run();
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
