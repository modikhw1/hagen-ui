#!/usr/bin/env node
/**
 * Create an expanded TikTok-only test set for humor model evaluation
 *
 * Creates a stratified sample of 50 TikTok video entries for consistent benchmarking.
 */

const fs = require('fs');
const path = require('path');

const DATASET_DIR = path.join(__dirname, '../datasets/fine-tuning');
const GOLD_STANDARD_PATH = path.join(DATASET_DIR, 'gold_standard.jsonl');
const TEST_SET_PATH = path.join(DATASET_DIR, 'test_set.jsonl');
const TEST_SET_SIZE = 50;

// Fisher-Yates shuffle
function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function main() {
  console.log('🧪 Creating Expanded TikTok-Only Test Set\n');

  // Check if test set already exists
  if (fs.existsSync(TEST_SET_PATH)) {
    const existing = fs.readFileSync(TEST_SET_PATH, 'utf-8').split('\n').filter(l => l.trim()).length;
    console.log(`⚠️  Test set already exists with ${existing} examples.`);
    console.log('   Delete it first if you want to regenerate.');
    return;
  }

  // Load gold standard
  const lines = fs.readFileSync(GOLD_STANDARD_PATH, 'utf-8').split('\n').filter(l => l.trim());
  const entries = lines.map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);

  console.log(`📁 Loaded ${entries.length} total examples`);

  // Filter to TikTok videos only
  const tiktokEntries = entries.filter(e => e.url && e.url.includes('tiktok.com'));
  console.log(`📹 Found ${tiktokEntries.length} TikTok video entries\n`);

  // Group by source
  const bySource = {};
  for (const entry of tiktokEntries) {
    const source = entry.source || 'unknown';
    if (!bySource[source]) bySource[source] = [];
    bySource[source].push(entry);
  }

  console.log('📊 TikTok entries by source:');
  for (const [source, items] of Object.entries(bySource)) {
    console.log(`   ${source}: ${items.length}`);
  }

  // Stratified sample
  const selected = [];
  const totalTiktok = tiktokEntries.length;

  console.log('\n📥 Sampling:');
  for (const [source, items] of Object.entries(bySource)) {
    const proportion = items.length / totalTiktok;
    const sampleSize = Math.max(2, Math.round(TEST_SET_SIZE * proportion));
    const sampled = shuffle(items).slice(0, sampleSize);
    selected.push(...sampled);
    console.log(`   ${source}: ${sampled.length} samples (${(proportion * 100).toFixed(1)}% of dataset)`);
  }

  // Trim to target size
  const testSet = shuffle(selected).slice(0, TEST_SET_SIZE);
  console.log(`\n✅ Final test set size: ${testSet.length}`);

  // Add metadata
  const testSetWithMeta = testSet.map(entry => ({
    ...entry,
    holdout: true,
    selected_at: new Date().toISOString()
  }));

  // Save
  const output = testSetWithMeta.map(e => JSON.stringify(e)).join('\n');
  fs.writeFileSync(TEST_SET_PATH, output + '\n');
  console.log(`💾 Saved to: ${TEST_SET_PATH}`);

  // Final distribution
  const finalBySource = {};
  for (const entry of testSetWithMeta) {
    const source = entry.source || 'unknown';
    finalBySource[source] = (finalBySource[source] || 0) + 1;
  }

  console.log('\n📊 Test set distribution:');
  for (const [source, count] of Object.entries(finalBySource)) {
    console.log(`   ${source}: ${count}`);
  }
}

main().catch(console.error);
