#!/usr/bin/env node
/**
 * Merge Training Datasets for Unified Model
 *
 * Combines humor analysis and replicability analysis training data
 * into a single dataset for a unified multi-task model.
 *
 * The unified model can:
 * - Analyze humor mechanisms (when given humor prompt)
 * - Analyze replicability (when given replicability prompt)
 *
 * Usage: node scripts/merge-training-datasets.js [options]
 *
 * Options:
 *   --dry-run     Show what would be merged without creating files
 *   --upload      Upload merged dataset to GCS
 *   --train       Start training job after merge
 */

const fs = require('fs');
const path = require('path');
const { Storage } = require('@google-cloud/storage');
require('dotenv').config({ path: '.env.local' });

// Configuration
const CONFIG = {
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  bucketName: process.env.GOOGLE_CLOUD_STORAGE_BUCKET || 'hagen-video-analysis',
  outputPath: path.join(__dirname, '../datasets/fine-tuning'),

  // Source files - all multimodal files with GCS URIs
  humorTrainFiles: ['train_v3_2025-12-23.jsonl'],
  humorValidationFiles: ['validation_v3_2025-12-23.jsonl'],
  replicabilityTrainFiles: [
    'replicability_train_v2-multimodal.jsonl',
    'replicability_train_v1-multimodal.jsonl'  // Include v1 for unique examples
  ],
  replicabilityValidationFiles: [
    'replicability_validation_v2-multimodal.jsonl',
    'replicability_validation_v1-multimodal.jsonl'
  ],

  // Training split ratio
  trainSplit: 0.85
};

// Parse arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const shouldUpload = args.includes('--upload');
const shouldTrain = args.includes('--train');

/**
 * Load JSONL file and parse each line
 */
function loadJsonl(filename) {
  const filepath = path.join(CONFIG.outputPath, filename);
  if (!fs.existsSync(filepath)) {
    console.log(`  ⚠️  File not found: ${filename}`);
    return [];
  }

  const lines = fs.readFileSync(filepath, 'utf-8')
    .split('\n')
    .filter(l => l.trim());

  return lines.map((line, idx) => {
    try {
      return JSON.parse(line);
    } catch (e) {
      console.warn(`  ⚠️  Failed to parse line ${idx + 1} in ${filename}`);
      return null;
    }
  }).filter(Boolean);
}

/**
 * Validate example format
 */
function validateExample(example, source) {
  if (!example.contents || !Array.isArray(example.contents)) {
    return { valid: false, reason: 'Missing contents array' };
  }

  const userContent = example.contents.find(c => c.role === 'user');
  const modelContent = example.contents.find(c => c.role === 'model');

  if (!userContent || !modelContent) {
    return { valid: false, reason: 'Missing user or model content' };
  }

  const fileData = userContent.parts?.find(p => p.fileData);
  if (!fileData || !fileData.fileData?.fileUri) {
    return { valid: false, reason: 'Missing fileData with GCS URI' };
  }

  const modelText = modelContent.parts?.find(p => p.text);
  if (!modelText || modelText.text.length < 20) {
    return { valid: false, reason: 'Model response too short' };
  }

  return { valid: true };
}

/**
 * Add source metadata to example
 */
function tagExample(example, source) {
  return {
    ...example,
    _source: source, // Internal tag for tracking
  };
}

/**
 * Shuffle array using Fisher-Yates
 */
function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Remove internal metadata before saving
 */
function cleanExample(example) {
  const { _source, ...clean } = example;
  return clean;
}

/**
 * Extract GCS URI from example for deduplication
 */
function extractGcsUri(example) {
  const userContent = example.contents?.find(c => c.role === 'user');
  const fileData = userContent?.parts?.find(p => p.fileData);
  return fileData?.fileData?.fileUri || null;
}

/**
 * Load multiple JSONL files and deduplicate by GCS URI
 */
function loadAndDeduplicateJsonl(filenames, source) {
  const seenUris = new Set();
  const uniqueExamples = [];

  for (const filename of filenames) {
    const examples = loadJsonl(filename);
    for (const ex of examples) {
      const uri = extractGcsUri(ex);
      if (uri && !seenUris.has(uri)) {
        seenUris.add(uri);
        uniqueExamples.push(ex);
      }
    }
  }

  return uniqueExamples;
}

/**
 * Main merge function
 */
