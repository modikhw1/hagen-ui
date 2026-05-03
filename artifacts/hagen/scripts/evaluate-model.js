#!/usr/bin/env node
/**
 * Unified Model Evaluation Runner
 *
 * Runs all automated evaluation tests and generates a combined report.
 * This is the main entry point for model evaluation.
 *
 * Usage:
 *   node scripts/evaluate-model.js                    # Run all tests
 *   node scripts/evaluate-model.js --format-only      # Only format compliance
 *   node scripts/evaluate-model.js --consistency-only # Only consistency
 *   node scripts/evaluate-model.js --quick            # Fast mode (fewer samples)
 *
 * Output:
 *   - Console summary with pass/fail status
 *   - Detailed JSON report in datasets/fine-tuning/eval_results/
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Paths
const DATASET_DIR = path.join(__dirname, '../datasets/fine-tuning');
const RESULTS_DIR = path.join(DATASET_DIR, 'eval_results');
const MODEL_VERSIONS_FILE = path.join(DATASET_DIR, 'model_versions.json');
const TUNED_MODEL_FILE = path.join(DATASET_DIR, 'tuned_model.json');

// Parse args
const args = process.argv.slice(2);
const formatOnly = args.includes('--format-only');
const consistencyOnly = args.includes('--consistency-only');
const quick = args.includes('--quick');
const verbose = args.includes('--verbose');

// Thresholds for pass/fail
const THRESHOLDS = {
  format: {
    structural: 90,      // 90% must have all sections
    mechanism: 80,       // 80% must use valid mechanisms
    format: 85,          // 85% must have correct formatting
    overall: 80          // 80% overall format compliance
  },
  consistency: {
    mechanismAgreement: 70,  // 70% mechanism agreement across runs
    textSimilarity: 60,      // 60% text similarity
    overall: 65              // 65% overall consistency
  }
};

/**
 * Run a script and capture output
 */
function runScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath, ...args], {
      cwd: path.dirname(scriptPath),
      stdio: ['inherit', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', data => {
      stdout += data.toString();
      if (verbose) process.stdout.write(data);
    });

    child.stderr.on('data', data => {
      stderr += data.toString();
      if (verbose) process.stderr.write(data);
    });

    child.on('close', code => {
      resolve({ code, stdout, stderr });
    });

    child.on('error', reject);
  });
}

/**
 * Find most recent result file of a type
 */
function findLatestResult(type) {
  if (!fs.existsSync(RESULTS_DIR)) return null;

  const files = fs.readdirSync(RESULTS_DIR)
    .filter(f => f.startsWith(type) && f.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) return null;

  const filepath = path.join(RESULTS_DIR, files[0]);
  return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
}

/**
 * Get current model info
 */
function getModelInfo() {
  if (!fs.existsSync(TUNED_MODEL_FILE)) {
    return { model: 'unknown', version: 'unknown' };
  }

  const info = JSON.parse(fs.readFileSync(TUNED_MODEL_FILE, 'utf-8'));
  const modelId = info.model?.split('/').pop() || 'unknown';
  return { model: info.model, version: modelId };
}

/**
 * Calculate pass/fail status
 */
function calculateStatus(metrics, thresholds) {
  const results = {};

  for (const [key, threshold] of Object.entries(thresholds)) {
    const value = parseFloat(metrics[key] || 0);
    results[key] = {
      value,
      threshold,
      pass: value >= threshold
    };
  }

  return results;
}

