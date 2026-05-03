/**
 * Progress Tracker
 * 
 * Tracks improvement in joke understanding over time.
 * Saves snapshots so you can see: "Am I getting better?"
 * 
 * Usage:
 *   node scripts/track-progress.js              # Run full benchmark & save snapshot
 *   node scripts/track-progress.js --show       # Show progress chart
 *   node scripts/track-progress.js --compare    # Compare current vs last snapshot
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PROGRESS_FILE = path.join(__dirname, '..', 'datasets', 'progress_snapshots.json');

// Parse args
const showOnly = process.argv.includes('--show');
const compareOnly = process.argv.includes('--compare');
const benchmarkSize = parseInt(process.argv.find(a => a.startsWith('--size='))?.split('=')[1] || '20');

/**
 * Load existing progress data
 */
function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    } catch (e) {
      return { snapshots: [] };
    }
  }
  return { snapshots: [] };
}

/**
 * Save progress data
 */
function saveProgress(data) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
}

/**
 * Analyze with current prompt
 */
async function analyzeWithGemini(example) {
  // Dynamically load the current deep reasoning chain
  let DEEP_REASONING_CHAIN;
  try {
    const deepReasoning = require('../src/lib/services/video/deep-reasoning.ts');
    DEEP_REASONING_CHAIN = deepReasoning.DEEP_REASONING_CHAIN;
  } catch (e) {
    throw new Error('Could not load deep reasoning chain. Run with ts-node or compile first.');
  }
  
  const prompt = `${DEEP_REASONING_CHAIN}

VIDEO TO ANALYZE:
${example.video_summary || ''}
${example.humor_type_correction?.transcript ? '\nTranscript: ' + example.humor_type_correction.transcript : ''}

Respond with JSON:
{
  "deep_reasoning": {
    "character_dynamic": "...",
    "underlying_tension": "...",
    "the_real_mechanism": "..."
  },
  "humorMechanism": "..."
}`;
  
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-exp',
    generationConfig: { temperature: 0.3, responseMimeType: 'application/json' }
  });
  
  const result = await model.generateContent(prompt);
  return JSON.parse(result.response.text());
}

/**
 * Judge analysis quality
 */
async function judgeAnalysis(aiAnalysis, example) {
  const humanAnalysis = [
    example.correct_interpretation,
    example.explanation,
    example.humor_type_correction?.humanInsight
  ].filter(Boolean).join('\n');
  
  const prompt = `Rate how well the AI captured the human expert's understanding (0-100).

HUMAN EXPERT:
${humanAnalysis}

AI ANALYSIS:
${JSON.stringify(aiAnalysis, null, 2)}

Respond with JSON: { "score": <0-100> }`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.1
  });
  
  return JSON.parse(response.choices[0].message.content).score;
}

/**
 * Run benchmark
 */
async function runBenchmark(size = 20) {
  console.log(`Running benchmark on ${size} examples...\n`);
  
  const { data: examples } = await supabase
    .from('video_analysis_examples')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(size);
  
  const scores = [];
  
  for (let i = 0; i < examples.length; i++) {
    const example = examples[i];
    const preview = example.video_summary?.substring(0, 40) || 'No summary';
    
    try {
      process.stdout.write(`[${i + 1}/${size}] ${preview}... `);
      
      const analysis = await analyzeWithGemini(example);
      const score = await judgeAnalysis(analysis, example);
      
      scores.push(score);
      console.log(`${score}%`);
      
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.log(`Error`);
    }
  }
  
  return scores;
}

/**
 * Create snapshot
 */
async function createSnapshot() {
  const scores = await runBenchmark(benchmarkSize);
  
  const snapshot = {
    timestamp: new Date().toISOString(),
    date: new Date().toISOString().split('T')[0],
    benchmark_size: scores.length,
    scores: {
      average: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10,
      median: [...scores].sort((a, b) => a - b)[Math.floor(scores.length / 2)],
      min: Math.min(...scores),
      max: Math.max(...scores)
    },
    distribution: {
      excellent: scores.filter(s => s >= 90).length,
      good: scores.filter(s => s >= 75 && s < 90).length,
      acceptable: scores.filter(s => s >= 60 && s < 75).length,
      poor: scores.filter(s => s < 60).length
    },
    raw_scores: scores
  };
  
  const progress = loadProgress();
  progress.snapshots = progress.snapshots || [];
  progress.snapshots.push(snapshot);
  saveProgress(progress);
  
  console.log('\n✓ Snapshot saved\n');
  return snapshot;
}

/**
 * Show progress chart
 */
