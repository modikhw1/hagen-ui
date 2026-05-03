/**
 * Merge Annotated Simpsons Beats into Training Data
 *
 * Converts Simpsons scene annotations to match gold_standard.jsonl format,
 * then appends to the training dataset.
 *
 * Usage: node scripts/merge-simpsons-to-training.js
 */

const fs = require('fs');
const path = require('path');

const SIMPSONS_FILE = path.join(__dirname, '../datasets/fine-tuning/simpsons-annotated.jsonl');
const GOLD_FILE = path.join(__dirname, '../datasets/fine-tuning/gold_standard.jsonl');
const BACKUP_FILE = path.join(__dirname, '../datasets/fine-tuning/gold_standard.backup.jsonl');

// Map English mechanism names to Swedish
const MECHANISM_MAP = {
  timing: 'Timing, dramatisk paus',
  physical_comedy: 'Fysisk komedi, slapstick',
  reaction_shot: 'Reaktionsbild, ansiktsuttryck',
  callback: 'Callback, återkommande skämt',
  subversion: 'Subversion',
  contrast: 'Kontrast',
  sarcasm: 'Sarkasm, ironi',
  absurdism: 'Absurdism',
  escalation: 'Eskalering',
  wordplay: 'Ordvits'
};

function main() {
  console.log('Merge Simpsons to Training Data');
  console.log('================================\n');

  // Read Simpsons annotations
  if (!fs.existsSync(SIMPSONS_FILE)) {
    console.error('Error: Run annotate-simpsons-beats.js first');
    process.exit(1);
  }

  const simpsonsLines = fs.readFileSync(SIMPSONS_FILE, 'utf-8').trim().split('\n');
  const simpsonsBeats = simpsonsLines.map(l => JSON.parse(l));

  console.log(`Simpsons beats to merge: ${simpsonsBeats.length}`);

  // Read existing gold standard
  const goldLines = fs.readFileSync(GOLD_FILE, 'utf-8').trim().split('\n');
  const existingCount = goldLines.length;

  console.log(`Existing training examples: ${existingCount}`);

  // Backup existing file
  fs.copyFileSync(GOLD_FILE, BACKUP_FILE);
  console.log(`Backup saved to: ${BACKUP_FILE}`);

  // Convert Simpsons beats to gold standard format
  const converted = simpsonsBeats.map(beat => {
    const mechanisms = beat.mechanisms
      .map(m => MECHANISM_MAP[m] || m)
      .join(', ');

    // Format as the model expects
    const analysis = [
      `**Handling:** ${beat.action_line}`,
      `**Mekanism:** ${mechanisms}`,
      `**Varför:** ${beat.humor_explanation}`,
      `**Fokus:** ${beat.focus_element}`
    ].join('\n');

    return {
      url: `simpsons://${beat.episode}/${beat.scene.replace(/[^a-zA-Z0-9]/g, '_')}`,
      analysis: analysis,
      timestamp: new Date().toISOString(),
      source: 'simpsons-bridge',
      episode: beat.episode,
      title: beat.title
    };
  });

  // Append to gold standard
  const newLines = converted.map(c => JSON.stringify(c));
  fs.appendFileSync(GOLD_FILE, '\n' + newLines.join('\n'));

  // Verify
  const finalLines = fs.readFileSync(GOLD_FILE, 'utf-8').trim().split('\n');

  console.log('\n' + '='.repeat(50));
  console.log('RESULT');
  console.log('='.repeat(50));
  console.log(`\nBefore: ${existingCount} examples`);
  console.log(`Added:  ${converted.length} Simpsons beats`);
  console.log(`After:  ${finalLines.length} examples`);

  // Show sample
  console.log('\nSample merged entry:');
  console.log(JSON.stringify(converted[0], null, 2));

  console.log('\n→ Training data updated!');
  console.log('→ Run fine-tuning to train on expanded dataset');
}

main();