/**
 * Main function
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║           HAGEN MODEL EVALUATION SUITE                 ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const modelInfo = getModelInfo();
  console.log(`📦 Model: ${modelInfo.version}`);
  console.log(`📅 Date: ${new Date().toISOString().split('T')[0]}`);
  console.log(`⚙️  Mode: ${quick ? 'Quick' : 'Full'}\n`);

  const results = {
    timestamp: new Date().toISOString(),
    model: modelInfo,
    tests: {},
    overall: { pass: true, score: 0 }
  };

  // ============================================
  // FORMAT COMPLIANCE TEST
  // ============================================
  if (!consistencyOnly) {
    console.log('━'.repeat(50));
    console.log('📊 TEST 1: Format Compliance');
    console.log('━'.repeat(50));
    console.log('   Checking: Structure, vocabulary, markdown, language\n');

    const formatArgs = quick ? ['--limit=20'] : [];
    if (verbose) formatArgs.push('--verbose');

    await runScript(
      path.join(__dirname, 'evaluate-format-compliance.js'),
      formatArgs
    );

    // Load results
    const formatResult = findLatestResult('format_compliance');

    if (formatResult) {
      const status = calculateStatus(formatResult.summary, THRESHOLDS.format);

      results.tests.format = {
        summary: formatResult.summary,
        status,
        pass: Object.values(status).every(s => s.pass),
        issues: formatResult.issues
      };

      console.log('\n   Results:');
      for (const [key, s] of Object.entries(status)) {
        const icon = s.pass ? '✓' : '✗';
        const color = s.pass ? '' : ' ← BELOW THRESHOLD';
        console.log(`   ${icon} ${key}: ${s.value}% (threshold: ${s.threshold}%)${color}`);
      }

      if (!results.tests.format.pass) {
        results.overall.pass = false;
        console.log('\n   ❌ FORMAT COMPLIANCE: FAILED');
      } else {
        console.log('\n   ✅ FORMAT COMPLIANCE: PASSED');
      }
    } else {
      console.log('   ⚠️ No format compliance results found');
      results.tests.format = { error: 'No results' };
    }
  }

  // ============================================
  // CONSISTENCY TEST
  // ============================================
  if (!formatOnly) {
    console.log('\n' + '━'.repeat(50));
    console.log('🔄 TEST 2: Consistency');
    console.log('━'.repeat(50));
    console.log('   Checking: Output stability across multiple runs\n');

    const consistencyArgs = quick ? ['--limit=3', '--runs=2'] : ['--limit=5', '--runs=3'];
    if (verbose) consistencyArgs.push('--verbose');

    await runScript(
      path.join(__dirname, 'evaluate-consistency.js'),
      consistencyArgs
    );

    // Load results
    const consistencyResult = findLatestResult('consistency');

    if (consistencyResult) {
      const consistencyMetrics = {
        mechanismAgreement: parseFloat(consistencyResult.summary?.mechanismAgreement || 0),
        textSimilarity: (
          parseFloat(consistencyResult.summary?.handlingSimilarity || 0) +
          parseFloat(consistencyResult.summary?.varforSimilarity || 0)
        ) / 2,
        overall: parseFloat(consistencyResult.summary?.overallConsistency || 0)
      };

      const status = calculateStatus(consistencyMetrics, THRESHOLDS.consistency);

      results.tests.consistency = {
        summary: consistencyResult.summary,
        status,
        pass: Object.values(status).every(s => s.pass),
        simulated: consistencyResult.details?.some(d => d.simulated)
      };

      console.log('\n   Results:');
      for (const [key, s] of Object.entries(status)) {
        const icon = s.pass ? '✓' : '✗';
        const color = s.pass ? '' : ' ← BELOW THRESHOLD';
        console.log(`   ${icon} ${key}: ${s.value.toFixed(1)}% (threshold: ${s.threshold}%)${color}`);
      }

      if (results.tests.consistency.simulated) {
        console.log('\n   ⚠️ Note: Results are simulated (no live API calls)');
      }

      if (!results.tests.consistency.pass) {
        results.overall.pass = false;
        console.log('\n   ❌ CONSISTENCY: FAILED');
      } else {
        console.log('\n   ✅ CONSISTENCY: PASSED');
      }
    } else {
      console.log('   ⚠️ No consistency results found');
      results.tests.consistency = { error: 'No results' };
    }
  }

  // ============================================
  // OVERALL SUMMARY
  // ============================================
  console.log('\n' + '═'.repeat(50));
  console.log('📋 OVERALL EVALUATION SUMMARY');
  console.log('═'.repeat(50));

  // Calculate overall score
  const scores = [];
  if (results.tests.format?.summary) {
    scores.push(parseFloat(results.tests.format.summary.overall));
  }
  if (results.tests.consistency?.summary) {
    scores.push(parseFloat(results.tests.consistency.summary.overallConsistency));
  }

  results.overall.score = scores.length > 0
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : 0;

  console.log(`\n   Model Version: ${modelInfo.version}`);
  console.log(`   Tests Run: ${Object.keys(results.tests).length}`);
  console.log(`   Overall Score: ${results.overall.score.toFixed(1)}%`);

  if (results.overall.pass) {
    console.log('\n   ╔═══════════════════════════════════╗');
    console.log('   ║  ✅ ALL TESTS PASSED              ║');
    console.log('   ╚═══════════════════════════════════╝');
  } else {
    console.log('\n   ╔═══════════════════════════════════╗');
    console.log('   ║  ❌ SOME TESTS FAILED             ║');
    console.log('   ╚═══════════════════════════════════╝');

    // Show what failed
    console.log('\n   Failed tests:');
    for (const [name, test] of Object.entries(results.tests)) {
      if (!test.pass) {
        console.log(`   - ${name}`);
      }
    }
  }

  // Recommendations
  console.log('\n📝 Recommendations:');

  if (results.tests.format?.issues) {
    const issues = results.tests.format.issues;
    if (issues.missingSections > 5) {
      console.log('   • Add more training examples with complete structure');
    }
    if (issues.noMechanism > 10) {
      console.log('   • Include more mechanism keywords in training data');
    }
    if (issues.tooGeneric > 10) {
      console.log('   • Use more specific, concrete examples in training');
    }
  }

  if (results.tests.consistency?.simulated) {
    console.log('   • Run consistency test with real API calls for accurate results');
    console.log('   • Ensure test videos have GCS URIs in database');
  }

  // Save combined report
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportFile = path.join(RESULTS_DIR, `evaluation_report_${timestamp}.json`);

  fs.writeFileSync(reportFile, JSON.stringify(results, null, 2));
  console.log(`\n💾 Full report saved to: ${reportFile}`);

  // Exit with appropriate code
  process.exit(results.overall.pass ? 0 : 1);
}

main().catch(err => {
  console.error('❌ Evaluation failed:', err.message);
  process.exit(1);
});
