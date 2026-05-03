#!/usr/bin/env node
/**
 * Evaluate Format Compliance
 *
 * Tests model outputs against structural/format requirements.
 * Does NOT check if analysis is correct - that requires human judgment.
 *
 * Usage: node scripts/evaluate-format-compliance.js [--limit=50]
 *
 * Checks (all automatable):
 *   1. Structural completeness: Has all 4 required sections?
 *   2. Mechanism vocabulary: Uses recognized terms from taxonomy?
 *   3. Markdown formatting: Correct bold/structure?
 *   4. Length appropriateness: Not too short, not too long?
 *   5. Language consistency: Swedish throughout?
 *   6. Specificity: Contains concrete details, not generic phrases?
 */

const fs = require('fs');
const path = require('path');

// Paths
const DATASET_DIR = path.join(__dirname, '../datasets/fine-tuning');
const TEST_SET_PATH = path.join(DATASET_DIR, 'test_set.jsonl');
const GOLD_STANDARD_PATH = path.join(DATASET_DIR, 'gold_standard.jsonl');
const TAXONOMY_PATH = path.join(DATASET_DIR, 'humor-pattern-taxonomy.json');
const RESULTS_DIR = path.join(DATASET_DIR, 'eval_results');

// Parse args
const args = process.argv.slice(2);
const limitArg = args.find(a => a.startsWith('--limit='));
const verbose = args.includes('--verbose');
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : Infinity;

// Required sections
const REQUIRED_SECTIONS = ['Handling', 'Mekanism', 'Varför', 'Målgrupp'];

// Valid mechanisms from taxonomy (loaded dynamically)
let VALID_MECHANISMS = [];

// Load taxonomy
function loadTaxonomy() {
  if (!fs.existsSync(TAXONOMY_PATH)) {
    console.warn('⚠️ Taxonomy file not found, using default mechanisms');
    VALID_MECHANISMS = [
      'subversion', 'igenkänning', 'överdrift', 'kontrast', 'ironi',
      'absurd', 'timing', 'mörk humor', 'ordvits', 'ordlek', 'fysisk',
      'reveal', 'callback', 'deadpan', 'sarkasm', 'parodi', 'eskalering',
      'pov', 'bokstavlig', 'wordplay', 'misunderstanding', 'overdriven',
      'frustration', 'meme', 'exaggeration', 'role reversal', 'understatement'
    ];
    return;
  }

  const taxonomy = JSON.parse(fs.readFileSync(TAXONOMY_PATH, 'utf-8'));
  const mechanisms = [];

  // Extract all pattern names from taxonomy
  for (const category of Object.values(taxonomy.patterns || {})) {
    for (const pattern of Object.values(category)) {
      if (pattern.name) {
        mechanisms.push(pattern.name.toLowerCase());
      }
      if (pattern.swedish) {
        mechanisms.push(pattern.swedish.toLowerCase());
      }
      // Add common variations
      if (pattern.subtypes) {
        mechanisms.push(...pattern.subtypes.map(s => s.toLowerCase()));
      }
    }
  }

  // Add common Swedish/English keywords
  const commonKeywords = [
    'subversion', 'igenkänning', 'överdrift', 'kontrast', 'ironi',
    'absurd', 'timing', 'mörk humor', 'ordvits', 'ordlek', 'fysisk',
    'reveal', 'callback', 'deadpan', 'sarkasm', 'parodi', 'eskalering',
    'pov', 'bokstavlig', 'wordplay', 'misunderstanding', 'frustration',
    'meme', 'överdriven', 'humor', 'subverted', 'expectation', 'ironic'
  ];

  VALID_MECHANISMS = [...new Set([...mechanisms, ...commonKeywords])];
}

/**
 * Extract structured fields from analysis text
 */
function extractFields(text) {
  const fields = {};
  const patterns = [
    { key: 'handling', label: 'Handling', pattern: /\*\*Handling:\*\*\s*(.+?)(?=\*\*|$)/is },
    { key: 'mekanism', label: 'Mekanism', pattern: /\*\*Mekanism:\*\*\s*(.+?)(?=\*\*|$)/is },
    { key: 'varfor', label: 'Varför', pattern: /\*\*Varför:\*\*\s*(.+?)(?=\*\*|$)/is },
    { key: 'malgrupp', label: 'Målgrupp', pattern: /\*\*Målgrupp:\*\*\s*(.+?)(?=\*\*|$)/is },
  ];

  for (const { key, pattern, label } of patterns) {
    const match = text.match(pattern);
    if (match) {
      fields[key] = {
        present: true,
        content: match[1].trim(),
        label
      };
    } else {
      fields[key] = { present: false, content: '', label };
    }
  }

  return fields;
}

