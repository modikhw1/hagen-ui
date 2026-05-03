#!/usr/bin/env node
/**
 * Convert Question Battery examples to Gold Standard training format
 *
 * This script takes the human corrections from question_battery.json
 * and converts them to the gold_standard.jsonl format for fine-tuning.
 *
 * Usage: node scripts/convert-question-battery-to-training.js [--translate]
 *
 * Options:
 *   --translate   Translate English examples to Swedish using Gemini
 *   --dry-run     Preview without saving
 */

const fs = require('fs');
const path = require('path');

// Paths
const QUESTION_BATTERY_PATH = path.join(__dirname, '../datasets/question_battery.json');
const GOLD_STANDARD_PATH = path.join(__dirname, '../datasets/fine-tuning/gold_standard.jsonl');
const OUTPUT_PATH = path.join(__dirname, '../datasets/fine-tuning/question_battery_converted.jsonl');

// Parse command line args
const args = process.argv.slice(2);
const shouldTranslate = args.includes('--translate');
const dryRun = args.includes('--dry-run');

/**
 * Convert a question battery example to gold standard format
 */
function convertExample(example) {
  const { video_url, human_said, explanation, gap_classification, humor_types = [] } = example;

  // Use human_said as the primary source, fall back to explanation
  const humanAnalysis = human_said || explanation;

  if (!humanAnalysis || humanAnalysis.length < 50) {
    return null; // Skip examples with insufficient analysis
  }

  // Extract key components from human analysis
  const gapType = gap_classification?.primary_gap || 'UNKNOWN';
  const humorType = humor_types.length > 0 ? humor_types.join(', ') : 'subversion';

  // Format into Swedish 4-field structure
  // Since human_said is in English, we'll create an English version first
  // that follows the same structure
  const analysis = formatAsStructuredAnalysis(humanAnalysis, gapType, humorType);

  return {
    url: video_url,
    analysis: analysis,
    timestamp: new Date().toISOString(),
    source: 'question-battery',
    original_gap: gapType,
    original_score: example.understanding_score
  };
}

/**
 * Format the human analysis into structured format
 * Matches the gold_standard format: Handling, Mekanism, Varför, Målgrupp
 */
function formatAsStructuredAnalysis(humanAnalysis, gapType, humorType) {
  // Try to extract structured info from the human analysis
  // The human_said often contains rich explanations we can structure

  // Check if it's already structured (contains numbered points or clear sections)
  const hasStructure = /\d\.\s|SETUP:|REVEAL:|PUNCHLINE:|WHY|DEEP REASONING/i.test(humanAnalysis);

  if (hasStructure) {
    // Keep structured analyses mostly intact but add Swedish headers
    return `**Handling:** ${extractSection(humanAnalysis, 'what happens') || 'Se nedan.'}\n` +
           `**Mekanism:** ${humorType}\n` +
           `**Varför:** ${humanAnalysis}\n` +
           `**Målgrupp:** Viewers who appreciate ${gapType.toLowerCase().replace('_', ' ')} humor.`;
  }

  // For unstructured analyses, create a cleaner format
  const firstSentence = humanAnalysis.split(/[.!?]/)[0] + '.';

  return `**Handling:** ${firstSentence}\n` +
         `**Mekanism:** ${humorType}\n` +
         `**Varför:** ${humanAnalysis}\n` +
         `**Målgrupp:** Viewers who appreciate ${gapType.toLowerCase().replace('_', ' ')} humor.`;
}

/**
 * Try to extract a section from structured text
 */
function extractSection(text, keyword) {
  const patterns = [
    new RegExp(`${keyword}[:\\s]+([^\\n]+)`, 'i'),
    new RegExp(`1\\.\\s*([^\\n]+)`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }

  return null;
}

/**
 * Load existing gold standard entries to check for duplicates
 */
function loadExistingUrls() {
  const existingUrls = new Set();

  if (fs.existsSync(GOLD_STANDARD_PATH)) {
    const lines = fs.readFileSync(GOLD_STANDARD_PATH, 'utf-8').split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        existingUrls.add(entry.url);
      } catch (e) {
        // Skip invalid lines
      }
    }
  }

  return existingUrls;
}

/**
 * Main conversion function
 */
async function main() {
  console.log('📚 Question Battery to Training Data Converter\n');

  // Load question battery
  if (!fs.existsSync(QUESTION_BATTERY_PATH)) {
    console.error('❌ Question battery not found:', QUESTION_BATTERY_PATH);
    process.exit(1);
  }

  const battery = JSON.parse(fs.readFileSync(QUESTION_BATTERY_PATH, 'utf-8'));
  console.log(`📊 Found ${battery.total_examples} examples in question battery`);
  console.log(`   Gap distribution:`, battery.statistics.gap_counts);

  // Load existing URLs to avoid duplicates
  const existingUrls = loadExistingUrls();
  console.log(`\n📁 Existing gold_standard entries: ${existingUrls.size}`);

  // Convert examples
  const converted = [];
  const skipped = { duplicate: 0, insufficient: 0, error: 0 };

  for (const example of battery.examples) {
    // Check for duplicate URL
    if (existingUrls.has(example.video_url)) {
      skipped.duplicate++;
      continue;
    }

    try {
      const result = convertExample(example);
      if (result) {
        converted.push(result);
        existingUrls.add(example.video_url); // Prevent duplicates within batch
      } else {
        skipped.insufficient++;
      }
    } catch (e) {
      console.error(`  ⚠️ Error converting ${example.video_url}:`, e.message);
      skipped.error++;
    }
  }

  console.log(`\n✅ Converted: ${converted.length} examples`);
  console.log(`⏭️  Skipped: ${skipped.duplicate} duplicates, ${skipped.insufficient} insufficient, ${skipped.error} errors`);

  if (converted.length === 0) {
    console.log('\n⚠️ No new examples to add.');
    return;
  }

  // Preview
  console.log('\n📝 Sample converted entry:');
  console.log('---');
  console.log(JSON.stringify(converted[0], null, 2));
  console.log('---');

  if (dryRun) {
    console.log('\n🔍 Dry run - no files modified');
    return;
  }

  // Save to separate file first (for review)
  const outputLines = converted.map(e => JSON.stringify(e)).join('\n');
  fs.writeFileSync(OUTPUT_PATH, outputLines + '\n');
  console.log(`\n💾 Saved ${converted.length} entries to: ${OUTPUT_PATH}`);

  // Ask whether to append to gold_standard
  console.log('\n📌 To append to gold_standard.jsonl, run:');
  console.log(`   cat ${OUTPUT_PATH} >> ${GOLD_STANDARD_PATH}`);
  console.log('\n   Or review and merge manually.');

  // Show statistics
  const gapDistribution = {};
  for (const entry of converted) {
    const gap = entry.original_gap || 'UNKNOWN';
    gapDistribution[gap] = (gapDistribution[gap] || 0) + 1;
  }
  console.log('\n📊 Converted examples by gap type:');
  for (const [gap, count] of Object.entries(gapDistribution).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${gap}: ${count}`);
  }
}

main().catch(console.error);
