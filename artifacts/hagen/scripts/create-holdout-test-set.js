#!/usr/bin/env node
/**
 * Create a holdout test set for model evaluation
 *
 * Extracts a random sample of examples from gold_standard.jsonl
 * to use as a consistent benchmark across model versions.
 *
 * Usage: node scripts/create-holdout-test-set.js [--size=20]
 */

const fs = require('fs');
const path = require('path');

const DATASET_DIR = path.join(__dirname, '../datasets/fine-tuning');
const GOLD_STANDARD_PATH = path.join(DATASET_DIR, 'gold_standard.jsonl');
const TEST_SET_PATH = path.join(DATASET_DIR, 'test_set.jsonl');

// Parse args
const args = process.argv.slice(2);
const sizeArg = args.find(a => a.startsWith('--size='));
const TEST_SET_SIZE = sizeArg ? parseInt(sizeArg.split('=')[1]) : 20;

/**
 * Shuffle array using Fisher-Yates algorithm
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
 * Stratified sampling - try to get examples from each source
 */
function stratifiedSample(entries, size) {
  // Group by source
  const bySource = {};
  for (const entry of entries) {
    const source = entry.source || 'unknown';
    if (!bySource[source]) bySource[source] = [];
    bySource[source].push(entry);
  }

  console.log('\n📊 Dataset distribution:');
  for (const [source, items] of Object.entries(bySource)) {
    console.log(`   ${source}: ${items.length} examples`);
  }

  // Calculate proportional sampling
  const sources = Object.keys(bySource);
  const totalEntries = entries.length;
  const selected = [];

  for (const source of sources) {
    const sourceEntries = bySource[source];
    const proportion = sourceEntries.length / totalEntries;
    const sampleSize = Math.max(1, Math.round(size * proportion));

    const shuffled = shuffle(sourceEntries);
    const sampled = shuffled.slice(0, sampleSize);
    selected.push(...sampled);

    console.log(`   Sampling ${sampled.length} from ${source}`);
  }

  // If we have too many, trim; if too few, add more randomly
  if (selected.length > size) {
    return shuffle(selected).slice(0, size);
  } else if (selected.length < size) {
    const remaining = entries.filter(e => !selected.includes(e));
    const additional = shuffle(remaining).slice(0, size - selected.length);
    return [...selected, ...additional];
  }

  return selected;
}

async function main() {
  console.log('🧪 Creating Holdout Test Set\n');

  // Check if test set already exists
  if (fs.existsSync(TEST_SET_PATH)) {
    const existing = fs.readFileSync(TEST_SET_PATH, 'utf-8').split('\n').filter(l => l.trim()).length;
    console.log(`⚠️  Test set already exists with ${existing} examples.`);
    console.log('   Delete it first if you want to regenerate.');
    return;
  }

  // Load gold standard
  if (!fs.existsSync(GOLD_STANDARD_PATH)) {
    console.error('❌ Gold standard not found:', GOLD_STANDARD_PATH);
    process.exit(1);
  }

  const lines = fs.readFileSync(GOLD_STANDARD_PATH, 'utf-8').split('\n').filter(l => l.trim());
  const entries = lines.map(l => {
    try {
      return JSON.parse(l);
    } catch (e) {
      return null;
    }
  }).filter(Boolean);

  console.log(`📁 Loaded ${entries.length} examples from gold_standard.jsonl`);

  if (entries.length < TEST_SET_SIZE * 2) {
    console.error(`❌ Not enough examples. Need at least ${TEST_SET_SIZE * 2} to create a ${TEST_SET_SIZE} holdout set.`);
    process.exit(1);
  }

  // Create stratified sample
  const testSet = stratifiedSample(entries, TEST_SET_SIZE);

  console.log(`\n✅ Selected ${testSet.length} examples for test set`);

  // Add metadata
  const testSetWithMeta = testSet.map(entry => ({
    ...entry,
    holdout: true,
    selected_at: new Date().toISOString()
  }));

  // Save test set
  const output = testSetWithMeta.map(e => JSON.stringify(e)).join('\n');
  fs.writeFileSync(TEST_SET_PATH, output + '\n');

  console.log(`💾 Saved to: ${TEST_SET_PATH}`);

  // Show sample
  console.log('\n📝 Sample entry:');
  console.log('---');
  const sample = testSetWithMeta[0];
  console.log(`URL: ${sample.url}`);
  console.log(`Source: ${sample.source}`);
  console.log(`Analysis preview: ${sample.analysis?.substring(0, 150)}...`);
  console.log('---');

  // Show final distribution
  const testBySource = {};
  for (const entry of testSetWithMeta) {
    const source = entry.source || 'unknown';
    testBySource[source] = (testBySource[source] || 0) + 1;
  }
  console.log('\n📊 Test set distribution:');
  for (const [source, count] of Object.entries(testBySource)) {
    console.log(`   ${source}: ${count}`);
  }
}

main().catch(console.error);