/**
 * Check structural completeness
 * Returns score 0-1 and list of missing sections
 */
function checkStructuralCompleteness(fields) {
  const present = Object.values(fields).filter(f => f.present).length;
  const missing = Object.values(fields).filter(f => !f.present).map(f => f.label);

  return {
    score: present / 4,
    present,
    missing,
    pass: present === 4
  };
}

/**
 * Check mechanism validity
 * Returns score 0-1 based on recognized mechanisms
 */
function checkMechanismValidity(mekanismField) {
  if (!mekanismField.present || !mekanismField.content) {
    return { score: 0, recognized: [], unrecognized: [], pass: false };
  }

  const content = mekanismField.content.toLowerCase();

  // Find recognized mechanisms
  const recognized = VALID_MECHANISMS.filter(m => content.includes(m));

  // Find potential unrecognized terms (words that look like mechanism names)
  const words = content.split(/[,\s.]+/).filter(w => w.length > 3);
  const unrecognized = words.filter(w =>
    !VALID_MECHANISMS.some(m => m.includes(w) || w.includes(m)) &&
    !['och', 'med', 'som', 'för', 'det', 'den', 'att', 'the', 'and', 'with'].includes(w)
  );

  return {
    score: recognized.length > 0 ? 1 : 0,
    recognized,
    unrecognized: unrecognized.slice(0, 3),
    pass: recognized.length > 0
  };
}

/**
 * Check format compliance
 * Returns score 0-1 for markdown formatting correctness
 */
function checkFormatCompliance(text) {
  const issues = [];

  // Check for proper bold markers
  const boldMatches = text.match(/\*\*[^*]+\*\*/g) || [];
  if (boldMatches.length < 4) {
    issues.push('Missing bold section headers');
  }

  // Check for proper section format (** Label: **)
  for (const section of REQUIRED_SECTIONS) {
    const pattern = new RegExp(`\\*\\*${section}:\\*\\*`, 'i');
    if (!pattern.test(text)) {
      issues.push(`Malformed ${section} header`);
    }
  }

  // Check for excessive line breaks (more than 3 in a row)
  if (/\n{4,}/.test(text)) {
    issues.push('Excessive line breaks');
  }

  // Check for unclosed markdown
  const asterisks = (text.match(/\*/g) || []).length;
  if (asterisks % 2 !== 0) {
    issues.push('Unclosed markdown formatting');
  }

  const score = Math.max(0, 1 - issues.length * 0.25);
  return { score, issues, pass: issues.length === 0 };
}

/**
 * Check length appropriateness
 * Each section should be meaningful but concise
 */
function checkLengthAppropriateness(fields) {
  const results = {};
  const thresholds = {
    handling: { min: 20, max: 500 },
    mekanism: { min: 5, max: 150 },
    varfor: { min: 20, max: 400 },
    malgrupp: { min: 10, max: 200 }
  };

  let totalScore = 0;
  let count = 0;

  for (const [key, field] of Object.entries(fields)) {
    if (!field.present) {
      results[key] = { score: 0, issue: 'missing' };
      continue;
    }

    const len = field.content.length;
    const thresh = thresholds[key];

    if (len < thresh.min) {
      results[key] = { score: 0.5, issue: 'too_short', length: len };
      totalScore += 0.5;
    } else if (len > thresh.max) {
      results[key] = { score: 0.7, issue: 'too_long', length: len };
      totalScore += 0.7;
    } else {
      results[key] = { score: 1, issue: null, length: len };
      totalScore += 1;
    }
    count++;
  }

  return {
    score: count > 0 ? totalScore / count : 0,
    details: results,
    pass: Object.values(results).every(r => r.score >= 0.7)
  };
}

/**
 * Check language consistency (Swedish)
 * Looks for Swedish-specific characters and common Swedish words
 */
function checkLanguageConsistency(text) {
  const swedishIndicators = ['och', 'som', 'med', 'för', 'att', 'det', 'den', 'en', 'är'];
  const swedishChars = ['å', 'ä', 'ö'];

  const lower = text.toLowerCase();

  // Count Swedish indicators
  const swedishWordCount = swedishIndicators.filter(w =>
    new RegExp(`\\b${w}\\b`).test(lower)
  ).length;

  const hasSwedishChars = swedishChars.some(c => lower.includes(c));

  // Mixed language detection (common English words that aren't shared)
  const englishOnlyWords = ['the', 'is', 'are', 'this', 'that', 'with', 'from', 'because'];
  const englishWordCount = englishOnlyWords.filter(w =>
    new RegExp(`\\b${w}\\b`).test(lower)
  ).length;

  const isSwedish = (swedishWordCount >= 2 || hasSwedishChars) && englishWordCount < 3;
  const isMixed = swedishWordCount > 0 && englishWordCount > 2;

  return {
    score: isSwedish ? 1 : (isMixed ? 0.5 : 0),
    swedishIndicators: swedishWordCount,
    hasSwedishChars,
    englishIndicators: englishWordCount,
    status: isSwedish ? 'swedish' : (isMixed ? 'mixed' : 'not_swedish'),
    pass: isSwedish
  };
}

