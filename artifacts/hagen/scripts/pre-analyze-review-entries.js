/**
 * Pre-analyze all review entries with V7.B
 *
 * 1. Load comparison results (28 entries already analyzed)
 * 2. Load entries_for_review.json
 * 3. Merge V7.B analysis from comparison
 * 4. Batch-analyze remaining entries
 * 5. Save updated file ready for annotation
 */

const fs = require('fs');
const path = require('path');

const CONFIG = {
  comparisonPath: path.join(__dirname, '../datasets/fine-tuning/comparison_v7b_v7x_1767206332339.json'),
  reviewPath: path.join(__dirname, '../datasets/fine-tuning/entries_for_review.json'),
  apiBase: 'http://localhost:3000/api/fine-tuning/generate',
  delayBetweenRequests: 4000, // ms - be gentle with the API
  maxRetries: 2,
};

// Parse V7.B analysis text into structured fields
function parseV7BAnalysis(analysisText) {
  if (!analysisText) return null;

  const obsMatch = analysisText.match(/\*\*Observation:\*\*\s*([\s\S]*?)(?=\*\*Handling|\*\*Mekanism|$)/i);
  const handMatch = analysisText.match(/\*\*Handling:\*\*\s*([\s\S]*?)(?=\*\*Mekanism|\*\*Varför|$)/i);
  const mekMatch = analysisText.match(/\*\*Mekanism:\*\*\s*([\s\S]*?)(?=\*\*Varför|\*\*Målgrupp|$)/i);
  const varMatch = analysisText.match(/\*\*Varför:\*\*\s*([\s\S]*?)(?=\*\*Målgrupp|$)/i);
  const malMatch = analysisText.match(/\*\*Målgrupp:\*\*\s*([\s\S]*?)$/i);

  return {
    observation: obsMatch ? obsMatch[1].trim() : '',
    handling: handMatch ? handMatch[1].trim() : '',
    mekanism: mekMatch ? mekMatch[1].trim() : '',
    varfor: varMatch ? varMatch[1].trim() : '',
    malgrupp: malMatch ? malMatch[1].trim() : ''
  };
}

// Normalize URL for matching (remove query params)
function normalizeUrl(url) {
  return url ? url.split('?')[0] : '';
}

// Call V7.B API for analysis
async function analyzeWithV7B(url, retries = 0) {
  try {
    const response = await fetch(CONFIG.apiBase, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: url,
        version: 'v7.B',
        mode: 'balanced'
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.analysis || null;
  } catch (err) {
    if (retries < CONFIG.maxRetries) {
      console.log(`    Retry ${retries + 1}/${CONFIG.maxRetries}...`);
      await delay(2000);
      return analyzeWithV7B(url, retries + 1);
    }
    console.error(`    Failed: ${err.message}`);
    return null;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('='.repeat(60));
  console.log('PRE-ANALYZE REVIEW ENTRIES WITH V7.B');
  console.log('='.repeat(60));

  // Load comparison results (already analyzed)
  let comparisonMap = new Map();
  try {
    const comparison = JSON.parse(fs.readFileSync(CONFIG.comparisonPath, 'utf-8'));
    comparison.results.forEach(r => {
      const url = normalizeUrl(r.url);
      if (r.v7b && r.v7b.analysis) {
        comparisonMap.set(url, r.v7b.analysis);
      }
    });
    console.log(`\nLoaded ${comparisonMap.size} pre-analyzed entries from comparison`);
  } catch (e) {
    console.log('No comparison file found, will analyze all entries');
  }

  // Load review entries
  const reviewData = JSON.parse(fs.readFileSync(CONFIG.reviewPath, 'utf-8'));
  const entries = reviewData.entries;
  console.log(`Loaded ${entries.length} entries for review`);

  // Stats
  let preAnalyzed = 0;
  let newlyAnalyzed = 0;
  let failed = 0;

  // First pass: merge existing V7.B analysis from comparison
  for (const entry of entries) {
    const normalizedUrl = normalizeUrl(entry.url);
    const existingAnalysis = comparisonMap.get(normalizedUrl);

    if (existingAnalysis) {
      const parsed = parseV7BAnalysis(existingAnalysis);
      if (parsed) {
        entry.v7b_analysis = existingAnalysis;
        entry.observation = parsed.observation || entry.observation;
        entry.handling = parsed.handling || entry.handling;
        entry.mekanism = parsed.mekanism || entry.mekanism;
        entry.varfor = parsed.varfor || entry.varfor;
        entry.malgrupp = parsed.malgrupp || entry.malgrupp;
        entry.pre_analyzed = true;
        preAnalyzed++;
      }
    }
  }

  console.log(`\nMerged ${preAnalyzed} entries from comparison data`);

  // Find entries that still need analysis
  const needsAnalysis = entries.filter(e => !e.pre_analyzed && !e.v7b_analysis);
  console.log(`Entries needing V7.B analysis: ${needsAnalysis.length}`);

  if (needsAnalysis.length === 0) {
    console.log('\nAll entries already have V7.B analysis!');
  } else {
    console.log('\nStarting batch analysis...');
    console.log('(This will take ~' + Math.round(needsAnalysis.length * CONFIG.delayBetweenRequests / 60000) + ' minutes)\n');

    for (let i = 0; i < needsAnalysis.length; i++) {
      const entry = needsAnalysis[i];
      const progress = `[${i + 1}/${needsAnalysis.length}]`;

      console.log(`${progress} Analyzing: ${entry.url.substring(0, 50)}...`);

      const analysis = await analyzeWithV7B(entry.url);

      if (analysis) {
        const parsed = parseV7BAnalysis(analysis);
        if (parsed) {
          entry.v7b_analysis = analysis;
          entry.observation = parsed.observation || entry.observation;
          entry.handling = parsed.handling || entry.handling;
          entry.mekanism = parsed.mekanism || entry.mekanism;
          entry.varfor = parsed.varfor || entry.varfor;
          entry.malgrupp = parsed.malgrupp || entry.malgrupp;
          entry.pre_analyzed = true;
          newlyAnalyzed++;
          console.log(`  ✓ Done (${analysis.length} chars)`);
        }
      } else {
        failed++;
        console.log(`  ✗ Failed`);
      }

      // Save progress every 10 entries
      if ((i + 1) % 10 === 0) {
        reviewData.last_batch_update = new Date().toISOString();
        reviewData.batch_progress = { processed: i + 1, total: needsAnalysis.length };
        fs.writeFileSync(CONFIG.reviewPath, JSON.stringify(reviewData, null, 2));
        console.log(`  [Checkpoint saved]`);
      }

      // Delay before next request
      if (i < needsAnalysis.length - 1) {
        await delay(CONFIG.delayBetweenRequests);
      }
    }
  }

  // Final save
  reviewData.pre_analyzed_at = new Date().toISOString();
  reviewData.stats = {
    total: entries.length,
    pre_analyzed_from_comparison: preAnalyzed,
    newly_analyzed: newlyAnalyzed,
    failed: failed,
    ready_for_review: entries.filter(e => e.v7b_analysis).length
  };

  fs.writeFileSync(CONFIG.reviewPath, JSON.stringify(reviewData, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log('COMPLETE');
  console.log('='.repeat(60));
  console.log(`From comparison: ${preAnalyzed}`);
  console.log(`Newly analyzed: ${newlyAnalyzed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Ready for review: ${entries.filter(e => e.v7b_analysis).length}/${entries.length}`);
  console.log(`\nSaved to: ${CONFIG.reviewPath}`);
  console.log('\nOpen http://localhost:3000/gold-standard-review to start annotating!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