function showProgressChart() {
  const progress = loadProgress();
  
  if (!progress.snapshots || progress.snapshots.length === 0) {
    console.log('No snapshots yet. Run without --show to create first snapshot.');
    return;
  }
  
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║              JOKE UNDERSTANDING PROGRESS                  ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  console.log('Date       | Avg Score | Δ    | Distribution (E/G/A/P)');
  console.log('─'.repeat(60));
  
  for (let i = 0; i < progress.snapshots.length; i++) {
    const snap = progress.snapshots[i];
    const prev = i > 0 ? progress.snapshots[i - 1] : null;
    const delta = prev ? snap.scores.average - prev.scores.average : 0;
    
    const date = snap.date || snap.timestamp.split('T')[0];
    const avg = snap.scores.average.toFixed(1);
    const deltaStr = delta === 0 ? '   -  ' : 
                     delta > 0 ? `+${delta.toFixed(1)}`.padStart(6) : 
                     delta.toFixed(1).padStart(6);
    
    const dist = snap.distribution;
    const distStr = `${dist.excellent}/${dist.good}/${dist.acceptable}/${dist.poor}`;
    
    console.log(`${date} | ${avg.padStart(5)}%   | ${deltaStr} | ${distStr}`);
  }
  
  console.log('\n' + '─'.repeat(60));
  
  // Overall trend
  if (progress.snapshots.length >= 2) {
    const first = progress.snapshots[0];
    const last = progress.snapshots[progress.snapshots.length - 1];
    const totalImprovement = last.scores.average - first.scores.average;
    
    console.log('\nOVERALL PROGRESS:');
    console.log(`  Start: ${first.scores.average.toFixed(1)}%`);
    console.log(`  Current: ${last.scores.average.toFixed(1)}%`);
    console.log(`  Total Improvement: ${totalImprovement > 0 ? '+' : ''}${totalImprovement.toFixed(1)}%`);
    
    if (totalImprovement > 10) {
      console.log('\n  🎉 Significant improvement! Your prompt iterations are working.');
    } else if (totalImprovement > 5) {
      console.log('\n  👍 Good progress. Keep iterating.');
    } else if (totalImprovement > 0) {
      console.log('\n  📈 Slight improvement. Continue refining.');
    } else {
      console.log('\n  ⚠️  No improvement yet. Review your prompt changes.');
    }
  }
  
  console.log();
}

/**
 * Compare current vs last
 */
async function compareWithLast() {
  const progress = loadProgress();
  
  if (!progress.snapshots || progress.snapshots.length === 0) {
    console.log('No previous snapshot to compare against.');
    return;
  }
  
  const last = progress.snapshots[progress.snapshots.length - 1];
  
  console.log('Running quick benchmark to compare with last snapshot...\n');
  const currentScores = await runBenchmark(Math.min(10, benchmarkSize));
  
  const currentAvg = currentScores.reduce((a, b) => a + b, 0) / currentScores.length;
  const lastAvg = last.scores.average;
  const delta = currentAvg - lastAvg;
  
  console.log('\n' + '═'.repeat(60));
  console.log('COMPARISON');
  console.log('═'.repeat(60));
  console.log(`Last snapshot (${last.date}): ${lastAvg.toFixed(1)}%`);
  console.log(`Current run: ${currentAvg.toFixed(1)}%`);
  console.log(`Difference: ${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`);
  
  if (delta > 3) {
    console.log('\n✓ Improvement detected! Consider saving this as a new snapshot.');
  } else if (delta < -3) {
    console.log('\n⚠️  Regression detected. Review recent prompt changes.');
  } else {
    console.log('\n→ No significant change.');
  }
  
  console.log();
}

/**
 * Main
 */
async function main() {
  if (showOnly) {
    showProgressChart();
    return;
  }
  
  if (compareOnly) {
    await compareWithLast();
    return;
  }
  
  // Run full benchmark and save snapshot
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║           CREATING PROGRESS SNAPSHOT                      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  const snapshot = await createSnapshot();
  
  console.log('SNAPSHOT RESULTS:');
  console.log(`  Average: ${snapshot.scores.average}%`);
  console.log(`  Median: ${snapshot.scores.median}%`);
  console.log(`  Range: ${snapshot.scores.min}% - ${snapshot.scores.max}%`);
  console.log(`\n  Distribution:`);
  console.log(`    Excellent (90-100): ${snapshot.distribution.excellent}`);
  console.log(`    Good (75-89): ${snapshot.distribution.good}`);
  console.log(`    Acceptable (60-74): ${snapshot.distribution.acceptable}`);
  console.log(`    Poor (0-59): ${snapshot.distribution.poor}`);
  
  console.log(`\n✓ Saved to ${PROGRESS_FILE}`);
  console.log('\nView progress: node scripts/track-progress.js --show');
}

main().catch(console.error);
