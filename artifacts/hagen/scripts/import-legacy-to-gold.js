const fs = require('fs');
const path = require('path');

const CONFIG = {
  reviewPath: path.join(__dirname, '../datasets/fine-tuning/legacy_review.txt'),
  goldStandardPath: path.join(__dirname, '../datasets/fine-tuning/gold_standard.jsonl')
};

function main() {
  console.log('📥 Importing Legacy Review to Gold Standard...\n');

  if (!fs.existsSync(CONFIG.reviewPath)) {
    throw new Error('Review file not found.');
  }

  const content = fs.readFileSync(CONFIG.reviewPath, 'utf-8');
  const blocks = content.split('================================================================================');

  let count = 0;
  const newEntries = [];

  for (const block of blocks) {
    if (!block.trim()) continue;

    // Extract URL
    const urlMatch = block.match(/URL: (.*)/);
    if (!urlMatch) continue;
    const url = urlMatch[1].trim();

    // Extract Analysis
    const analysisMatch = block.split('[V3 ANALYSIS]:');
    if (analysisMatch.length < 2) continue;
    
    let analysis = analysisMatch[1].trim();
    
    // Clean up any trailing dashes or newlines
    analysis = analysis.replace(/^-+$/gm, '').trim();

    if (url && analysis) {
      newEntries.push({
        url: url,
        analysis: analysis,
        timestamp: new Date().toISOString(),
        source: 'legacy-review-v3'
      });
      count++;
    }
  }

  if (count === 0) {
    console.log('No valid entries found to import.');
    return;
  }

  // Append to Gold Standard
  const stream = fs.createWriteStream(CONFIG.goldStandardPath, { flags: 'a' });
  newEntries.forEach(entry => {
    stream.write(JSON.stringify(entry) + '\n');
  });
  stream.end();

  console.log(`✅ Successfully imported ${count} entries to Gold Standard.`);
  console.log(`   File: ${CONFIG.goldStandardPath}`);
}

main();
