/**
 * Compare v7.B (mixed) vs v7.X (video-only)
 *
 * Tests 30 random TikTok clips with both models.
 * Goal: See if text data helps or hurts video analysis.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const CONFIG = {
  outputPath: path.join(__dirname, '../datasets/fine-tuning'),
  testCount: 30,
  delayBetweenCalls: 2000, // ms between API calls to avoid rate limits
};

async function main() {
  console.log('='.repeat(60));
  console.log('V7.B vs V7.X COMPARISON');
  console.log('='.repeat(60));
  console.log('\nv7.B: 675 examples (262 video + 413 Simpsons text)');
  console.log('v7.X: 266 examples (video only)\n');

  // Check model versions
  const versionsPath = path.join(CONFIG.outputPath, 'model_versions.json');
  const versions = JSON.parse(fs.readFileSync(versionsPath, 'utf-8'));

  if (!versions.versions['v7.B']?.endpoint) {
    console.error('❌ v7.B endpoint not found');
    process.exit(1);
  }

  if (!versions.versions['v7.X']?.endpoint) {
    // Check if still training
    if (versions.versions['v7.X']?.status === 'training') {
      console.log('⏳ v7.X is still training. Check status with:');
      console.log('   node scripts/fine-tune-gemini.js status');
      console.log('\nRun this script again after training completes.');
      process.exit(0);
    }
    console.error('❌ v7.X endpoint not found');
    process.exit(1);
  }

  console.log('✓ Both models ready');
  console.log(`  v7.B endpoint: ${versions.versions['v7.B'].endpoint}`);
  console.log(`  v7.X endpoint: ${versions.versions['v7.X'].endpoint}`);

  // Get test videos from Supabase (random selection)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('\n📹 Selecting random test videos...');
  const { data: allVideos } = await supabase
    .from('analyzed_videos')
    .select('video_url, gcs_uri, created_at')
    .not('gcs_uri', 'is', null);

  if (!allVideos || allVideos.length < CONFIG.testCount) {
    console.error(`❌ Not enough videos. Found ${allVideos?.length || 0}, need ${CONFIG.testCount}`);
    process.exit(1);
  }

  // Shuffle and take testCount
  const shuffled = [...allVideos].sort(() => Math.random() - 0.5);
  const testVideos = shuffled.slice(0, CONFIG.testCount);

  console.log(`   Selected ${testVideos.length} random videos for testing`);

  // Run comparison
  const results = [];
  const apiBase = 'http://localhost:3000/api/fine-tuning/generate';

  console.log('\n🔬 Running analysis...\n');

  for (let i = 0; i < testVideos.length; i++) {
    const video = testVideos[i];
    console.log(`[${i + 1}/${testVideos.length}] ${video.video_url.substring(0, 50)}...`);

    try {
      // Analyze with v7.B
      const v7bResponse = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: video.video_url,
          version: 'v7.B',
          mode: 'balanced'
        })
      });

      if (!v7bResponse.ok) {
        console.log(`   ⚠️ v7.B failed: ${v7bResponse.status}`);
        await delay(CONFIG.delayBetweenCalls);
        continue;
      }

      const v7bData = await v7bResponse.json();

      await delay(CONFIG.delayBetweenCalls);

      // Analyze with v7.X
      const v7xResponse = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: video.video_url,
          version: 'v7.X',
          mode: 'balanced'
        })
      });

      if (!v7xResponse.ok) {
        console.log(`   ⚠️ v7.X failed: ${v7xResponse.status}`);
        await delay(CONFIG.delayBetweenCalls);
        continue;
      }

      const v7xData = await v7xResponse.json();

      results.push({
        url: video.video_url,
        gcsUri: video.gcs_uri,
        v7b: {
          analysis: v7bData.analysis,
          mechanism: extractMechanism(v7bData.analysis),
          length: v7bData.analysis?.length || 0
        },
        v7x: {
          analysis: v7xData.analysis,
          mechanism: extractMechanism(v7xData.analysis),
          length: v7xData.analysis?.length || 0
        }
      });

      console.log(`   ✓ v7.B: ${v7bData.analysis?.substring(0, 60)}...`);
      console.log(`   ✓ v7.X: ${v7xData.analysis?.substring(0, 60)}...`);

    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
    }

    await delay(CONFIG.delayBetweenCalls);
  }

  // Save results
  const timestamp = Date.now();
  const resultsFile = `comparison_v7b_v7x_${timestamp}.json`;
  fs.writeFileSync(
    path.join(CONFIG.outputPath, resultsFile),
    JSON.stringify({
      metadata: {
        timestamp: new Date().toISOString(),
        testCount: results.length,
        v7b: { examples: 675, composition: '262 video + 413 text' },
        v7x: { examples: 266, composition: '266 video only' }
      },
      results
    }, null, 2)
  );

  console.log(`\n💾 Results saved: ${resultsFile}`);

  // Generate summary
  generateSummary(results);
}

function extractMechanism(analysis) {
  if (!analysis) return 'unknown';
  const match = analysis.match(/\*\*Mekanism:\*\*\s*([^\n*]+)/i);
  return match ? match[1].trim() : 'unknown';
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateSummary(results) {
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  console.log(`\nTotal comparisons: ${results.length}`);

  // Average analysis length
  const avgV7bLen = results.reduce((sum, r) => sum + r.v7b.length, 0) / results.length;
  const avgV7xLen = results.reduce((sum, r) => sum + r.v7x.length, 0) / results.length;

  console.log(`\nAverage analysis length:`);
  console.log(`  v7.B (mixed):      ${Math.round(avgV7bLen)} chars`);
  console.log(`  v7.X (video-only): ${Math.round(avgV7xLen)} chars`);

  // Mechanism diversity
  const v7bMechanisms = new Set(results.map(r => r.v7b.mechanism.toLowerCase()));
  const v7xMechanisms = new Set(results.map(r => r.v7x.mechanism.toLowerCase()));

  console.log(`\nUnique mechanisms identified:`);
  console.log(`  v7.B: ${v7bMechanisms.size}`);
  console.log(`  v7.X: ${v7xMechanisms.size}`);

  // Agreement rate
  let agreements = 0;
  for (const r of results) {
    const v7bMech = r.v7b.mechanism.toLowerCase();
    const v7xMech = r.v7x.mechanism.toLowerCase();
    // Simple check if they share key words
    const v7bWords = new Set(v7bMech.split(/[,\s]+/));
    const v7xWords = new Set(v7xMech.split(/[,\s]+/));
    const overlap = [...v7bWords].filter(w => v7xWords.has(w) && w.length > 3);
    if (overlap.length > 0) agreements++;
  }

  console.log(`\nMechanism agreement: ${agreements}/${results.length} (${Math.round(100*agreements/results.length)}%)`);

  console.log('\n' + '='.repeat(60));
  console.log('MANUAL REVIEW NEEDED');
  console.log('='.repeat(60));
  console.log(`
To determine which model is better, manually review the results:

1. Open: datasets/fine-tuning/comparison_v7b_v7x_*.json
2. For each video, compare v7.B vs v7.X analysis
3. Score: Which captures the actual humor mechanism?
4. Note: Does v7.X miss things v7.B catches (or vice versa)?

Key questions:
- Does v7.X (video-only) describe what's VISIBLE more accurately?
- Does v7.B (mixed) use better vocabulary but miss visual cues?
- Are there patterns where one clearly outperforms the other?
`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
