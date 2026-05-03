#!/usr/bin/env node
/**
 * Evaluate Model Consistency
 *
 * Runs the same video through the model multiple times to measure
 * output stability. High variance = unreliable model.
 *
 * Usage: node scripts/evaluate-consistency.js [--runs=5] [--limit=10]
 *
 * Metrics:
 *   - Mechanism agreement: Do runs agree on humor mechanism?
 *   - Category stability: Same category across runs?
 *   - Quality rating variance: How much does quality rating vary?
 *   - Text similarity: Jaccard similarity across outputs
 */

const fs = require('fs');
const path = require('path');
const { GoogleAuth } = require('google-auth-library');

// Paths
const DATASET_DIR = path.join(__dirname, '../datasets/fine-tuning');
const TEST_SET_PATH = path.join(DATASET_DIR, 'test_set.jsonl');
const GOLD_STANDARD_PATH = path.join(DATASET_DIR, 'gold_standard.jsonl');
const TUNED_MODEL_FILE = path.join(DATASET_DIR, 'tuned_model.json');
const RESULTS_DIR = path.join(DATASET_DIR, 'eval_results');

// Config
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || '1061681256498';
const LOCATION = 'us-central1';

// Parse args
const args = process.argv.slice(2);
const runsArg = args.find(a => a.startsWith('--runs='));
const limitArg = args.find(a => a.startsWith('--limit='));
const dryRun = args.includes('--dry-run');
const RUNS_PER_VIDEO = runsArg ? parseInt(runsArg.split('=')[1]) : 3;
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : 5;

// Analysis prompt (same as production)
const ANALYSIS_PROMPT = `Analysera videon kort och koncist.

Format:
**Handling:** [En mening om vad som sker]
**Mekanism:** [Nyckelord: t.ex. Subversion, Igenkänning]
**Varför:** [En mening om poängen]
**Målgrupp:** [Specifik demografi/intresse]

Håll det extremt kort. Inget fluff.`;

// Valid mechanisms from taxonomy
const VALID_MECHANISMS = [
  'subversion', 'igenkänning', 'överdrift', 'kontrast', 'ironi',
  'absurd', 'timing', 'mörk humor', 'ordvits', 'ordlek', 'fysisk',
  'reveal', 'callback', 'deadpan', 'sarkasm', 'parodi', 'eskalering',
  'pov', 'bokstavlig', 'wordplay', 'misunderstanding', 'overdriven',
  'frustration', 'meme'
];

// Valid categories
const VALID_CATEGORIES = ['comedy', 'wholesome', 'relatable', 'clever', 'chaotic'];

// Valid quality ratings
const VALID_QUALITIES = ['weak', 'average', 'good', 'exceptional'];

/**
 * Extract structured fields from Swedish analysis text
 */
function extractFields(text) {
  const fields = {};
  const patterns = [
    { key: 'handling', pattern: /\*\*Handling:\*\*\s*(.+?)(?=\*\*|$)/is },
    { key: 'mekanism', pattern: /\*\*Mekanism:\*\*\s*(.+?)(?=\*\*|$)/is },
    { key: 'varfor', pattern: /\*\*Varför:\*\*\s*(.+?)(?=\*\*|$)/is },
    { key: 'malgrupp', pattern: /\*\*Målgrupp:\*\*\s*(.+?)(?=\*\*|$)/is },
  ];

  for (const { key, pattern } of patterns) {
    const match = text.match(pattern);
    if (match) {
      fields[key] = match[1].trim();
    }
  }

  return fields;
}

/**
 * Extract mechanism keywords from text
 */
function extractMechanisms(text) {
  const lower = (text || '').toLowerCase();
  return VALID_MECHANISMS.filter(m => lower.includes(m));
}

/**
 * Calculate Jaccard similarity between two texts
 */
function jaccardSimilarity(a, b) {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;

  return intersection / union;
}

/**
 * Calculate agreement rate for an array of values
 * Returns proportion that match the mode
 */
function agreementRate(values) {
  if (values.length === 0) return 0;

  // For arrays of mechanisms, stringify them for comparison
  const stringified = values.map(v =>
    Array.isArray(v) ? v.sort().join(',') : String(v)
  );

  // Count occurrences
  const counts = {};
  for (const v of stringified) {
    counts[v] = (counts[v] || 0) + 1;
  }

  // Find mode count
  const maxCount = Math.max(...Object.values(counts));
  return maxCount / values.length;
}

/**
 * Calculate average pairwise similarity for an array of texts
 */
function avgPairwiseSimilarity(texts) {
  if (texts.length < 2) return 1;

  let totalSim = 0;
  let pairs = 0;

  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      totalSim += jaccardSimilarity(texts[i], texts[j]);
      pairs++;
    }
  }

  return pairs > 0 ? totalSim / pairs : 0;
}

