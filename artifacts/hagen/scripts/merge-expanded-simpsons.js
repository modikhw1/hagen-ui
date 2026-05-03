/**
 * Merge Expanded Simpsons Beats (315) into Training Data
 *
 * Converts annotated Simpsons beats to gold_standard.jsonl format.
 * This is the v6 dataset expansion.
 *
 * Usage: node scripts/merge-expanded-simpsons.js
 */

const fs = require('fs');
const path = require('path');

const SIMPSONS_FILE = path.join(__dirname, '../datasets/fine-tuning/simpsons-expanded-annotated.jsonl');
const GOLD_FILE = path.join(__dirname, '../datasets/fine-tuning/gold_standard.jsonl');
const BACKUP_FILE = path.join(__dirname, '../datasets/fine-tuning/gold_standard.pre-v6.jsonl');

// Map category names to Swedish mechanism descriptions
const CATEGORY_TO_MECHANISM = {
  physical_commitment: 'Fysisk commitment, kroppsspråk',
  vocal_commitment: 'Vokal performance, ljuduttryck',
  direct_address: 'Direkt adress, blick mot kamera',
  deadpan_context: 'Deadpan leverans, torr humor',
  escalation: 'Eskalering, upptrappning',
  contrast: 'Kontrast, juxtaposition',
  absurd_visual: 'Absurdism, visuell absurditet',
  reaction_shot: 'Reaktionsbild, ansiktsuttryck',
  timing_beat: 'Timing, komisk paus'
};

function main() {
  console.log('Merge Expanded Simpsons for V6 Training');
  console.log('========================================\n');

  // Check if annotation is complete
  if (!fs.existsSync(SIMPSONS_FILE)) {
    console.error('Error: Annotation not complete. Run annotate-expanded-simpsons.js first.');
    process.exit(1);
  }

  // Read Simpsons annotations
  const simpsonsLines = fs.readFileSync(SIMPSONS_FILE, 'utf-8').trim().split('\n');
  const simpsonsBeats = simpsonsLines.map(l => JSON.parse(l));

  console.log(`Expanded Simpsons beats to merge: ${simpsonsBeats.length}`);

  // Read existing gold standard
  const goldLines = fs.readFileSync(GOLD_FILE, 'utf-8').trim().split('\n');
  const existingCount = goldLines.length;

  // Count existing Simpsons entries
  const existingSimpsons = goldLines.filter(l => l.includes('simpsons://')).length;

  console.log(`Existing training examples: ${existingCount}`);
  console.log(`Existing Simpsons entries: ${existingSimpsons}`);

  // Backup existing file
  fs.copyFileSync(GOLD_FILE, BACKUP_FILE);
  console.log(`Backup saved to: ${BACKUP_FILE}`);

  // Convert Simpsons beats to gold standard format
  const converted = simpsonsBeats.map(beat => {
    const mechanism = CATEGORY_TO_MECHANISM[beat.category] || beat.category;

    // Format analysis in the standard format
    const analysis = [
      `**Handling:** ${beat.action_line}`,
      `**Mekanism:** ${mechanism}`,
      `**Varför:** ${beat.humor_explanation}`,
      `**Fokus:** ${beat.focus_element}`
    ].join('\n');

    // Create unique URL for this beat
    const sceneSlug = beat.scene.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
    const uniqueId = `${beat.episode}_${beat.category}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    return {
      url: `simpsons://${beat.episode}/${sceneSlug}_${uniqueId}`,
      analysis: analysis,
      timestamp: new Date().toISOString(),
      source: 'simpsons-expanded-v6',
      episode: beat.episode,
      title: beat.title,
      category: beat.category
    };
  });

  // Append to gold standard
  const newLines = converted.map(c => JSON.stringify(c));
  fs.appendFileSync(GOLD_FILE, '\n' + newLines.join('\n'));

  // Verify
  const finalLines = fs.readFileSync(GOLD_FILE, 'utf-8').trim().split('\n').filter(l => l.trim());

  console.log('\n' + '='.repeat(50));
  console.log('RESULT');
  console.log('='.repeat(50));
  console.log(`\nBefore: ${existingCount} examples`);
  console.log(`Added:  ${converted.length} expanded Simpsons beats`);
  console.log(`After:  ${finalLines.length} examples`);

  // Category distribution
  const byCat = {};
  converted.forEach(c => {
    byCat[c.category] = (byCat[c.category] || 0) + 1;
  });

  console.log('\nBy category:');
  Object.entries(byCat).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
    console.log(`  ${cat.padEnd(22)} ${count}`);
  });

  // Total Simpsons now
  const totalSimpsons = existingSimpsons + converted.length;
  console.log(`\nTotal Simpsons examples: ${totalSimpsons}`);
  console.log(`Total TikTok examples: ${finalLines.length - totalSimpsons}`);

  console.log('\n→ Training data updated for v6!');
  console.log('→ Run: node scripts/prepare-mixed-training.js');
  console.log('→ Then: node scripts/fine-tune-gemini.js train');
}

main();
