/**
 * Export weak gold_standard entries for review/re-annotation
 */

const fs = require('fs');
const path = require('path');

const CONFIG = {
  goldStandardPath: path.join(__dirname, '../datasets/fine-tuning/gold_standard.jsonl'),
  outputPath: path.join(__dirname, '../datasets/fine-tuning/entries_for_review.json'),
};

function main() {
  const entries = fs.readFileSync(CONFIG.goldStandardPath, 'utf-8')
    .split('\n')
    .filter(l => l.trim())
    .map((l, i) => {
      try {
        const parsed = JSON.parse(l);
        parsed._lineNum = i + 1;
        return parsed;
      } catch (e) { return null; }
    })
    .filter(Boolean);

  // Filter TikTok entries
  const tiktok = entries.filter(e =>
    e.url && !e.url.startsWith('simpsons://') && e.url.includes('tiktok')
  );

  // Identify weak entries (Dec 22-23, short, no Observation)
  const weak = tiktok.filter(e => {
    const a = e.analysis || '';
    const date = e.timestamp?.split('T')[0];
    return (date === '2025-12-22' || date === '2025-12-23') &&
           a.length < 600 &&
           !a.includes('**Observation:**');
  });

  // Parse existing analysis into fields
  const forReview = weak.map(e => {
    const a = e.analysis || '';

    // Extract existing fields
    const handlingMatch = a.match(/\*\*Handling:\*\*\s*([^*]+?)(?=\*\*|$)/s);
    const mekanismMatch = a.match(/\*\*Mekanism:\*\*\s*([^*]+?)(?=\*\*|$)/s);
    const varforMatch = a.match(/\*\*Varför:\*\*\s*([^*]+?)(?=\*\*|$)/s);
    const malgrupMatch = a.match(/\*\*Målgrupp:\*\*\s*([^*]+?)(?=\*\*|$)/s);

    return {
      id: e._lineNum,
      url: e.url,
      timestamp: e.timestamp,
      source: e.source,
      original_analysis: e.analysis,
      // Editable fields
      observation: '', // New field to fill in
      handling: handlingMatch ? handlingMatch[1].trim() : '',
      mekanism: mekanismMatch ? mekanismMatch[1].trim() : '',
      varfor: varforMatch ? varforMatch[1].trim() : '',
      malgrupp: malgrupMatch ? malgrupMatch[1].trim() : '',
      // Status
      reviewed: false,
      edited_at: null
    };
  });

  // Save
  fs.writeFileSync(CONFIG.outputPath, JSON.stringify({
    exported_at: new Date().toISOString(),
    total_entries: forReview.length,
    entries: forReview
  }, null, 2));

  console.log('Exported', forReview.length, 'entries for review');
  console.log('Output:', CONFIG.outputPath);
}

main();