async function main() {
  console.log('🔀 Merge Training Datasets for Unified Model\n');
  console.log(`   Dry run: ${dryRun}`);
  console.log(`   Upload: ${shouldUpload}`);
  console.log(`   Train: ${shouldTrain}\n`);

  // Load existing training data with deduplication
  console.log('📁 Loading source datasets...\n');

  const humorTrain = loadAndDeduplicateJsonl(CONFIG.humorTrainFiles, 'humor-train');
  const humorValidation = loadAndDeduplicateJsonl(CONFIG.humorValidationFiles, 'humor-val');
  const replicabilityTrain = loadAndDeduplicateJsonl(CONFIG.replicabilityTrainFiles, 'replicability-train');
  const replicabilityValidation = loadAndDeduplicateJsonl(CONFIG.replicabilityValidationFiles, 'replicability-val');

  console.log(`   Humor training: ${humorTrain.length} unique examples`);
  console.log(`   Humor validation: ${humorValidation.length} unique examples`);
  console.log(`   Replicability training: ${replicabilityTrain.length} unique examples`);
  console.log(`   Replicability validation: ${replicabilityValidation.length} unique examples`);

  // Validate and tag examples
  console.log('\n🔍 Validating examples...\n');

  const validExamples = {
    humorTrain: [],
    humorValidation: [],
    replicabilityTrain: [],
    replicabilityValidation: []
  };

  let invalidCount = 0;

  for (const [name, examples, target] of [
    ['humor train', humorTrain, 'humorTrain'],
    ['humor validation', humorValidation, 'humorValidation'],
    ['replicability train', replicabilityTrain, 'replicabilityTrain'],
    ['replicability validation', replicabilityValidation, 'replicabilityValidation']
  ]) {
    for (const ex of examples) {
      const validation = validateExample(ex, name);
      if (validation.valid) {
        validExamples[target].push(tagExample(ex, name));
      } else {
        invalidCount++;
        if (invalidCount <= 5) {
          console.log(`   ❌ Invalid ${name} example: ${validation.reason}`);
        }
      }
    }
  }

  if (invalidCount > 0) {
    console.log(`   ⚠️  Total invalid examples: ${invalidCount}`);
  }

  // Combine datasets
  console.log('\n🔀 Combining datasets...\n');

  // Merge training data
  const allTrain = [
    ...validExamples.humorTrain,
    ...validExamples.replicabilityTrain
  ];

  // Merge validation data
  const allValidation = [
    ...validExamples.humorValidation,
    ...validExamples.replicabilityValidation
  ];

  // Shuffle to mix humor and replicability examples
  const shuffledTrain = shuffle(allTrain);
  const shuffledValidation = shuffle(allValidation);

  console.log(`   Combined training: ${shuffledTrain.length} examples`);
  console.log(`   Combined validation: ${shuffledValidation.length} examples`);
  console.log(`   Total: ${shuffledTrain.length + shuffledValidation.length} examples`);

  // Distribution analysis
  const trainDist = {
    humor: shuffledTrain.filter(e => e._source?.includes('humor')).length,
    replicability: shuffledTrain.filter(e => e._source?.includes('replicability')).length
  };

  const validationDist = {
    humor: shuffledValidation.filter(e => e._source?.includes('humor')).length,
    replicability: shuffledValidation.filter(e => e._source?.includes('replicability')).length
  };

  console.log('\n📊 Distribution:');
  console.log(`   Train: ${trainDist.humor} humor + ${trainDist.replicability} replicability`);
  console.log(`   Validation: ${validationDist.humor} humor + ${validationDist.replicability} replicability`);

  if (dryRun) {
    console.log('\n🔍 Dry run complete. No files created.');
    return;
  }

  // Generate output files
  const timestamp = new Date().toISOString().split('T')[0];
  const trainFilename = `unified_train_${timestamp}.jsonl`;
  const validationFilename = `unified_validation_${timestamp}.jsonl`;

  // Clean examples before saving
  const cleanTrain = shuffledTrain.map(cleanExample);
  const cleanValidation = shuffledValidation.map(cleanExample);

  // Save locally
  const trainPath = path.join(CONFIG.outputPath, trainFilename);
  const validationPath = path.join(CONFIG.outputPath, validationFilename);

  fs.writeFileSync(trainPath, cleanTrain.map(e => JSON.stringify(e)).join('\n'));
  fs.writeFileSync(validationPath, cleanValidation.map(e => JSON.stringify(e)).join('\n'));

  console.log('\n💾 Saved locally:');
  console.log(`   ${trainFilename}`);
  console.log(`   ${validationFilename}`);

  // Upload to GCS if requested
  let trainUri, validationUri;

  if (shouldUpload) {
    console.log('\n☁️  Uploading to GCS...');

    const storage = new Storage({ projectId: CONFIG.projectId });
    const bucket = storage.bucket(CONFIG.bucketName);

    const gcsTrainPath = `fine-tuning/unified/${trainFilename}`;
    const gcsValidationPath = `fine-tuning/unified/${validationFilename}`;

    await bucket.file(gcsTrainPath).save(
      cleanTrain.map(e => JSON.stringify(e)).join('\n'),
      { contentType: 'application/jsonl' }
    );

    await bucket.file(gcsValidationPath).save(
      cleanValidation.map(e => JSON.stringify(e)).join('\n'),
      { contentType: 'application/jsonl' }
    );

    trainUri = `gs://${CONFIG.bucketName}/${gcsTrainPath}`;
    validationUri = `gs://${CONFIG.bucketName}/${gcsValidationPath}`;

    console.log(`   Train: ${trainUri}`);
    console.log(`   Validation: ${validationUri}`);

    // Save URIs for training step
    const urisPath = path.join(CONFIG.outputPath, 'unified_latest_uris.json');
    fs.writeFileSync(urisPath, JSON.stringify({
      trainUri,
      validationUri,
      timestamp,
      stats: {
        totalExamples: cleanTrain.length + cleanValidation.length,
        trainCount: cleanTrain.length,
        validationCount: cleanValidation.length,
        distribution: {
          train: trainDist,
          validation: validationDist
        }
      }
    }, null, 2));
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('✅ MERGE COMPLETE');
  console.log('='.repeat(50));
  console.log(`\nTotal examples: ${cleanTrain.length + cleanValidation.length}`);
  console.log(`  - Training: ${cleanTrain.length}`);
  console.log(`  - Validation: ${cleanValidation.length}`);
  console.log(`\nTask distribution:`);
  console.log(`  - Humor analysis: ${trainDist.humor + validationDist.humor}`);
  console.log(`  - Replicability: ${trainDist.replicability + validationDist.replicability}`);

  if (cleanTrain.length + cleanValidation.length < 500) {
    console.log('\n⚠️  Note: Total is under 500 examples target.');
    console.log('   Consider processing more videos through the fine-tuning lab.');
    console.log(`   Need ${500 - (cleanTrain.length + cleanValidation.length)} more examples.`);
  }

  if (shouldTrain && trainUri && validationUri) {
    console.log('\n🚀 Starting training job...');
    console.log('   Use: node scripts/fine-tune-gemini.js train --unified');
  }
}

main().catch(console.error);