/**
 * Check specificity
 * Penalizes generic phrases, rewards concrete details
 */
function checkSpecificity(fields) {
  const genericPhrases = [
    'en person', 'någon', 'visar', 'presenterar', 'video om',
    'rolig video', 'humoristisk', 'underhållande', 'komisk',
    'a person', 'someone', 'shows', 'presents', 'funny video'
  ];

  const specificIndicators = [
    'barista', 'kund', 'chef', 'kollega', 'servitör', 'kock',
    'restaurang', 'café', 'bar', 'kök', 'bord', 'disk',
    'säger', 'gör', 'reagerar', 'upptäcker', 'klagar', 'beställer',
    'kaffe', 'mat', 'dryck', 'räkning', 'tips'
  ];

  const handling = (fields.handling?.content || '').toLowerCase();

  const genericCount = genericPhrases.filter(p => handling.includes(p)).length;
  const specificCount = specificIndicators.filter(s => handling.includes(s)).length;

  // Higher specific count = more specific. Penalty for generic phrases.
  const rawScore = (specificCount * 0.2) - (genericCount * 0.15);
  const score = Math.max(0, Math.min(1, 0.5 + rawScore));

  return {
    score,
    genericCount,
    specificCount,
    pass: score >= 0.5
  };
}

/**
 * Main evaluation function
 */