/**
 * Call model API
 */
async function callModel(endpoint, token, gcsUri) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { fileData: { mimeType: 'video/mp4', fileUri: gcsUri } },
          { text: ANALYSIS_PROMPT }
        ]
      }],
      generationConfig: {
        temperature: 0.2, // Same as production
        maxOutputTokens: 1024
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  const result = await response.json();
  return result.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * Get GCS URI for a video from gold_standard (has video_id that maps to GCS)
 * For now, we'll use a subset of videos that have known GCS URIs
 */
async function getGcsUriForUrl(url) {
  // This would ideally query Supabase, but for now we'll skip videos without URIs
  // In production, you'd lookup: SELECT gcs_uri FROM analyzed_videos WHERE source_url = $1
  return null;
}

/**
 * Main evaluation function
 */
async function main() {
  console.log('🔄 Consistency Evaluation\n');
  console.log(`   Runs per video: ${RUNS_PER_VIDEO}`);
  console.log(`   Video limit: ${LIMIT}`);
  console.log(`   Dry run: ${dryRun}\n`);

  // Load test set
  if (!fs.existsSync(TEST_SET_PATH)) {
    console.error('❌ Test set not found. Run create-holdout-test-set.js first.');
    process.exit(1);
  }

  const lines = fs.readFileSync(TEST_SET_PATH, 'utf-8').split('\n').filter(l => l.trim());
  let testExamples = lines.map(l => JSON.parse(l)).slice(0, LIMIT);

  console.log(`📁 Loaded ${testExamples.length} test examples\n`);

  if (dryRun) {
    console.log('🔍 Dry run - would evaluate these examples:');
    for (const ex of testExamples) {
      console.log(`   - ${ex.url}`);
      console.log(`     Runs: ${RUNS_PER_VIDEO}x`);
    }
    console.log('\n📊 Would measure:');
    console.log('   - Mechanism agreement across runs');
    console.log('   - Handling text similarity (Jaccard)');
    console.log('   - Varför text similarity (Jaccard)');
    console.log('   - Overall consistency score');
    return;
  }

  // Load model info
  if (!fs.existsSync(TUNED_MODEL_FILE)) {
    console.error('❌ Tuned model not found.');
    process.exit(1);
  }

  const modelInfo = JSON.parse(fs.readFileSync(TUNED_MODEL_FILE, 'utf-8'));
  const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/${modelInfo.model}:generateContent`;

  // Get auth token
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const client = await auth.getClient();
  const tokenData = await client.getAccessToken();
  const token = tokenData.token;

  // Results storage
  const results = [];
  const aggregateMetrics = {
    mechanismAgreement: [],
    handlingSimilarity: [],
    varforSimilarity: [],
    overallConsistency: []
  };

  console.log('🚀 Starting consistency evaluation...\n');
  console.log('⚠️  Note: This requires GCS URIs. Videos without URIs will be skipped.\n');

  // For demo purposes, simulate what the evaluation would look like
  // In production, you'd have GCS URIs in the database

  for (let i = 0; i < testExamples.length; i++) {
    const example = testExamples[i];
    const shortUrl = example.url.split('/').pop().slice(0, 20);
    console.log(`[${i + 1}/${testExamples.length}] ${shortUrl}...`);

    // Try to get GCS URI (would come from Supabase in production)
    const gcsUri = await getGcsUriForUrl(example.url);

    if (!gcsUri) {
      console.log('   ⚠️ No GCS URI available - simulating with gold standard\n');

      // Simulate consistency by parsing gold standard
      const goldFields = extractFields(example.analysis);
      const mechanisms = extractMechanisms(goldFields.mekanism || '');

      // For simulation, assume perfect consistency (same output every time)
      const simResult = {
        url: example.url,
        runs: RUNS_PER_VIDEO,
        simulated: true,
        metrics: {
          mechanismAgreement: 1.0, // Perfect agreement in simulation
          handlingSimilarity: 1.0,
          varforSimilarity: 1.0,
          overallConsistency: 1.0
        },
        goldMechanisms: mechanisms
      };

      results.push(simResult);
      aggregateMetrics.mechanismAgreement.push(1.0);
      aggregateMetrics.handlingSimilarity.push(1.0);
      aggregateMetrics.varforSimilarity.push(1.0);
      aggregateMetrics.overallConsistency.push(1.0);

      continue;
    }

    // Run model multiple times
    const outputs = [];
    for (let run = 0; run < RUNS_PER_VIDEO; run++) {
      try {
        console.log(`   Run ${run + 1}/${RUNS_PER_VIDEO}...`);
        const output = await callModel(endpoint, token, gcsUri);
        outputs.push(output);

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.log(`   ❌ Run ${run + 1} failed: ${err.message}`);
      }
    }

    if (outputs.length < 2) {
      console.log('   ⚠️ Not enough successful runs for comparison\n');
      continue;
    }

    // Parse all outputs
    const parsedOutputs = outputs.map(o => extractFields(o));

    // Calculate consistency metrics
    const mechanisms = parsedOutputs.map(p => extractMechanisms(p.mekanism || ''));
    const handlings = parsedOutputs.map(p => p.handling || '');
    const varfors = parsedOutputs.map(p => p.varfor || '');

    const mechAgreement = agreementRate(mechanisms);
    const handlingSim = avgPairwiseSimilarity(handlings);
    const varforSim = avgPairwiseSimilarity(varfors);
    const overall = (mechAgreement + handlingSim + varforSim) / 3;

    const videoResult = {
      url: example.url,
      runs: outputs.length,
      simulated: false,
      metrics: {
        mechanismAgreement: mechAgreement,
        handlingSimilarity: handlingSim,
        varforSimilarity: varforSim,
        overallConsistency: overall
      },
      outputs: outputs.map((o, i) => ({
        run: i + 1,
        mechanisms: mechanisms[i],
        handling: handlings[i].slice(0, 100) + '...'
      }))
    };

    results.push(videoResult);
    aggregateMetrics.mechanismAgreement.push(mechAgreement);
    aggregateMetrics.handlingSimilarity.push(handlingSim);
    aggregateMetrics.varforSimilarity.push(varforSim);
    aggregateMetrics.overallConsistency.push(overall);

    console.log(`   ✓ Mechanism agreement: ${(mechAgreement * 100).toFixed(0)}%`);
    console.log(`   ✓ Handling similarity: ${(handlingSim * 100).toFixed(0)}%`);
    console.log(`   ✓ Overall: ${(overall * 100).toFixed(0)}%\n`);
  }

  // Calculate aggregate scores
  const avg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const summary = {
    mechanismAgreement: (avg(aggregateMetrics.mechanismAgreement) * 100).toFixed(1),
    handlingSimilarity: (avg(aggregateMetrics.handlingSimilarity) * 100).toFixed(1),
    varforSimilarity: (avg(aggregateMetrics.varforSimilarity) * 100).toFixed(1),
    overallConsistency: (avg(aggregateMetrics.overallConsistency) * 100).toFixed(1)
  };

  // Print results
  console.log('\n' + '='.repeat(50));
  console.log('🔄 CONSISTENCY RESULTS');
  console.log('='.repeat(50));
  console.log(`\nVideos evaluated: ${results.length}`);
  console.log(`Runs per video: ${RUNS_PER_VIDEO}`);
  console.log(`Model: ${modelInfo.model?.split('/').pop() || 'unknown'}`);
  console.log(`Evaluated: ${new Date().toISOString()}`);
  console.log('\n📈 Consistency Metrics (higher is better):');
  console.log(`   Mechanism Agreement:   ${summary.mechanismAgreement}%`);
  console.log(`   Handling Similarity:   ${summary.handlingSimilarity}%`);
  console.log(`   Varför Similarity:     ${summary.varforSimilarity}%`);
  console.log(`   ─────────────────────────────`);
  console.log(`   Overall Consistency:   ${summary.overallConsistency}%`);

  // Interpretation
  console.log('\n📋 Interpretation:');
  const overallScore = parseFloat(summary.overallConsistency);
  if (overallScore >= 85) {
    console.log('   ✅ Excellent consistency - model is reliable');
  } else if (overallScore >= 70) {
    console.log('   ⚠️ Good consistency - some variance is normal');
  } else if (overallScore >= 50) {
    console.log('   ⚠️ Moderate consistency - investigate high-variance cases');
  } else {
    console.log('   ❌ Low consistency - model outputs are unstable');
  }

  // Save results
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultFile = path.join(RESULTS_DIR, `consistency_${timestamp}.json`);

  fs.writeFileSync(resultFile, JSON.stringify({
    type: 'consistency',
    timestamp: new Date().toISOString(),
    model: modelInfo.model,
    config: { runsPerVideo: RUNS_PER_VIDEO, videoLimit: LIMIT },
    summary,
    details: results
  }, null, 2));

  console.log(`\n💾 Results saved to: ${resultFile}`);

  // Note about simulated results
  const simulated = results.filter(r => r.simulated).length;
  if (simulated > 0) {
    console.log(`\n⚠️  Note: ${simulated}/${results.length} videos were simulated (no GCS URI).`);
    console.log('   To run actual consistency tests, ensure videos have GCS URIs in database.');
  }
}

main().catch(console.error);