async function main() {
  console.log('📊 Format Compliance Evaluation\n');

  // Load taxonomy
  loadTaxonomy();
  console.log(`   Loaded ${VALID_MECHANISMS.length} valid mechanism keywords\n`);

  // Load test data - use gold_standard for more entries
  const dataPath = fs.existsSync(TEST_SET_PATH) ? TEST_SET_PATH : GOLD_STANDARD_PATH;
  if (!fs.existsSync(dataPath)) {
    console.error('❌ No test data found.');
    process.exit(1);
  }

  const lines = fs.readFileSync(dataPath, 'utf-8').split('\n').filter(l => l.trim());
  let examples = lines.map(l => JSON.parse(l));

  if (LIMIT < examples.length) {
    examples = examples.slice(0, LIMIT);
    console.log(`   Limiting to ${LIMIT} examples\n`);
  }

  console.log(`📁 Loaded ${examples.length} examples from ${path.basename(dataPath)}\n`);

  // Aggregate metrics
  const aggregates = {
    structural: [],
    mechanism: [],
    format: [],
    length: [],
    language: [],
    specificity: []
  };

  // Individual results
  const results = [];

  console.log('🔍 Evaluating...\n');

  for (let i = 0; i < examples.length; i++) {
    const example = examples[i];
    const shortUrl = (example.url || `example-${i}`).split('/').pop()?.slice(0, 20) || `item-${i}`;

    // Skip entries marked as [BAD] - they're intentional failures
    if (example.analysis?.includes('[BAD]')) {
      if (verbose) console.log(`[${i + 1}] ${shortUrl}: Skipped (marked as BAD)`);
      continue;
    }

    const fields = extractFields(example.analysis || '');

    // Run all checks
    const structural = checkStructuralCompleteness(fields);
    const mechanism = checkMechanismValidity(fields.mekanism);
    const format = checkFormatCompliance(example.analysis || '');
    const length = checkLengthAppropriateness(fields);
    const language = checkLanguageConsistency(example.analysis || '');
    const specificity = checkSpecificity(fields);

    // Calculate overall score
    const overall = (
      structural.score * 0.25 +
      mechanism.score * 0.20 +
      format.score * 0.15 +
      length.score * 0.15 +
      language.score * 0.10 +
      specificity.score * 0.15
    );

    // Track aggregates
    aggregates.structural.push(structural.score);
    aggregates.mechanism.push(mechanism.score);
    aggregates.format.push(format.score);
    aggregates.length.push(length.score);
    aggregates.language.push(language.score);
    aggregates.specificity.push(specificity.score);

    // Store result
    const result = {
      url: example.url,
      source: example.source,
      overall,
      checks: {
        structural,
        mechanism,
        format,
        length,
        language,
        specificity
      }
    };
    results.push(result);

    if (verbose) {
      const status = overall >= 0.8 ? '✓' : overall >= 0.6 ? '~' : '✗';
      console.log(`[${i + 1}] ${status} ${shortUrl}: ${(overall * 100).toFixed(0)}%`);

      if (overall < 0.8) {
        if (!structural.pass) console.log(`    - Missing: ${structural.missing.join(', ')}`);
        if (!mechanism.pass) console.log(`    - Mechanism: no recognized keywords`);
        if (!format.pass) console.log(`    - Format: ${format.issues.join(', ')}`);
      }
    }
  }

  // Calculate summary
  const avg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const summary = {
    structural: (avg(aggregates.structural) * 100).toFixed(1),
    mechanism: (avg(aggregates.mechanism) * 100).toFixed(1),
    format: (avg(aggregates.format) * 100).toFixed(1),
    length: (avg(aggregates.length) * 100).toFixed(1),
    language: (avg(aggregates.language) * 100).toFixed(1),
    specificity: (avg(aggregates.specificity) * 100).toFixed(1),
    overall: (
      avg(aggregates.structural) * 0.25 +
      avg(aggregates.mechanism) * 0.20 +
      avg(aggregates.format) * 0.15 +
      avg(aggregates.length) * 0.15 +
      avg(aggregates.language) * 0.10 +
      avg(aggregates.specificity) * 0.15
    ) * 100
  };

  // Print results
  console.log('\n' + '='.repeat(50));
  console.log('📊 FORMAT COMPLIANCE RESULTS');
  console.log('='.repeat(50));
  console.log(`\nExamples evaluated: ${results.length}`);
  console.log(`Source: ${path.basename(dataPath)}`);
  console.log(`Evaluated: ${new Date().toISOString()}`);
  console.log('\n📈 Format Checks (higher is better):');
  console.log(`   Structural Completeness:  ${summary.structural}%  (has all 4 sections)`);
  console.log(`   Mechanism Vocabulary:     ${summary.mechanism}%  (uses taxonomy terms)`);
  console.log(`   Markdown Formatting:      ${summary.format}%  (correct bold/structure)`);
  console.log(`   Length Appropriateness:   ${summary.length}%  (not too short/long)`);
  console.log(`   Language Consistency:     ${summary.language}%  (Swedish throughout)`);
  console.log(`   Specificity:              ${summary.specificity}%  (concrete details)`);
  console.log(`   ─────────────────────────────────────`);
  console.log(`   Overall Compliance:       ${summary.overall.toFixed(1)}%`);

  // Pass/fail summary
  const passing = results.filter(r => r.overall >= 0.8).length;
  const marginal = results.filter(r => r.overall >= 0.6 && r.overall < 0.8).length;
  const failing = results.filter(r => r.overall < 0.6).length;

  console.log('\n📋 Distribution:');
  console.log(`   ✓ Passing (≥80%):   ${passing} (${(passing / results.length * 100).toFixed(0)}%)`);
  console.log(`   ~ Marginal (60-79%): ${marginal} (${(marginal / results.length * 100).toFixed(0)}%)`);
  console.log(`   ✗ Failing (<60%):   ${failing} (${(failing / results.length * 100).toFixed(0)}%)`);

  // Common issues
  const issues = {
    missingSections: results.filter(r => !r.checks.structural.pass).length,
    noMechanism: results.filter(r => !r.checks.mechanism.pass).length,
    formatIssues: results.filter(r => !r.checks.format.pass).length,
    lengthIssues: results.filter(r => !r.checks.length.pass).length,
    languageMixed: results.filter(r => !r.checks.language.pass).length,
    tooGeneric: results.filter(r => !r.checks.specificity.pass).length
  };

  console.log('\n⚠️ Common Issues:');
  console.log(`   Missing sections:     ${issues.missingSections}`);
  console.log(`   No valid mechanism:   ${issues.noMechanism}`);
  console.log(`   Format problems:      ${issues.formatIssues}`);
  console.log(`   Length issues:        ${issues.lengthIssues}`);
  console.log(`   Mixed language:       ${issues.languageMixed}`);
  console.log(`   Too generic:          ${issues.tooGeneric}`);

  // Save results
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultFile = path.join(RESULTS_DIR, `format_compliance_${timestamp}.json`);

  fs.writeFileSync(resultFile, JSON.stringify({
    type: 'format_compliance',
    timestamp: new Date().toISOString(),
    source: path.basename(dataPath),
    examplesEvaluated: results.length,
    summary,
    issues,
    details: results
  }, null, 2));

  console.log(`\n💾 Results saved to: ${resultFile}`);

  // Show worst performers
  if (failing > 0 && verbose) {
    console.log('\n❌ Lowest scoring entries:');
    const sorted = [...results].sort((a, b) => a.overall - b.overall);
    for (const r of sorted.slice(0, 5)) {
      console.log(`   ${(r.overall * 100).toFixed(0)}% - ${r.url?.slice(-30)}`);
    }
  }
}

main().catch(console.error);
